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
	BackIcon,
	Banner,
	Button,
	button,
	EmptyState,
	GlobeIcon,
	IconButton,
	iconButton,
	Menu,
	type MenuGroup,
	MoreIcon,
	PlusIcon,
	Row,
	Skeleton,
	Stack,
	TerminalBranch,
	TerminalFrame,
	TerminalGroupLabel,
	TerminalIcon,
	TerminalPanelRow,
	TerminalSessionCard,
	TerminalStatusLine,
	type TerminalTab,
	TerminalTabs,
	Text,
} from "@/kit";

import { type Modifiers, NO_MODIFIERS } from "../lib/keys";
import { FONT_SIZE_KEY, FONT_SIZES, initialFontSize } from "../lib/font-size";
import type { ConnectionState } from "../lib/terminal-socket";
import { forgetScreen, preloadScreens } from "../lib/screen-cache";
import { detailOf, stateOf, whereOf } from "../lib/terminal-look";
import { RunnerError, terminalsService } from "../services/terminals.service";
import type { TerminalInfo } from "../types/terminal.types";

import { KeyBar } from "./key-bar";
import { type TerminalHandle, TerminalView } from "./terminal-view";

// The "new terminal" menu's entry for this machine, beside each environment's id.
const THIS_MACHINE = "this-machine";

/** How often the panel looks again at what each terminal is doing. */
const STATUS_EVERY_MS = 4000;

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
			const here = await terminalsService.list(token, undefined, true);
			// Each environment's shells too. One that cannot be reached right now just shows none;
			// its tabs come back on the next refresh.
			await environmentsStore.load(token);
			const away = await Promise.all(
				environmentsStore
					.environments()
					.map((environment) =>
						terminalsService.list(token, environment.id, true).catch(() => [] as TerminalInfo[]),
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

	// First visit with nothing open: start a shell right away on desktop (phones list them first).
	onSettled(() => {
		// Opening the app, the session may still be being confirmed: wait for it.
		void auth
			.waitForToken()
			.then(() => refresh())
			.then((list) => {
				if (list && list.length === 0 && untrack(shell.desktop)) void openTerminal();
			});
		// What each one is doing moves on its own (a server starts, a test run ends): look again
		// every few seconds while the screen is in front of someone.
		const timer = setInterval(() => {
			if (document.visibilityState === "visible" && untrack(load).status === "ready")
				void refresh();
		}, STATUS_EVERY_MS);
		return () => clearInterval(timer);
	});

	// Keep the URL on a terminal that exists, so reloads and shared links land somewhere real.
	createEffect(
		() => [routeId(), activeId(), load().status] as const,
		([route, active, status]) => {
			// Phones keep the list at /terminal; a terminal opens from it.
			if (status === "ready" && active && route !== active && (route || untrack(shell.desktop))) {
				navigate(`/terminal/${active}`, { replace: true });
			}
		},
	);

	/** The machine a terminal runs on, by name. */
	const machineOf = (terminal: TerminalInfo) =>
		environmentsStore.labelOf(terminal.environment) ?? "This machine";
	const ended = (terminal: TerminalInfo) =>
		terminal.exitCode !== null || states()[terminal.id] === "gone";
	/** Shells still running, by the machine they run on. */
	const groups = createMemo(() => {
		const byMachine = new Map<string, TerminalInfo[]>();
		for (const terminal of terminals()) {
			if (ended(terminal)) continue;
			const machine = machineOf(terminal);
			byMachine.set(machine, [...(byMachine.get(machine) ?? []), terminal]);
		}
		return [...byMachine.entries()];
	});
	const recent = createMemo(() =>
		terminals()
			.filter(ended)
			.sort((a, b) => (b.endedAt ?? "").localeCompare(a.endedAt ?? "")),
	);
	const active = () => terminals().find((terminal) => terminal.id === activeId()) ?? null;
	/** A terminal's state, counting a lost shell as ended. */
	const look = (terminal: TerminalInfo) =>
		states()[terminal.id] === "gone" && terminal.exitCode === null ? "failed" : stateOf(terminal);
	const tabs = (): TerminalTab[] =>
		terminals().map((terminal) => ({
			id: terminal.id,
			label: titleOf(terminal),
			href: workspaceHref(`/terminal/${terminal.id}`),
			state: look(terminal),
		}));
	/** Where the showing terminal is: its machine, folder and branch. */
	const where = () => {
		const current = active();
		if (!current) return undefined;
		return (
			<>
				<span class="truncate">{machineOf(current)}</span>
				<span class="truncate">{whereOf(current)}</span>
				<Show when={current.status?.branch}>
					{(branch) => <TerminalBranch name={branch()} ahead={current.status?.ahead} />}
				</Show>
			</>
		);
	};
	/** On phones the list is the screen until a terminal is opened from it. */
	const listing = () => !shell.desktop() && !routeId();

	const newTerminal = (labelled = false) => (
		<NewTerminal
			busy={busy()}
			labelled={labelled}
			environments={environmentsStore.environments()}
			onOpen={(machine) => void openTerminal(machine)}
		/>
	);
	const terminalMenu = (phone: boolean) => (
		<Menu
			label="Terminal"
			title={phone ? "Terminal" : undefined}
			trigger={<MoreIcon />}
			triggerClass={
				phone
					? iconButton({ size: "lg", shape: "round", variant: "secondary" })
					: iconButton({ size: "sm" })
			}
			placement="bottom-end"
			groups={[
				...(phone ? newTerminalGroups(environmentsStore.environments()) : []),
				{
					items: [
						{ id: "smaller", label: "Smaller text" },
						{ id: "larger", label: "Larger text" },
					],
				},
				...(activeId()
					? [{ items: [{ id: "close", label: "Close this terminal", danger: true }] }]
					: []),
			]}
			onSelect={(id) => {
				if (id === "smaller") changeFontSize(-1);
				else if (id === "larger") changeFontSize(1);
				else if (id === "close") {
					const current = activeId();
					if (current) void closeTerminal(current);
				} else void openTerminal(id === THIS_MACHINE ? null : id);
			}}
		/>
	);

	return (
		<div class="flex min-h-0 flex-1 flex-col overflow-hidden">
			<ShellSlot name="crumb">
				{active() ? titleOf(active() as TerminalInfo) : "Terminals"}
			</ShellSlot>
			<ShellSlot name="actions">
				<Show when={shell.desktop()}>
					{newTerminal(true)}
					{terminalMenu(false)}
				</Show>
			</ShellSlot>
			<ShellSlot name="panelActions">{newTerminal()}</ShellSlot>
			{/* The panel: the shells on each machine, then the ones that ended. */}
			<ShellSlot name="panel">
				<For each={groups()} keyed={([machine]) => machine}>
					{(group) => (
						<div class="flex flex-col">
							<TerminalGroupLabel>{group()[0]}</TerminalGroupLabel>
							<For each={group()[1]} keyed={(terminal) => terminal.id}>
								{(terminal) => (
									<TerminalPanelRow
										href={workspaceHref(`/terminal/${terminal().id}`)}
										title={titleOf(terminal())}
										detail={detailOf(terminal())}
										state={look(terminal())}
										current={activeId() === terminal().id}
									/>
								)}
							</For>
						</div>
					)}
				</For>
				<Show when={recent().length}>
					<div class="flex flex-col">
						<TerminalGroupLabel>Recent</TerminalGroupLabel>
						<For each={recent()} keyed={(terminal) => terminal.id}>
							{(terminal) => (
								<TerminalPanelRow
									href={workspaceHref(`/terminal/${terminal().id}`)}
									title={titleOf(terminal())}
									detail={
										states()[terminal().id] === "gone" && terminal().exitCode === null
											? "ended"
											: detailOf(terminal())
									}
									state={look(terminal())}
									ended
									current={activeId() === terminal().id}
								/>
							)}
						</For>
					</div>
				</Show>
				<Show when={load().status === "ready" && terminals().length === 0}>
					<Text size="caption" tone="subtle" class="px-2 py-2">
						No terminal is open.
					</Text>
				</Show>
			</ShellSlot>
			<ShellSlot name="heading">
				<div class="flex min-w-0 flex-col items-center">
					<Text as="h1" tone="strong" weight="medium" size="body-lg" truncate>
						{listing() || !active() ? "Terminals" : titleOf(active() as TerminalInfo)}
					</Text>
					<Text size="caption" tone="subtle" truncate>
						{listing() || !active()
							? `${terminals().filter((terminal) => !ended(terminal)).length} open`
							: `${machineOf(active() as TerminalInfo)} · ${whereOf(active() as TerminalInfo)}`}
					</Text>
				</div>
			</ShellSlot>
			<Show when={!listing()}>
				<ShellSlot name="leading">
					<IconButton
						label="All terminals"
						variant="secondary"
						shape="round"
						size="lg"
						onClick={() => navigate("/terminal")}
					>
						<BackIcon />
					</IconButton>
				</ShellSlot>
			</Show>
			<ShellSlot name="trailing">
				<Show when={listing()} fallback={terminalMenu(true)}>
					<IconButton
						label="New terminal"
						variant="secondary"
						shape="round"
						size="lg"
						disabled={busy()}
						onClick={() => void openTerminal()}
					>
						<PlusIcon />
					</IconButton>
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

			<Show
				when={!listing() && (activeState() === "reconnecting" || activeState() === "signed-out")}
			>
				<Banner tone="quiet">
					{activeState() === "reconnecting"
						? "Connection lost — reconnecting…"
						: "Your session ended. Sign in again to keep using the terminal."}
				</Banner>
			</Show>

			<Show when={!listing() && activeState() === "gone"}>
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

			{/* Phones: each terminal as a card of its last lines; one opens it. */}
			<Show when={listing()}>
				<div class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pt-2 pb-4">
					<Show
						when={load().status !== "loading"}
						fallback={
							<Stack gap={2}>
								<Skeleton class="h-28" />
								<Skeleton class="h-28" />
							</Stack>
						}
					>
						<Show
							when={terminals().length}
							fallback={
								<EmptyState
									icon={<TerminalIcon size="lg" />}
									title="No terminal is open"
									action={
										<Button size="sm" variant="primary" onClick={() => void openTerminal()}>
											New terminal
										</Button>
									}
								/>
							}
						>
							<Stack gap={2}>
								<For each={terminals()} keyed={(terminal) => terminal.id}>
									{(terminal) => (
										<TerminalSessionCard
											href={workspaceHref(`/terminal/${terminal().id}`)}
											title={titleOf(terminal())}
											detail={detailOf(terminal())}
											state={look(terminal())}
											lines={terminal().status?.preview ?? []}
										/>
									)}
								</For>
							</Stack>
						</Show>
					</Show>
				</div>
			</Show>

			<TerminalFrame hidden={listing()}>
				<Show when={terminals().length}>
					<TerminalTabs
						tabs={tabs()}
						current={activeId()}
						onClose={(id) => void closeTerminal(id)}
						where={where()}
					/>
				</Show>
				<div class="relative min-h-0 flex-1">
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
									<Button size="sm" variant="primary" onClick={() => void openTerminal()}>
										New terminal
									</Button>
								}
							/>
						</div>
					</Show>
					{/* Phones mount the terminals once one is opened from the list: xterm opened inside a
					    hidden frame measures nothing and draws nothing. The screen cache redraws it. */}
					<For each={listing() ? [] : terminals()} keyed={(terminal) => terminal.id}>
						{(terminal) => (
							<div class="absolute inset-0" hidden={activeId() !== terminal().id}>
								<TerminalView
									id={terminal().id}
									environment={terminal().environment}
									active={!listing() && activeId() === terminal().id}
									fontSize={fontSize()}
									takeModifiers={takeModifiers}
									onFontSizeChange={changeFontSize}
									onHandle={(handle) => handles.set(terminal().id, handle)}
									onState={(state) => setStates((all) => ({ ...all, [terminal().id]: state }))}
									onTitle={(title) => setTitles((all) => ({ ...all, [terminal().id]: title }))}
								/>
							</div>
						)}
					</For>
				</div>
				{/* Phones: the branch and what the terminal is doing, under it. */}
				<Show when={!shell.desktop() ? active() : null}>
					{(current) => (
						<TerminalStatusLine
							state={look(current())}
							start={
								<Show when={current().status?.branch}>
									{(branch) => <TerminalBranch name={branch()} ahead={current().status?.ahead} />}
								</Show>
							}
							end={detailOf(current())}
						/>
					)}
				</Show>
			</TerminalFrame>

			<Show when={!listing()}>
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
			</Show>
		</div>
	);
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
	/** "New tab" in words (the top bar), not just a plus (the panel). */
	labelled?: boolean;
	environments: readonly Environment[];
	onOpen: (machine?: string | null) => void;
}): JSX.Element {
	return (
		<Show
			when={props.environments.length > 0}
			fallback={
				<Show
					when={props.labelled}
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
					<Button
						size="sm"
						icon={<PlusIcon size="sm" />}
						disabled={props.busy}
						onClick={() => props.onOpen()}
					>
						New tab
					</Button>
				</Show>
			}
		>
			<Menu
				label="New terminal on…"
				trigger={
					props.labelled ? (
						<>
							<PlusIcon size="sm" />
							New tab
						</>
					) : (
						<PlusIcon size="sm" />
					)
				}
				triggerClass={props.labelled ? button({ size: "sm" }) : iconButton({ size: "sm" })}
				groups={newTerminalGroups(props.environments)}
				onSelect={(id) => props.onOpen(id === THIS_MACHINE ? null : id)}
			/>
		</Show>
	);
}

function describe(cause: unknown): string {
	if (cause instanceof RunnerError && cause.status === 0) {
		return "The terminal service isn't running on this machine. Start it with: bun --cwd=apps/runner run dev";
	}
	return cause instanceof Error ? cause.message : "Something went wrong with the terminal.";
}
