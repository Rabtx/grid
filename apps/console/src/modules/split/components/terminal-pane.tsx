import type { JSX } from "@solidjs/web";
import { createEffect, createSignal, Show } from "solid-js";

import { useAuth } from "@/modules/auth";
import { initialFontSize } from "@/modules/terminal/lib/font-size";
import { NO_MODIFIERS } from "@/modules/terminal/lib/keys";
import { TerminalView } from "@/modules/terminal/components/terminal-view";
import type { TerminalInfo } from "@/modules/terminal/types/terminal.types";
import { Alert, Banner, Button, EmptyState, Spinner } from "@/kit";
import { TERMINALS_NOT_ALLOWED, useTerminalAccess } from "@/modules/workspaces";

import { type ThreadPlace, threadTerminals } from "../stores/thread-terminals";

type Load =
	| { status: "loading" }
	| { status: "ready"; terminal: TerminalInfo }
	| { status: "error"; message: string };

/**
 * The thread's shell, live. It is opened (or found again) the first time the pane shows and then
 * stays connected while the pane is hidden, so switching tabs or layouts never drops it.
 */
function ThreadTerminal(props: {
	place: ThreadPlace;
	active: boolean;
	/** The shell's id once known, for the preview to read what it serves. */
	onTerminal?: (terminal: TerminalInfo) => void;
}): JSX.Element {
	const auth = useAuth();
	const [load, setLoad] = createSignal<Load>({ status: "loading" });
	const [fontSize] = createSignal(initialFontSize());
	const [exited, setExited] = createSignal(false);
	let started = false;

	async function start(restart = false): Promise<void> {
		const token = auth.token();
		if (!token) return;
		setLoad({ status: "loading" });
		try {
			const current = load();
			const terminal = restart
				? await threadTerminals.restart(
						token,
						props.place,
						current.status === "ready" ? current.terminal.id : null,
					)
				: await threadTerminals.ensure(token, props.place);
			setExited(false);
			setLoad({ status: "ready", terminal });
			props.onTerminal?.(terminal);
		} catch (cause) {
			setLoad({
				status: "error",
				message: cause instanceof Error ? cause.message : "Could not open a terminal",
			});
		}
	}

	// Opened when first shown, not before: a thread nobody splits never starts a shell.
	createEffect(
		() => props.active,
		(active) => {
			if (!active || started) return;
			started = true;
			void start();
		},
	);

	return (
		<div class="relative flex min-h-0 flex-1 flex-col">
			<Show
				when={load().status === "ready" ? (load() as { terminal: TerminalInfo }).terminal : null}
				fallback={
					<Show
						when={load().status === "error" ? (load() as { message: string }).message : null}
						fallback={
							<div class="grid flex-1 place-items-center">
								<Spinner label="Opening the terminal" />
							</div>
						}
					>
						{(message) => (
							<div class="p-4">
								<Alert
									tone="danger"
									title={message()}
									action={
										<Button size="sm" onClick={() => void start()}>
											Try again
										</Button>
									}
								/>
							</div>
						)}
					</Show>
				}
			>
				{(terminal) => (
					<>
						<Show when={exited()}>
							<Banner
								tone="quiet"
								action={
									<Button size="sm" onClick={() => void start(true)}>
										Restart
									</Button>
								}
							>
								The shell ended.
							</Banner>
						</Show>
						<div class="relative min-h-0 flex-1">
							<TerminalView
								id={terminal().id}
								environment={terminal().environment}
								active={props.active}
								fontSize={fontSize()}
								takeModifiers={() => NO_MODIFIERS}
								onHandle={() => {}}
								onState={(state) => {
									// An ended shell keeps its output to read; restarting is a choice. A terminal the
									// runner no longer has (it restarted) is simply opened again.
									setExited(state === "exited");
									if (state === "gone") void start(true);
								}}
								onTitle={() => {}}
							/>
						</div>
					</>
				)}
			</Show>
		</div>
	);
}

/** The thread's terminal, or why there is none for your role. */
export function TerminalPane(props: Parameters<typeof ThreadTerminal>[0]): JSX.Element {
	const terminals = useTerminalAccess();
	return (
		<Show
			when={terminals()}
			fallback={
				<div class="flex flex-1 items-center justify-center p-6">
					<EmptyState title="No terminal for your role" description={TERMINALS_NOT_ALLOWED} />
				</div>
			}
		>
			<ThreadTerminal {...props} />
		</Show>
	);
}
