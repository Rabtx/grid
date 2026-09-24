import { useMatch, useNavigate } from "@solidjs/router";
import type { JSX } from "@solidjs/web";
import { createEffect, createMemo, createSignal, For, onSettled, Show, untrack } from "solid-js";

import { useAuth } from "@/modules/auth";
import { useWorkspace } from "@/modules/projects";
import { Button, CloseIcon, ErrorNotice, IconButton, PlusIcon, Skeleton, TerminalIcon } from "@/ui";

import { type Modifiers, NO_MODIFIERS } from "../lib/keys";
import type { ConnectionState } from "../lib/terminal-socket";
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
	// Plain maps: handles are imperative objects, not state to render.
	const handles = new Map<string, TerminalHandle>();
	// Armed modifiers are read by the terminal on the very next key, before signals settle.
	let armed: Modifiers = NO_MODIFIERS;
	let root: HTMLDivElement | undefined;

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
			const list = await terminalsService.list(token);
			setTerminals(list);
			setLoad({ status: "ready" });
			return list;
		} catch (cause) {
			setLoad({ status: "error", message: describe(cause) });
			return null;
		}
	}

	async function openTerminal(): Promise<void> {
		const token = auth.token();
		if (!token || busy()) return;
		setBusy(true);
		try {
			// A new shell starts in the current project's folder, where the work is.
			const slug = untrack(workspace.currentSlug);
			const cwd = slug ? untrack(workspace.folders)[slug] : undefined;
			const info = await terminalsService.open(token, DEFAULT_SIZE, cwd);
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
		const next = list[index + 1] ?? list[index - 1] ?? null;
		setTerminals(list.filter((terminal) => terminal.id !== id));
		handles.delete(id);
		if (activeId() === id) navigate(next ? `/terminal/${next.id}` : "/terminal", { replace: true });
		await terminalsService.close(token, id).catch((cause: unknown) => {
			// Already gone on the runner is the outcome we wanted.
			if (!(cause instanceof RunnerError && cause.status === 404)) {
				setLoad({ status: "error", message: describe(cause) });
			}
		});
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
		void refresh().then((list) => {
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

	// Fit the screen to the visible viewport. On phones the keyboard shrinks the visual viewport
	// (not the layout one), so dvh alone would leave the prompt under the keyboard.
	onSettled(() => {
		const fitViewport = () => {
			if (!root) return;
			const viewport = window.visualViewport;
			const visibleBottom = viewport ? viewport.offsetTop + viewport.height : window.innerHeight;
			const top = root.getBoundingClientRect().top;
			root.style.height = `${Math.max(160, visibleBottom - top - 8)}px`;
		};
		fitViewport();
		// The page itself must not scroll under a full-height terminal.
		const html = document.documentElement;
		const previousOverflow = html.style.overflow;
		html.style.overflow = "hidden";
		window.visualViewport?.addEventListener("resize", fitViewport);
		window.visualViewport?.addEventListener("scroll", fitViewport);
		window.addEventListener("resize", fitViewport);
		return () => {
			html.style.overflow = previousOverflow;
			window.visualViewport?.removeEventListener("resize", fitViewport);
			window.visualViewport?.removeEventListener("scroll", fitViewport);
			window.removeEventListener("resize", fitViewport);
		};
	});

	return (
		<div
			ref={(el) => {
				root = el;
			}}
			class="-mx-4 -mt-3 flex min-h-0 flex-col overflow-hidden border-stroke md:mx-0 md:mt-0 md:rounded-xl md:border"
		>
			<div class="flex h-10 shrink-0 items-center gap-1 border-stroke border-b pr-1 pl-2">
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
									href={`/terminal/${terminal.id}`}
									aria-selected={activeId() === terminal.id ? "true" : "false"}
									class="focus-ring flex max-w-44 items-center gap-1.5 rounded-sm text-ui-sm"
								>
									<StatusDot state={states()[terminal.id]} exited={terminal.exitCode !== null} />
									<span class="truncate">{titleOf(terminal)}</span>
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
				<IconButton label="New terminal" disabled={busy()} onClick={() => void openTerminal()}>
					<PlusIcon class="size-4" />
				</IconButton>
				<div class="flex items-center">
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

			<Show
				when={
					activeState() === "reconnecting" ||
					activeState() === "signed-out" ||
					activeState() === "gone"
				}
			>
				<output
					aria-live="polite"
					class="block shrink-0 bg-ink/5 px-3 py-1.5 text-ink/60 text-ui-xs"
				>
					{activeState() === "reconnecting"
						? "Connection lost — reconnecting…"
						: activeState() === "gone"
							? "This terminal ended on the machine. Close it or open a new one."
							: "Your session ended. Sign in again to keep using the terminal."}
				</output>
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
								active={activeId() === terminal.id}
								fontSize={fontSize()}
								takeModifiers={takeModifiers}
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
