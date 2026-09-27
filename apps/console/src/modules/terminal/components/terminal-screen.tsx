import { useMatch, useNavigate } from "@solidjs/router";
import type { JSX } from "@solidjs/web";
import { createEffect, createMemo, createSignal, For, onSettled, Show, untrack } from "solid-js";

import { workspaceHref } from "@/lib/active-workspace";
import { useAuth } from "@/modules/auth";
import { environmentsStore, placementsStore } from "@/modules/environments";
import { useWorkspace } from "@/modules/projects";
import { ShellSlot, useShell } from "@/modules/shell";
import {
	Alert,
	Banner,
	Button,
	CheckIcon,
	ChevronDownIcon,
	EmptyState,
	GlobeIcon,
	HeaderTabs,
	IconButton,
	iconButton,
	Menu,
	type MenuGroup,
	menuTrigger,
	PlusIcon,
	Row,
	Skeleton,
	Stack,
	StatusDot,
	TerminalIcon,
	Text,
} from "@/kit";

import { type Modifiers, NO_MODIFIERS } from "../lib/keys";
import type { ConnectionState } from "../lib/terminal-socket";
import { forgetScreen, preloadScreens } from "../lib/screen-cache";
import { RunnerError, terminalsService } from "../services/terminals.service";
import type { TerminalInfo } from "../types/terminal.types";

import { KeyBar } from "./key-bar";
import { type TerminalHandle, TerminalView } from "./terminal-view";

const FONT_SIZE_KEY = "grid.terminal.fontSize";
const FONT_SIZES = { min: 9, max: 22 } as const;

function initialFontSize(): number {
	try {
		const saved = Number(localStorage.getItem(FONT_SIZE_KEY));
		if (saved >= FONT_SIZES.min && saved <= FONT_SIZES.max) return saved;
	} catch {
		// Storage can be unavailable (private mode); the default is fine.
	}
	return matchMedia("(pointer: coarse)").matches ? 12 : 13;
}

// The "new terminal" menu's entry for this machine, beside each environment's id.
const THIS_MACHINE = "this-machine";

// A first guess at the size of a new terminal; the view corrects it as soon as it measures.
const DEFAULT_SIZE = { cols: 80, rows: 24 };

type Load = { status: "loading" } | { status: "ready" } | { status: "error"; message: string };

/**
 * Terminals: tabs of shells running on the machine, each a live view. Opening the screen with no
 * terminal starts one, so a shell is always one tap away. The screen fills exactly the visible
 * viewport — including above a phone's on-screen keyboard — so the prompt never hides under it.
 */
export function TerminalScreen(): JSX.Element {
	const auth = useAuth();
	const workspace = useWorkspace();
	const shell = useShell();
	const navigate = useNavigate();
	const match = useMatch(() => "/terminal/:id");
	const routeId = createMemo(() => match()?.params.id ?? null);

	const [terminals, setTerminals] = createSignal<TerminalInfo[]>([]);
	const [load, setLoad] = createSignal<Load>({ status: "loading" });
	const [titles, setTitles] = createSignal<Record<string, string>>({});
	const [states, setStates] = createSignal<Record<string, ConnectionState>>({});
	const [modifiers, setModifiers] = createSignal<Modifiers>(NO_MODIFIERS);
	const [fontSize, setFontSize] = createSignal(initialFontSize());
	const [busy, setBusy] = createSignal(false);
	// Plain maps: handles are imperative objects, not state to render.
	const handles = new Map<string, TerminalHandle>();
	// Armed modifiers are read by the terminal on the very next key, before signals settle.
	let armed: Modifiers = NO_MODIFIERS;

	const activeId = createMemo(() => {
		const list = terminals();
		const id = routeId();
		return list.some((terminal) => terminal.id === id) ? id : (list[0]?.id ?? null);
	});
	const errorMessage = createMemo(() => {
		const current = load();
		return current.status === "error" ? current.message : null;
	});
	const activeState = createMemo(() => {
		const id = activeId();
		return id ? states()[id] : undefined;
	});

	function titleOf(terminal: TerminalInfo): string {
		return titles()[terminal.id] ?? terminal.title;
	}

	async function refresh(): Promise<TerminalInfo[] | null> {
		const token = auth.token();
		if (!token) return null;
		try {
			const here = await terminalsService.list(token);
			// Each environment's shells too. One that cannot be reached right now just shows none;
			// its tabs come back on the next refresh.
			await environmentsStore.load(token);
			const away = await Promise.all(
				environmentsStore
					.environments()
					.map((environment) =>
						terminalsService.list(token, environment.id).catch(() => [] as TerminalInfo[]),
					),
			);
			const list = [...here, ...away.flat()];
			// Each terminal's screen as this device last saw it, ready before its view opens.
			await preloadScreens(list.map((terminal) => terminal.id));
			setTerminals(list);
			setLoad({ status: "ready" });
			return list;
		} catch (cause) {
			setLoad({ status: "error", message: describe(cause) });
			return null;
		}
	}

	/**
	 * Open a shell. Left unsaid, it opens where the current project runs, in its folder: on this
	 * machine or on the environment holding the folder. `null` is this machine, explicitly.
	 */
	async function openTerminal(machine?: string | null): Promise<void> {
		const token = auth.token();
		if (!token || busy()) return;
		setBusy(true);
		try {
			const slug = untrack(workspace.currentSlug);
			const home = untrack(() => placementsStore.environmentOf(slug));
			const environment = (machine === undefined ? home : machine) ?? undefined;
			// The project's folder is a path on the machine it runs on; elsewhere, that machine's
			// own default folder.
			const cwd =
				slug && (environment ?? null) === home ? untrack(workspace.folders)[slug] : undefined;
			const info = await terminalsService.open(token, DEFAULT_SIZE, cwd, environment);
			setTerminals((list) => [...list, info]);
			navigate(`/terminal/${info.id}`);
		} catch (cause) {
			setLoad({ status: "error", message: describe(cause) });
		} finally {
			setBusy(false);
		}
	}

	async function closeTerminal(id: string): Promise<void> {
		const token = auth.token();
		if (!token) return;
		const list = terminals();
		const index = list.findIndex((terminal) => terminal.id === id);
		const environment = list[index]?.environment;
		const next = list[index + 1] ?? list[index - 1] ?? null;
		setTerminals(list.filter((terminal) => terminal.id !== id));
		handles.delete(id);
		forgetScreen(id);
		if (activeId() === id) navigate(next ? `/terminal/${next.id}` : "/terminal", { replace: true });
		await terminalsService.close(token, id, environment).catch((cause: unknown) => {
			// Already gone on the runner is the outcome we wanted.
			if (!(cause instanceof RunnerError && cause.status === 404)) {
				setLoad({ status: "error", message: describe(cause) });
			}
		});
	}

	async function restartActiveTerminal(): Promise<void> {
		const token = auth.token();
		const currentId = activeId();
		if (!token || !currentId || busy()) return;
		const currentTerminal = terminals().find((terminal) => terminal.id === currentId);
		const cwd = currentTerminal?.cwd;
		setBusy(true);
		try {
			const environment = currentTerminal?.environment;
			const info = await terminalsService.open(token, DEFAULT_SIZE, cwd, environment);
			setTerminals((list) => list.map((terminal) => (terminal.id === currentId ? info : terminal)));
			handles.delete(currentId);
			setStates((all) => {
				const next = { ...all };
				delete next[currentId];
				return next;
			});
			setTitles((all) => {
				const next = { ...all };
				delete next[currentId];
				return next;
			});
			navigate(`/terminal/${info.id}`, { replace: true });
			void terminalsService.close(token, currentId, environment).catch(() => {});
			forgetScreen(currentId);
		} catch (cause) {
			setLoad({ status: "error", message: describe(cause) });
		} finally {
			setBusy(false);
		}
	}

	function setArmed(next: Modifiers): void {
		armed = next;
		setModifiers(next);
	}

	function takeModifiers(): Modifiers {
		const current = armed;
		if (current.ctrl || current.alt || current.shift) setArmed(NO_MODIFIERS);
		return current;
	}

	function changeFontSize(delta: number): void {
		const size = Math.min(FONT_SIZES.max, Math.max(FONT_SIZES.min, fontSize() + delta));
		setFontSize(size);
		try {
			localStorage.setItem(FONT_SIZE_KEY, String(size));
		} catch {
			// Not remembered this time; the size still applies.
		}
	}

	async function paste(): Promise<void> {
		const handle = activeId() ? handles.get(activeId() ?? "") : undefined;
		if (!handle) return;
		try {
			handle.paste(await navigator.clipboard.readText());
		} catch {
			// Clipboard read was refused; the system paste menu still works in the terminal.
		}
	}

	// First visit with nothing open: start a shell right away.
	onSettled(() => {
		// Opening the app, the session may still be being confirmed: wait for it.
		void auth
			.waitForToken()
			.then(() => refresh())
			.then((list) => {
				if (list && list.length === 0) void openTerminal();
			});
	});

	// Keep the URL on a terminal that exists, so reloads and shared links land somewhere real.
	createEffect(
		() => [routeId(), activeId(), load().status] as const,
		([route, active, status]) => {
			if (status === "ready" && active && route !== active) {
				navigate(`/terminal/${active}`, { replace: true });
			}
		},
	);

	/** Where a terminal runs, or that it ended, beside its name. */
	function badgeOf(terminal: TerminalInfo): string | undefined {
		if (states()[terminal.id] === "gone") return "ended";
		return environmentsStore.labelOf(terminal.environment) ?? undefined;
	}

	const newTerminal = () => (
		<NewTerminal
			busy={busy()}
			environments={environmentsStore.environments()}
			onOpen={(machine) => void openTerminal(machine)}
		/>
	);

	return (
		<div class="flex min-h-0 flex-1 flex-col overflow-hidden">
			{/* The terminals are the title bar's tabs, as threads are; phones switch from the title. */}
			<ShellSlot name="tabs">
				<Show
					when={shell.desktop()}
					fallback={
						<TerminalSwitcher
							terminals={terminals()}
							activeId={activeId()}
							titleOf={titleOf}
							stateOf={(id) => states()[id]}
							environments={environmentsStore.environments()}
							onPick={(id) => navigate(`/terminal/${id}`)}
							onOpen={(machine) => void openTerminal(machine)}
							onClose={(id) => void closeTerminal(id)}
						/>
					}
				>
					<Row gap={1} class="min-w-0 flex-1">
						<HeaderTabs
							tabs={terminals().map((terminal) => ({
								id: terminal.id,
								label: titleOf(terminal),
								href: workspaceHref(`/terminal/${terminal.id}`),
								icon: (
									<StatusDot
										size="sm"
										status={dotOf(states()[terminal.id], terminal.exitCode !== null)}
									/>
								),
								badge: badgeOf(terminal),
							}))}
							current={activeId()}
							onClose={(id) => void closeTerminal(id)}
							newAction={newTerminal()}
						/>
						<IconButton size="sm" label="Smaller text" onClick={() => changeFontSize(-1)}>
							<span class="font-mono text-caption">A−</span>
						</IconButton>
						<IconButton size="sm" label="Larger text" onClick={() => changeFontSize(1)}>
							<span class="font-mono text-body">A+</span>
						</IconButton>
					</Row>
				</Show>
			</ShellSlot>

			<Show when={errorMessage()}>
				{(message) => (
					<div class="shrink-0 p-2">
						<Alert
							tone="danger"
							title={message()}
							action={
								<Button size="sm" onClick={() => void refresh()}>
									Try again
								</Button>
							}
						/>
					</div>
				)}
			</Show>

			<Show when={activeState() === "reconnecting" || activeState() === "signed-out"}>
				<Banner tone="quiet">
					{activeState() === "reconnecting"
						? "Connection lost — reconnecting…"
						: "Your session ended. Sign in again to keep using the terminal."}
				</Banner>
			</Show>

			<Show when={activeState() === "gone"}>
				<Banner
					tone="quiet"
					action={
						<Row gap={2}>
							<Button size="sm" variant="primary" onClick={() => void restartActiveTerminal()}>
								Start again
							</Button>
							<Button
								size="sm"
								onClick={() => {
									const id = activeId();
									if (id) void closeTerminal(id);
								}}
							>
								Close
							</Button>
						</Row>
					}
				>
					This terminal ended — its shell exited or the runner restarted.
				</Banner>
			</Show>

			<div class="relative min-h-0 flex-1 bg-surface">
				<Show when={load().status === "loading"}>
					<Stack gap={2} class="p-3">
						<Skeleton class="h-3 w-2/3" />
						<Skeleton class="h-3 w-1/2" />
					</Stack>
				</Show>
				<Show when={load().status === "ready" && terminals().length === 0 && !busy()}>
					<div class="grid h-full place-items-center">
						<EmptyState
							icon={<TerminalIcon size="lg" />}
							title="No terminal is open"
							action={
								<Button variant="primary" onClick={() => void openTerminal()}>
									New terminal
								</Button>
							}
						/>
					</div>
				</Show>
				<For each={terminals()}>
					{(terminal) => (
						<div class="absolute inset-0" hidden={activeId() !== terminal.id}>
							<TerminalView
								id={terminal.id}
								environment={terminal.environment}
								active={activeId() === terminal.id}
								fontSize={fontSize()}
								takeModifiers={takeModifiers}
								onFontSizeChange={changeFontSize}
								onHandle={(handle) => handles.set(terminal.id, handle)}
								onState={(state) => setStates((all) => ({ ...all, [terminal.id]: state }))}
								onTitle={(title) => setTitles((all) => ({ ...all, [terminal.id]: title }))}
							/>
						</div>
					)}
				</For>
			</div>

			<KeyBar
				modifiers={modifiers()}
				onToggle={(modifier) => setArmed({ ...armed, [modifier]: !armed[modifier] })}
				onSend={(data) => {
					const handle = handles.get(activeId() ?? "");
					handle?.send(data);
				}}
				onArrow={(arrow) => handles.get(activeId() ?? "")?.arrow(arrow)}
				onPaste={() => void paste()}
				dictationTarget={() => {
					const handle = handles.get(activeId() ?? "");
					// No focus hand-back: dictating should not pop the phone keyboard up.
					return handle
						? { insert: handle.paste, focus: () => {}, label: "Terminal", floatingMic: false }
						: null;
				}}
			/>
		</div>
	);
}

/** A terminal's connection as a dot: live, on its way, or finished. */
function dotOf(state: ConnectionState | undefined, exited: boolean): "online" | "busy" | "offline" {
	if (exited || state === "exited" || state === "gone") return "offline";
	return state === "open" ? "online" : "busy";
}

type Environment = { id: string; label: string };

function newTerminalGroups(environments: readonly Environment[]): MenuGroup[] {
	return [
		{
			label: "New terminal on",
			items: [
				{ id: THIS_MACHINE, label: "This machine", icon: <TerminalIcon size="sm" /> },
				...environments.map((environment) => ({
					id: environment.id,
					label: environment.label,
					icon: <GlobeIcon size="sm" />,
				})),
			],
		},
	];
}

/** The plus after the tabs: a new shell here, or a menu of machines once there are others. */
function NewTerminal(props: {
	busy: boolean;
	environments: readonly Environment[];
	onOpen: (machine?: string | null) => void;
}): JSX.Element {
	return (
		<Show
			when={props.environments.length > 0}
			fallback={
				<IconButton
					size="sm"
					label="New terminal"
					disabled={props.busy}
					onClick={() => props.onOpen()}
				>
					<PlusIcon size="sm" />
				</IconButton>
			}
		>
			<Menu
				label="New terminal on…"
				trigger={<PlusIcon size="sm" />}
				triggerClass={iconButton({ size: "sm" })}
				groups={newTerminalGroups(props.environments)}
				onSelect={(id) => props.onOpen(id === THIS_MACHINE ? null : id)}
			/>
		</Show>
	);
}

/**
 * Phones: the title bar names the terminal showing, and tapping it lists the others, a new one
 * and closing this one — tabs would not fit.
 */
function TerminalSwitcher(props: {
	terminals: readonly TerminalInfo[];
	activeId: string | null;
	titleOf: (terminal: TerminalInfo) => string;
	stateOf: (id: string) => ConnectionState | undefined;
	environments: readonly Environment[];
	onPick: (id: string) => void;
	onOpen: (machine?: string | null) => void;
	onClose: (id: string) => void;
}): JSX.Element {
	const active = () => props.terminals.find((terminal) => terminal.id === props.activeId);
	const groups = (): MenuGroup[] => [
		...(props.terminals.length > 0
			? [
					{
						label: "Terminals",
						items: props.terminals.map((terminal) => ({
							id: `open:${terminal.id}`,
							label: props.titleOf(terminal),
							icon: (
								<StatusDot
									size="sm"
									status={dotOf(props.stateOf(terminal.id), terminal.exitCode !== null)}
								/>
							),
							trailing: terminal.id === props.activeId ? <CheckIcon size="sm" /> : undefined,
						})),
					},
				]
			: []),
		...newTerminalGroups(props.environments),
		...(props.activeId
			? [{ items: [{ id: "close", label: "Close this terminal", danger: true }] }]
			: []),
	];
	return (
		<Menu
			label="Terminals"
			triggerClass={menuTrigger({})}
			trigger={
				<>
					<Text as="span" tone="strong" weight="medium" truncate>
						{active() ? props.titleOf(active() as TerminalInfo) : "Terminal"}
					</Text>
					<ChevronDownIcon size="xs" class="text-fg-faint" />
				</>
			}
			groups={groups()}
			onSelect={(id) => {
				if (id.startsWith("open:")) props.onPick(id.slice(5));
				else if (id === "close") {
					if (props.activeId) props.onClose(props.activeId);
				} else props.onOpen(id === THIS_MACHINE ? null : id);
			}}
		/>
	);
}

function describe(cause: unknown): string {
	if (cause instanceof RunnerError && cause.status === 0) {
		return "The terminal service isn't running on this machine. Start it with: bun --cwd=apps/runner run dev";
	}
	return cause instanceof Error ? cause.message : "Something went wrong with the terminal.";
}
