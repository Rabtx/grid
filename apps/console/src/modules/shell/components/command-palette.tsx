import { useLocation, useNavigate } from "@solidjs/router";
import type { JSX } from "@solidjs/web";
import { createEffect, createMemo, createSignal, For, onSettled, Show } from "solid-js";

import {
	AgentLogo,
	Alert,
	BoardIcon,
	BranchIcon,
	Button,
	ChatIcon,
	CitedText,
	Dialog,
	FileIcon,
	FollowUps,
	KeyHint,
	LinkButton,
	NoteIcon,
	notify,
	PlusIcon,
	PullRequestIcon,
	ResultGroup,
	ResultRow,
	SearchField,
	SearchFooter,
	SearchPanel,
	SettingsIcon,
	SourceList,
	SourceRow,
	SparklesIcon,
	Spinner,
	Stack,
	TerminalIcon,
	Text,
} from "@/kit";
import { useAuth } from "@/modules/auth";
import { ProjectIcon, projectsService, useWorkspace } from "@/modules/projects";
import {
	type AskAnswer,
	type AskSource,
	type FileHit,
	type NoteHit,
	searchService,
	type TaskHit,
	type ThreadHit,
} from "@/modules/search/services/search.service";

import { useShell } from "../context/shell-context";

type Mode = "search" | "ask";

type Row = {
	id: string;
	group: string;
	label: string;
	hint?: string;
	keys?: string;
	icon: () => JSX.Element;
	run: () => void;
};

type Turn = { question: string; answer: AskAnswer };

// A search waits this long after the last key before asking the machine and the API.
const DEBOUNCE_MS = 150;

const SOURCE_ICONS: Record<AskSource["kind"], () => JSX.Element> = {
	note: () => <NoteIcon />,
	thread: () => <ChatIcon />,
	task: () => <BoardIcon />,
	commit: () => <BranchIcon />,
	pull: () => <PullRequestIcon />,
};

/** True for Ctrl+<key> on Linux and Windows, ⌘+<key> on a Mac. */
function withModifier(event: KeyboardEvent, key: string): boolean {
	return (event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === key;
}

function reason(cause: unknown, fallback: string): string {
	return cause instanceof Error && cause.message ? cause.message : fallback;
}

function relative(iso: string): string {
	const minutes = Math.round((Date.now() - Date.parse(iso)) / 60_000);
	if (minutes < 1) return "just now";
	if (minutes < 60) return `${minutes}m`;
	const hours = Math.round(minutes / 60);
	if (hours < 48) return `${hours}h`;
	return `${Math.round(hours / 24)}d`;
}

/**
 * Search and Ask Grid (Figma 25), from Ctrl+K or any search button. Search finds threads (by what
 * was said in them), files, tasks, notes, projects and commands, in the project you are in first.
 * Tab switches to Ask: a question answered by an agent from the notes, threads, tasks, commits and
 * pull requests you can already see, every claim citing one. Also owns Ctrl+, for settings.
 */
export function CommandPalette(): JSX.Element {
	const shell = useShell();
	const auth = useAuth();
	const workspace = useWorkspace();
	const navigate = useNavigate();
	const location = useLocation();
	const [mode, setMode] = createSignal<Mode>("search");
	const [query, setQuery] = createSignal("");
	const [active, setActive] = createSignal<string | null>(null);
	const [threads, setThreads] = createSignal<ThreadHit[]>([]);
	const [files, setFiles] = createSignal<FileHit[]>([]);
	const [tasks, setTasks] = createSignal<TaskHit[]>([]);
	const [notes, setNotes] = createSignal<NoteHit[]>([]);
	const [turns, setTurns] = createSignal<Turn[]>([]);
	const [asking, setAsking] = createSignal<string | null>(null);
	const [askError, setAskError] = createSignal<string | null>(null);
	let timer: ReturnType<typeof setTimeout> | undefined;
	let latest = 0;

	const project = () => workspace.currentProject();
	const close = () => shell.setPaletteOpen(false);
	const go = (path: string) => {
		close();
		navigate(path);
	};

	onSettled(() => {
		const onKeydown = (event: KeyboardEvent) => {
			if (withModifier(event, "k")) {
				event.preventDefault();
				shell.setPaletteOpen(!shell.paletteOpen());
			} else if (withModifier(event, ",")) {
				event.preventDefault();
				navigate("/settings");
			}
		};
		document.addEventListener("keydown", onKeydown);
		return () => {
			document.removeEventListener("keydown", onKeydown);
			clearTimeout(timer);
		};
	});

	// Each opening starts fresh, in the mode it was opened for.
	createEffect(
		() => shell.paletteOpen(),
		(open) => {
			if (!open) return;
			setQuery("");
			setTurns([]);
			setAskError(null);
			setMode(shell.paletteMode());
		},
	);

	// What the machine and the API find, a moment after the last key.
	createEffect(
		() => [query(), mode(), project()?.slug ?? null] as const,
		([text, current, slug]) => {
			clearTimeout(timer);
			if (current !== "search" || text.trim().length < 2) {
				setThreads([]);
				setFiles([]);
				setTasks([]);
				setNotes([]);
				return;
			}
			const token = auth.token();
			if (!token) return;
			const asked = ++latest;
			timer = setTimeout(() => {
				void searchService.local(token, text, slug).then(
					(found) => {
						if (asked !== latest) return;
						setThreads(found.threads);
						setFiles(found.files);
					},
					() => undefined,
				);
				void searchService.work(token, text, slug).then(
					(found) => {
						if (asked !== latest) return;
						setTasks(found.tasks);
						setNotes(found.notes);
					},
					() => undefined,
				);
			}, DEBOUNCE_MS);
		},
	);

	async function ask(question: string): Promise<void> {
		const token = auth.token();
		const text = question.trim();
		if (!token || !text || asking()) return;
		setMode("ask");
		setQuery("");
		setAsking(text);
		setAskError(null);
		try {
			const answer = await searchService.ask(token, {
				question: text,
				project: project()?.slug ?? null,
				history: turns().map((turn) => ({ question: turn.question, answer: turn.answer.answer })),
			});
			setTurns([...turns(), { question: text, answer }]);
		} catch (cause) {
			setAskError(reason(cause, "Grid could not answer that"));
		} finally {
			setAsking(null);
		}
	}

	const commands = createMemo<Row[]>(() => {
		const inChat = location.pathname.startsWith("/chat");
		const current = project();
		const text = query().trim();
		const list: Row[] = [
			{
				id: "cmd:new-thread",
				group: "Commands",
				label: current ? `New thread in ${current.name}` : "New thread",
				icon: () => <PlusIcon />,
				run: () => go(current ? `/chat/${current.slug}` : "/chat"),
			},
			{
				id: "cmd:terminal",
				group: "Commands",
				label: "Open terminal here",
				icon: () => <TerminalIcon />,
				run: () => go("/terminal"),
			},
			{
				id: "cmd:board",
				group: "Commands",
				label: "Board",
				icon: () => <BoardIcon />,
				run: () => go(current ? `/board/${current.slug}` : "/board"),
			},
			{
				id: "cmd:settings",
				group: "Commands",
				label: "Settings",
				keys: "Ctrl ,",
				icon: () => <SettingsIcon />,
				run: () => go("/settings"),
			},
			{
				id: "cmd:add-project",
				group: "Commands",
				label: "Add project",
				icon: () => <PlusIcon />,
				run: () => {
					close();
					workspace.setAddProjectOpen(true);
				},
			},
			...workspace.projects().map((item) => ({
				id: `project:${item.slug}`,
				group: "Projects",
				label: item.name,
				icon: () => <ProjectIcon project={item} />,
				run: () => go(inChat ? `/chat/${item.slug}` : `/board/${item.slug}`),
			})),
		];
		const words = text.toLowerCase().split(/\s+/).filter(Boolean);
		const matching = list.filter((row) =>
			words.every((word) => row.label.toLowerCase().includes(word)),
		);
		if (text)
			matching.push({
				id: "cmd:ask",
				group: "Commands",
				label: `Ask Grid about “${text}”`,
				keys: "Ctrl ↵",
				icon: () => <SparklesIcon />,
				run: () => void ask(text),
			});
		return matching;
	});

	const rows = createMemo<Row[]>(() => [
		...threads().map((thread) => ({
			id: `thread:${thread.id}`,
			group: "Threads",
			label: thread.title,
			hint: `${thread.project} · ${relative(thread.updatedAt)}`,
			icon: () => <AgentLogo id={thread.provider} name={thread.provider} />,
			run: () => go(`/chat/${thread.project}/${thread.id}`),
		})),
		...files().map((file) => {
			const slash = file.path.lastIndexOf("/");
			return {
				id: `file:${file.project}:${file.path}`,
				group: "Files",
				label: file.path.slice(slash + 1),
				hint: slash > 0 ? file.path.slice(0, slash) : file.project,
				icon: () => <FileIcon />,
				run: () => go(`/files/${file.project}?file=${encodeURIComponent(file.path)}`),
			};
		}),
		...tasks().map((task) => ({
			id: `task:${task.project}:${task.number}`,
			group: "Tasks",
			label: task.title,
			hint: `${task.projectName} · ${task.status.replace("_", " ")}`,
			icon: () => <BoardIcon />,
			run: () => go(`/board/${task.project}/tasks/${task.number}`),
		})),
		...notes().map((note) => ({
			id: `note:${note.id}`,
			group: "Notes",
			label: note.title,
			hint: note.projectName,
			icon: () => <NoteIcon />,
			run: () => go(`/notes/${note.project}/${note.id}`),
		})),
		...commands(),
	]);

	const groups = createMemo(() => {
		const order: string[] = [];
		const by = new Map<string, Row[]>();
		for (const row of rows()) {
			if (!by.has(row.group)) {
				by.set(row.group, []);
				order.push(row.group);
			}
			by.get(row.group)?.push(row);
		}
		return order.map((label) => ({ label, rows: by.get(label) ?? [] }));
	});

	createEffect(
		() => rows()[0]?.id ?? null,
		(first) => {
			setActive(first);
		},
	);

	async function saveAsNote(): Promise<void> {
		const token = auth.token();
		const turn = turns().at(-1);
		const slug = project()?.slug ?? workspace.projects()[0]?.slug;
		if (!token || !turn || !slug) return;
		const sources = cited(turn)
			.map((source) => `${source.n}. ${source.title} — ${source.meta}`)
			.join("\n");
		try {
			await projectsService.createNote(token, slug, {
				body: `# ${turn.question}\n\n${turn.answer.answer}\n\n## Sources\n\n${sources}`,
				source: "Ask Grid",
			});
			notify({ title: "Saved as a note", description: `In ${project()?.name ?? slug}` });
		} catch (cause) {
			notify({ title: "Not saved", description: reason(cause, "Try again") });
		}
	}

	function onKeyDown(event: KeyboardEvent): void {
		// What is in the field now: a key can come before the signal has settled the last letters.
		const typed = (event.currentTarget as HTMLInputElement | null)?.value ?? query();
		if (event.key === "Tab" && !event.shiftKey) {
			event.preventDefault();
			setMode(mode() === "search" ? "ask" : "search");
			return;
		}
		if (mode() === "ask") {
			if (event.key === "Enter") {
				event.preventDefault();
				void ask(typed);
			}
			return;
		}
		if ((event.metaKey || event.ctrlKey) && event.key === "Enter" && typed.trim()) {
			event.preventDefault();
			void ask(typed);
			return;
		}
		const ids = rows().map((row) => row.id);
		if (!ids.length) return;
		const at = Math.max(0, ids.indexOf(active() ?? ""));
		if (event.key === "ArrowDown") setActive(ids[(at + 1) % ids.length] ?? null);
		else if (event.key === "ArrowUp") setActive(ids[(at - 1 + ids.length) % ids.length] ?? null);
		else if (event.key === "Enter")
			rows()
				.find((row) => row.id === (active() ?? ids[0]))
				?.run();
		else return;
		event.preventDefault();
	}

	const scope = () => project()?.name ?? "your workspace";
	// The sources an answer cites: what it read but did not use is left out.
	const cited = (turn: Turn) =>
		turn.answer.sources.filter((source) => turn.answer.cited.includes(source.n));
	const last = () => turns().at(-1);

	return (
		<Dialog open={shell.paletteOpen()} onClose={close} title="Search" bare width="40rem">
			<Show when={shell.paletteOpen()}>
				<SearchPanel>
					<SearchField
						label={mode() === "ask" ? "Ask Grid" : "Search"}
						value={query()}
						onInput={setQuery}
						onKeyDown={onKeyDown}
						asking={mode() === "ask"}
						placeholder={
							mode() === "ask"
								? last()
									? "Ask a follow-up…"
									: "Ask anything about your work…"
								: `Search ${scope()}…`
						}
					/>
					<div class="min-h-0 flex-1 overflow-y-auto overscroll-contain">
						<Show
							when={mode() === "ask"}
							fallback={
								<div class="flex flex-col p-1.5">
									<Show
										when={rows().length > 0}
										fallback={
											<p class="px-3 py-8 text-center text-body text-fg-subtle">Nothing matches.</p>
										}
									>
										<For each={groups()}>
											{(group) => (
												<ResultGroup label={group.label}>
													<For each={group.rows}>
														{(row) => (
															<ResultRow
																icon={row.icon()}
																label={row.label}
																hint={row.hint}
																keys={row.keys}
																active={active() === row.id}
																onHover={() => setActive(row.id)}
																onPick={row.run}
															/>
														)}
													</For>
												</ResultGroup>
											)}
										</For>
									</Show>
								</div>
							}
						>
							<div class="flex flex-col gap-5 p-5">
								<For each={turns()}>
									{(turn, index) => (
										<Stack gap={4}>
											<Text tone="strong" weight="medium">
												{turn.question}
											</Text>
											<Text size="caption" tone="subtle">
												{cited(turn).length
													? `Grid · from ${cited(turn).length} source${cited(turn).length === 1 ? "" : "s"} you can see`
													: "Grid"}
											</Text>
											<CitedText text={turn.answer.answer} />
											<Show when={cited(turn).length > 0}>
												<SourceList>
													<For each={cited(turn)}>
														{(source) => (
															<SourceRow
																n={source.n}
																icon={SOURCE_ICONS[source.kind]()}
																title={source.title}
																meta={source.meta}
																onOpen={source.href ? () => go(source.href ?? "/") : undefined}
															/>
														)}
													</For>
												</SourceList>
											</Show>
											<Show
												when={index() === turns().length - 1 && turn.answer.followUps.length > 0}
											>
												<FollowUps
													items={turn.answer.followUps}
													onPick={(next) => void ask(next)}
												/>
											</Show>
										</Stack>
									)}
								</For>
								<Show when={asking()}>
									{(question) => (
										<Stack gap={2}>
											<Text tone="strong" weight="medium">
												{question()}
											</Text>
											<div class="flex items-center gap-2 text-caption text-fg-subtle">
												<Spinner label="Reading" /> Reading your notes, threads, commits and pull
												requests…
											</div>
										</Stack>
									)}
								</Show>
								<Show when={askError()}>
									{(message) => <Alert tone="danger" title={message()} />}
								</Show>
								<Show when={!turns().length && !asking() && !askError()}>
									<Text tone="subtle">
										Ask about decisions, past work, why something is the way it is. Grid answers
										only from what you can already see in {scope()}, and shows where each answer
										came from.
									</Text>
								</Show>
							</div>
						</Show>
					</div>
					<Show
						when={mode() === "ask"}
						fallback={
							<SearchFooter
								keys={
									<>
										<KeyHint keys="↑↓">move</KeyHint>
										<KeyHint keys="↵">open</KeyHint>
										<KeyHint keys="Tab">ask</KeyHint>
									</>
								}
								note={<span>Searching {scope()}</span>}
							/>
						}
					>
						<SearchFooter
							keys={<span>Answers only use what you can already see · Tab switches to Search</span>}
							note={
								<Show when={last()}>
									<LinkButton onClick={() => void saveAsNote()}>Save as note</LinkButton>
									<Button size="sm" onClick={() => setQuery("")}>
										Ask a follow-up
									</Button>
								</Show>
							}
						/>
					</Show>
				</SearchPanel>
			</Show>
		</Dialog>
	);
}
