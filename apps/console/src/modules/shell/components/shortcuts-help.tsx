import { useLocation, useNavigate } from "@solidjs/router";
import type { JSX } from "@solidjs/web";
import { createSignal, For, onSettled } from "solid-js";

import { Dialog, Grid, Kbd, ListCard, Row, Text } from "@/kit";
import { installShortcuts, type Shortcut } from "@/lib/shortcuts";
import { useWorkspace } from "@/modules/projects";

const SHORTCUTS: readonly Omit<Shortcut, "run">[] = [
	{ keys: "c", label: "New task" },
	{ keys: "/", label: "Filter tasks" },
	{ keys: "g b", label: "Go to board" },
	{ keys: "g c", label: "Go to chat" },
	{ keys: "g t", label: "Go to terminal" },
	{ keys: "g s", label: "Go to settings" },
	{ keys: "?", label: "Show shortcuts" },
];

/** The keyboard shortcuts, installed once, and the list of them behind `?`. */
export function ShortcutsHelp(): JSX.Element {
	const navigate = useNavigate();
	const location = useLocation();
	const workspace = useWorkspace();
	const [open, setOpen] = createSignal(false);

	onSettled(() => {
		const focusFilter = () => {
			document.querySelector<HTMLInputElement>('input[aria-label="Filter tasks"]')?.focus();
		};
		const shortcuts: Shortcut[] = [
			...["c", "n"].map((keys) => ({
				keys,
				label: "New task",
				run: () => {
					if (location.pathname.startsWith("/board/")) workspace.setNewTaskOpen(true);
				},
			})),
			{ keys: "/", label: "Filter tasks", run: focusFilter },
			{ keys: "g b", label: "Go to board", run: () => navigate("/board") },
			{ keys: "g c", label: "Go to chat", run: () => navigate("/chat") },
			{ keys: "g t", label: "Go to terminal", run: () => navigate("/terminal") },
			{ keys: "g s", label: "Go to settings", run: () => navigate("/settings") },
			{ keys: "?", label: "Show shortcuts", run: () => setOpen(true) },
		];
		return installShortcuts(shortcuts, document);
	});

	return (
		<Dialog
			open={open()}
			onClose={() => setOpen(false)}
			title="Keyboard shortcuts"
			description="Move through Grid without leaving the keyboard."
			width="34rem"
		>
			<Grid columns={2} gap={2}>
				<For each={SHORTCUTS}>
					{(shortcut) => (
						<ListCard>
							<Row justify="between" class="px-3 py-2.5">
								<Text>{shortcut.label}</Text>
								<Row gap={1}>
									<For each={shortcut.keys.split(" ")}>{(key) => <Kbd>{key}</Kbd>}</For>
								</Row>
							</Row>
						</ListCard>
					)}
				</For>
			</Grid>
		</Dialog>
	);
}
