import { useLocation, useNavigate } from "@solidjs/router";
import type { JSX } from "@solidjs/web";
import { createEffect, createMemo, createSignal, onSettled, Show } from "solid-js";

import {
	BoardIcon,
	ChatIcon,
	Dialog,
	Kbd,
	Palette,
	PlusIcon,
	SettingsIcon,
	TerminalIcon,
} from "@/kit";
import { ProjectIcon, useWorkspace } from "@/modules/projects";

import { useShell } from "../context/shell-context";

type Command = {
	id: string;
	label: string;
	hint?: string;
	icon: () => JSX.Element;
	run: () => void;
};

/** True for Ctrl+<key> on Linux and Windows, ⌘+<key> on a Mac. */
function withModifier(event: KeyboardEvent, key: string): boolean {
	return (event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === key;
}

/**
 * Search everything the console can go to or do, from Ctrl+K or the sidebar's search: the
 * sections, every project, and the common actions. Also owns Ctrl+, for settings.
 */
export function CommandPalette(): JSX.Element {
	const shell = useShell();
	const workspace = useWorkspace();
	const navigate = useNavigate();
	const location = useLocation();
	const [query, setQuery] = createSignal("");
	const [active, setActive] = createSignal<string | null>(null);

	onSettled(() => {
		const onKeydown = (event: KeyboardEvent) => {
			if (withModifier(event, "k")) {
				event.preventDefault();
				shell.setPaletteOpen(!shell.paletteOpen());
			} else if (withModifier(event, ",")) {
				event.preventDefault();
				navigate("/settings/appearance");
			}
		};
		document.addEventListener("keydown", onKeydown);
		return () => document.removeEventListener("keydown", onKeydown);
	});

	const commands = createMemo<Command[]>(() => {
		const inChat = location.pathname.startsWith("/chat");
		const current = workspace.currentProject();
		const list: Command[] = [
			{ id: "board", label: "Board", icon: () => <BoardIcon />, run: () => navigate("/board") },
			{ id: "chat", label: "Chat", icon: () => <ChatIcon />, run: () => navigate("/chat") },
			{
				id: "terminal",
				label: "Terminal",
				icon: () => <TerminalIcon />,
				run: () => navigate("/terminal"),
			},
			{
				id: "settings",
				label: "Settings",
				hint: "Ctrl+,",
				icon: () => <SettingsIcon />,
				run: () => navigate("/settings/appearance"),
			},
		];
		if (current) {
			list.push({
				id: "new-chat",
				label: `New chat in ${current.name}`,
				icon: () => <PlusIcon />,
				run: () => navigate(`/chat/${current.slug}`),
			});
		}
		list.push({
			id: "add-project",
			label: "Add project",
			icon: () => <PlusIcon />,
			run: () => workspace.setAddProjectOpen(true),
		});
		for (const project of workspace.projects()) {
			list.push({
				id: `project-${project.slug}`,
				label: project.name,
				hint: "Project",
				icon: () => <ProjectIcon project={project} />,
				run: () => navigate(inChat ? `/chat/${project.slug}` : `/board/${project.slug}`),
			});
		}
		return list;
	});

	const matches = createMemo(() => {
		const words = query().toLowerCase().split(/\s+/).filter(Boolean);
		return commands().filter((command) =>
			words.every((word) => `${command.label} ${command.hint ?? ""}`.toLowerCase().includes(word)),
		);
	});

	// Each opening starts fresh, on the first result.
	createEffect(
		() => shell.paletteOpen(),
		(open) => {
			if (open) setQuery("");
		},
	);
	createEffect(
		() => matches()[0]?.id ?? null,
		(first) => {
			setActive(first);
		},
	);

	function run(id: string): void {
		const command = matches().find((item) => item.id === id);
		if (!command) return;
		shell.setPaletteOpen(false);
		command.run();
	}

	return (
		<Dialog
			open={shell.paletteOpen()}
			onClose={() => shell.setPaletteOpen(false)}
			title="Search"
			bare
			width="36rem"
		>
			<Show when={shell.paletteOpen()}>
				<Palette
					autofocus
					query={query()}
					onQuery={setQuery}
					placeholder="Go to a project, a section or an action…"
					items={matches().map((command) => ({
						id: command.id,
						icon: command.icon(),
						label: command.label,
						hint: command.hint,
					}))}
					active={active()}
					onActive={setActive}
					onPick={run}
					footer={
						<>
							<Kbd>Esc</Kbd>
							<span>Close</span>
						</>
					}
				/>
			</Show>
		</Dialog>
	);
}
