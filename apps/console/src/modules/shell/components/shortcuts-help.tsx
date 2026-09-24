import type { JSX } from "@solidjs/web";
import { createSignal, onSettled } from "solid-js";
import { useLocation, useNavigate } from "@solidjs/router";

import { useWorkspace } from "@/modules/projects";
import { CloseIcon, IconButton, Sheet } from "@/ui";

import { installShortcuts, type Shortcut } from "@/lib/shortcuts";

const SHORTCUTS: readonly Omit<Shortcut, "run">[] = [
	{ keys: "n", label: "New task" },
	{ keys: "/", label: "Filter tasks" },
	{ keys: "g b", label: "Go to board" },
	{ keys: "g c", label: "Go to chat" },
	{ keys: "g t", label: "Go to terminal" },
	{ keys: "g s", label: "Go to settings" },
	{ keys: "?", label: "Show shortcuts" },
];

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
			{
				keys: "n",
				label: "New task",
				run: () => {
					if (location.pathname.startsWith("/board/")) workspace.setNewTaskOpen(true);
				},
			},
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
		<Sheet open={open()} onClose={() => setOpen(false)} label="Keyboard shortcuts">
			<div class="p-5 md:p-6">
				<div class="flex items-start justify-between gap-4">
					<div>
						<h2 class="text-ink text-ui-lg">Keyboard shortcuts</h2>
						<p class="mt-1 text-ink/55 text-ui-sm">
							Move through Grid without leaving the keyboard.
						</p>
					</div>
					<IconButton label="Close keyboard shortcuts" onClick={() => setOpen(false)}>
						<CloseIcon />
					</IconButton>
				</div>
				<div class="mt-5 grid gap-2 sm:grid-cols-2">
					{SHORTCUTS.map((shortcut) => (
						<div class="flex items-center justify-between gap-4 rounded-md bg-ink/5 px-3 py-2.5">
							<span class="text-ink/70 text-ui-sm">{shortcut.label}</span>
							<kbd class="rounded border border-ink/15 bg-canvas px-1.5 py-0.5 font-mono text-ink/70 text-ui-xs">
								{shortcut.keys}
							</kbd>
						</div>
					))}
				</div>
			</div>
		</Sheet>
	);
}
