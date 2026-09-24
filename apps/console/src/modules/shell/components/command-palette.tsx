import { useLocation, useNavigate } from "@solidjs/router";
import type { JSX } from "@solidjs/web";
import { createEffect, createMemo, createSignal, For, onSettled, Show } from "solid-js";

import { useWorkspace } from "@/modules/projects";
import { BoardIcon, ChatIcon, PlusIcon, SearchIcon, SettingsIcon, Sheet, TerminalIcon } from "@/ui";

import { useShell } from "../context/shell-context";

import { ProjectMark } from "./sidebar";

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
	const [selected, setSelected] = createSignal(0);
	let input: HTMLInputElement | undefined;

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

	createEffect(
		() => shell.paletteOpen(),
		(open) => {
			if (!open) return;
			setQuery("");
			setSelected(0);
			queueMicrotask(() => input?.focus());
		},
	);

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
				run: () => navigate(`/chat/${current.slug}/new`),
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
				icon: () => <ProjectMark name={project.name} />,
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

	function run(command: Command | undefined): void {
		if (!command) return;
		shell.setPaletteOpen(false);
		command.run();
	}

	function onKeyDown(event: KeyboardEvent): void {
		const count = matches().length;
		if (event.key === "ArrowDown" && count > 0) {
			event.preventDefault();
			setSelected((index) => (index + 1) % count);
		} else if (event.key === "ArrowUp" && count > 0) {
			event.preventDefault();
			setSelected((index) => (index - 1 + count) % count);
		} else if (event.key === "Enter") {
			event.preventDefault();
			run(matches()[selected()]);
		}
	}

	return (
		<Sheet open={shell.paletteOpen()} onClose={() => shell.setPaletteOpen(false)} label="Search">
			<div class="flex max-h-[min(28rem,70dvh)] flex-col">
				<div class="flex shrink-0 items-center gap-2 border-stroke border-b px-3 pt-3 pb-2 md:pt-2">
					<SearchIcon class="size-4 shrink-0 text-ink/45" />
					<input
						ref={(el) => {
							input = el;
						}}
						value={query()}
						onInput={(event) => {
							setQuery(event.currentTarget.value);
							setSelected(0);
						}}
						onKeyDown={onKeyDown}
						aria-label="Search"
						placeholder="Go to a project, a section or an action…"
						autocomplete="off"
						spellcheck={false}
						class="h-8 min-w-0 flex-1 bg-transparent text-ui-input outline-none placeholder:text-ink/35"
					/>
				</div>
				<Show
					when={matches().length > 0}
					fallback={<p class="px-4 py-6 text-center text-ink/45 text-ui-sm">Nothing matches.</p>}
				>
					<ul class="min-h-0 flex-1 overflow-y-auto overscroll-contain p-1">
						<For each={matches()}>
							{(command, index) => (
								<li>
									<button
										type="button"
										aria-current={index() === selected() ? "true" : undefined}
										onClick={() => run(command)}
										onPointerMove={() => setSelected(index())}
										class="focus-ring flex h-9 w-full items-center gap-2.5 rounded-lg px-2 text-left text-ink/80 text-ui-sm aria-[current=true]:bg-selection aria-[current=true]:text-ink pointer-coarse:h-11"
									>
										<span class="grid size-4 shrink-0 place-items-center text-ink/55 [&>svg]:size-4">
											{command.icon()}
										</span>
										<span class="min-w-0 flex-1 truncate">{command.label}</span>
										<Show when={command.hint}>
											<span class="shrink-0 text-ink/40 text-ui-caption">{command.hint}</span>
										</Show>
									</button>
								</li>
							)}
						</For>
					</ul>
				</Show>
			</div>
		</Sheet>
	);
}
