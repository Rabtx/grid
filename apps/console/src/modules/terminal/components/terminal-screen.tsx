import { useMatch, useNavigate } from "@solidjs/router";
import type { JSX } from "@solidjs/web";
import { createEffect, createMemo, createSignal, For, onSettled, Show, untrack } from "solid-js";

import { workspaceHref } from "@/lib/active-workspace";
import { useAuth } from "@/modules/auth";
import { environmentsStore, placementsStore } from "@/modules/environments";
import { useWorkspace } from "@/modules/projects";
import {
	Button,
	CloseIcon,
	ErrorNotice,
	GlobeIcon,
	IconButton,
	Menu,
	PlusIcon,
	Skeleton,
	TerminalIcon,
} from "@/ui";

import { type Modifiers, NO_MODIFIERS } from "../lib/keys";
import type { InteractiveCliEvent } from "../lib/interactive-cli-event";
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
	const [cliView, setCliView] = createSignal<"screen" | "terminal">("screen");
	const [cliScreens, setCliScreens] = createSignal<Record<string, string>>({});
	const [cliInteractions, setCliInteractions] = createSignal<Record<string, InteractiveCliEvent>>(
		{},
	);
	const [cliAds, setCliAds] = createSignal<Record<string, string[]>>({});
	const [cliInput, setCliInput] = createSignal("");
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
	async function openTerminal(machine?: string | null, provider?: string): Promise<void> {
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
			const info = await terminalsService.open(token, DEFAULT_SIZE, cwd, environment, provider);
			setTerminals((list) => [...list, info]);
			navigate(`/terminal/${info.id}`);
		} catch (cause) {
			setLoad({ status: "error", message: describe(cause) });
		} finally {
			setBusy(false);
		}
	}

	function onCliEvent(id: string, event: InteractiveCliEvent): void {
		if (event.type === "screen") setCliScreens((all) => ({ ...all, [id]: event.content }));
		else if (event.type === "ad")
			setCliAds((all) => ({
				...all,
				[id]: (all[id] ?? []).includes(event.content)
					? all[id]
					: [...(all[id] ?? []), event.content],
			}));
		else if (event.type !== "text") setCliInteractions((all) => ({ ...all, [id]: event }));
		if (event.type === "error" && id === activeId()) setCliView("terminal");
	}

	function interactionLabel(event: InteractiveCliEvent): string {
		switch (event.type) {
			case "selection":
				return "Choose with arrow keys, then Enter";
			case "status":
				return event.status;
			case "question":
			case "confirmation":
				return event.text;
			case "error":
				return event.message;
			default:
				return "";
		}
	}

	function sendCliInput(event: SubmitEvent): void {
		event.preventDefault();
		const text = cliInput();
		const handle = handles.get(activeId() ?? "");
		if (!handle) return;
		if (text) handle.paste(text);
		handle.send("\r");
		setCliInput("");
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
		setCliScreens((all) => {
			const next = { ...all };
			delete next[id];
			return next;
		});
		setCliInteractions((all) => {
			const next = { ...all };
			delete next[id];
			return next;
		});
		setCliAds((all) => {
			const next = { ...all };
			delete next[id];
			return next;
		});
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
			const info = await terminalsService.open(
				token,
				DEFAULT_SIZE,
				cwd,
				environment,
				currentTerminal?.provider,
			);
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

	return (
		<div class="flex min-h-0 flex-1 flex-col overflow-hidden">
			<div class="flex h-12 shrink-0 items-center gap-1 border-stroke border-b pr-1 pl-2">
				<div
					role="tablist"
					aria-label="Terminals"
					class="flex min-w-0 flex-1 gap-1 overflow-x-auto [scrollbar-width:none]"
				>
					<For each={terminals()}>
						{(terminal) => (
							<div
								class="group flex h-8 shrink-0 items-center gap-1 rounded-md pr-0.5 pl-2 text-ink/60 aria-selected:bg-selection aria-selected:text-ink"
								aria-selected={activeId() === terminal.id ? "true" : "false"}
							>
								<a
									role="tab"
									href={workspaceHref(`/terminal/${terminal.id}`)}
									aria-selected={activeId() === terminal.id ? "true" : "false"}
									class="focus-ring flex max-w-44 items-center gap-1.5 rounded-sm text-ui-sm"
								>
									<StatusDot state={states()[terminal.id]} exited={terminal.exitCode !== null} />
									<span class="truncate">{titleOf(terminal)}</span>
									<Show when={environmentsStore.labelOf(terminal.environment)}>
										{(label) => (
											<span class="max-w-24 truncate rounded bg-ink/10 px-1 py-0.5 text-ink/55 text-ui-caption">
												{label()}
											</span>
										)}
									</Show>
									<Show when={states()[terminal.id] === "gone"}>
										<span class="rounded bg-ink/10 px-1 py-0.5 text-ink/50 text-ui-caption">
											ended
										</span>
									</Show>
								</a>
								<IconButton
									size="sm"
									label={`Close ${titleOf(terminal)}`}
									onClick={() => void closeTerminal(terminal.id)}
								>
									<CloseIcon class="size-3.5" />
								</IconButton>
							</div>
						)}
					</For>
				</div>
				<Show
					when={environmentsStore.environments().length > 0}
					fallback={
						<div class="flex items-center gap-1">
							<Button
								size="sm"
								class="min-h-11"
								disabled={busy()}
								onClick={() => void openTerminal(undefined, "freebuff")}
							>
								Freebuff
							</Button>
							<IconButton
								label="New terminal"
								disabled={busy()}
								onClick={() => void openTerminal()}
							>
								<PlusIcon class="size-4" />
							</IconButton>
						</div>
					}
				>
					<Menu
						label="New terminal on…"
						trigger={<PlusIcon class="size-4" />}
						disabled={busy()}
						items={[
							{
								id: "freebuff",
								label: "Freebuff in project",
								icon: <TerminalIcon class="size-4" />,
							},
							{ id: THIS_MACHINE, label: "This machine", icon: <TerminalIcon class="size-4" /> },
							...environmentsStore.environments().map((environment) => ({
								id: environment.id,
								label: environment.label,
								icon: <GlobeIcon class="size-4" />,
							})),
						]}
						onSelect={(id) =>
							void openTerminal(
								id === THIS_MACHINE ? null : id === "freebuff" ? undefined : id,
								id === "freebuff" ? "freebuff" : undefined,
							)
						}
					/>
				</Show>
				<Show when={terminals().find((terminal) => terminal.id === activeId())?.provider}>
					<Button
						size="sm"
						onClick={() => setCliView(cliView() === "screen" ? "terminal" : "screen")}
					>
						{cliView() === "screen" ? "Raw terminal" : "Screen view"}
					</Button>
				</Show>
				<div class="hidden items-center pointer-fine:flex">
					<IconButton label="Smaller text" size="sm" onClick={() => changeFontSize(-1)}>
						<span class="font-mono text-ui-xs">A−</span>
					</IconButton>
					<IconButton label="Larger text" size="sm" onClick={() => changeFontSize(1)}>
						<span class="font-mono text-ui-sm">A+</span>
					</IconButton>
				</div>
			</div>

			<Show when={errorMessage()}>
				{(message) => (
					<div class="p-2">
						<ErrorNotice
							message={message()}
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
				<output
					aria-live="polite"
					class="block shrink-0 bg-ink/5 px-3 py-1.5 text-ink/60 text-ui-xs"
				>
					{activeState() === "reconnecting"
						? "Connection lost — reconnecting…"
						: "Your session ended. Sign in again to keep using the terminal."}
				</output>
			</Show>

			<Show when={activeState() === "gone"}>
				<div class="flex shrink-0 flex-wrap items-center justify-between gap-2 border-stroke border-b bg-ink/5 px-3 py-1.5 text-ui-xs">
					<span class="text-ink/70">
						This terminal ended — its shell exited or the runner restarted.
					</span>
					<div class="flex items-center gap-2">
						<Button size="sm" variant="primary" onClick={() => void restartActiveTerminal()}>
							Start again
						</Button>
						<Button
							size="sm"
							class="min-h-11"
							onClick={() => {
								const id = activeId();
								if (id) void closeTerminal(id);
							}}
						>
							Close
						</Button>
					</div>
				</div>
			</Show>

			<div class="relative min-h-0 flex-1 bg-canvas">
				<Show when={load().status === "loading"}>
					<div class="flex flex-col gap-2 p-3">
						<Skeleton class="h-3 w-2/3" />
						<Skeleton class="h-3 w-1/2" />
					</div>
				</Show>
				<Show when={load().status === "ready" && terminals().length === 0 && !busy()}>
					<div class="grid h-full place-items-center p-6 text-center">
						<div class="flex flex-col items-center gap-3">
							<TerminalIcon class="size-6 text-ink/40" />
							<p class="text-ink/60 text-ui-sm">No terminal is open.</p>
							<Button variant="primary" onClick={() => void openTerminal()}>
								New terminal
							</Button>
						</div>
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
								onEvent={(event) => onCliEvent(terminal.id, event)}
							/>
							<Show when={terminal.provider && cliView() === "screen"}>
								<div class="absolute inset-0 z-10 flex flex-col bg-canvas text-ink">
									<div class="min-h-0 flex-1 overflow-y-auto px-4 py-3">
										<Show when={cliInteractions()[terminal.id]}>
											{(interaction) => (
												<p class="mb-3 text-ui-sm text-ink/70">{interactionLabel(interaction())}</p>
											)}
										</Show>
										<pre class="whitespace-pre-wrap break-words font-mono text-ui-sm leading-relaxed">
											{cliScreens()[terminal.id] ?? "Starting Freebuff…"}
										</pre>
										<For each={cliAds()[terminal.id] ?? []}>
											{(ad) => <p class="mt-4 border-t border-stroke pt-3 text-ui-sm">{ad}</p>}
										</For>
									</div>
									<div class="flex shrink-0 gap-2 px-3 pt-2">
										<Button
											size="sm"
											class="min-h-11"
											onClick={() => handles.get(terminal.id)?.send("\x03")}
										>
											Ctrl+C
										</Button>
										<Button
											size="sm"
											class="min-h-11"
											onClick={() => handles.get(terminal.id)?.send("\r")}
										>
											Enter
										</Button>
									</div>
									<form
										onSubmit={sendCliInput}
										class="flex shrink-0 gap-2 border-stroke border-t p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
									>
										<input
											aria-label="Freebuff input"
											value={cliInput()}
											onInput={(event) => setCliInput(event.currentTarget.value)}
											placeholder="Prompt or /command"
											class="min-h-11 min-w-0 flex-1 rounded-md border border-stroke bg-canvas px-3 text-ui-input"
										/>
										<Button type="submit" variant="primary" class="min-h-11">
											Send
										</Button>
									</form>
								</div>
							</Show>
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

function StatusDot(props: { state: ConnectionState | undefined; exited: boolean }): JSX.Element {
	const tone = () => {
		if (props.exited || props.state === "exited" || props.state === "gone") return "bg-ink/25";
		if (props.state === "open") return "bg-success";
		return "bg-warning motion-safe:animate-pulse";
	};
	return <span class={`size-1.5 shrink-0 rounded-full ${tone()}`} aria-hidden="true" />;
}

function describe(cause: unknown): string {
	if (cause instanceof RunnerError && cause.status === 0) {
		return "The terminal service isn't running on this machine. Start it with: bun --cwd=apps/runner run dev";
	}
	return cause instanceof Error ? cause.message : "Something went wrong with the terminal.";
}
