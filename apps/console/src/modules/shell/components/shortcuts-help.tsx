import { useLocation, useNavigate } from "@solidjs/router";
import type { JSX } from "@solidjs/web";
import { createSignal, For, Show } from "solid-js";

import { Dialog, Grid, Kbd, ListCard, Row, Stack, Text, TextLink } from "@/kit";
import { workspaceHref } from "@/lib/active-workspace";
import { bindings, chordLabel, COMMANDS, type CommandGroup, useCommand } from "@/lib/keybindings";
import { useWorkspace } from "@/modules/projects";
import { useTerminalAccess } from "@/modules/workspaces";

const GROUPS: readonly CommandGroup[] = ["General", "Navigation", "Tabs", "Chat", "View", "Lists"];

/** One binding as keys: each step of a sequence, each key of a chord. */
export function ChordKeys(props: { chord: string }): JSX.Element {
	return (
		<Row gap={1}>
			<For each={chordLabel(props.chord)}>
				{(step) => <For each={step}>{(key) => <Kbd>{key}</Kbd>}</For>}
			</For>
		</Row>
	);
}

/** The app-wide commands, registered once, and the list of every binding behind `?`. */
export function ShortcutsHelp(): JSX.Element {
	const navigate = useNavigate();
	const location = useLocation();
	const workspace = useWorkspace();
	const terminals = useTerminalAccess();
	const [open, setOpen] = createSignal(false);

	useCommand("task.new", () => {
		if (!location.pathname.startsWith("/board/")) return false;
		workspace.setNewTaskOpen(true);
	});
	useCommand("tasks.filter", () => {
		const input = document.querySelector<HTMLInputElement>('input[aria-label="Filter tasks"]');
		if (!input) return false;
		input.focus();
	});
	useCommand("go.board", () => navigate("/board"));
	useCommand("go.chat", () => navigate("/chat"));
	useCommand("go.terminal", () => {
		if (!terminals()) return false;
		navigate("/terminal");
	});
	useCommand("go.settings", () => navigate("/settings"));
	useCommand("shortcuts.show", () => setOpen(true));

	return (
		<Dialog
			open={open()}
			onClose={() => setOpen(false)}
			title="Keyboard shortcuts"
			description="Move through Grid without leaving the keyboard."
			width="40rem"
		>
			<Stack gap={4}>
				<For each={GROUPS}>
					{(group) => (
						<Stack gap={2}>
							<Text size="caption" tone="subtle">
								{group}
							</Text>
							<Grid columns={2} gap={2}>
								<For each={COMMANDS.filter((entry) => entry.group === group)}>
									{(entry) => (
										<Show when={bindings(entry.id)[0]}>
											{(chord) => (
												<ListCard>
													<Row justify="between" class="px-3 py-2.5">
														<Text>{entry.label}</Text>
														<ChordKeys chord={chord()} />
													</Row>
												</ListCard>
											)}
										</Show>
									)}
								</For>
							</Grid>
						</Stack>
					)}
				</For>
				<TextLink href={workspaceHref("/settings/keybindings")} onClick={() => setOpen(false)}>
					Change these in Settings → Keybindings
				</TextLink>
			</Stack>
		</Dialog>
	);
}
