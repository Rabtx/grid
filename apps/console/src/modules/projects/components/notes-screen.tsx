import { useNavigate, useParams, useSearchParams } from "@solidjs/router";
import type { JSX } from "@solidjs/web";
import {
	createEffect,
	createMemo,
	createSignal,
	For,
	onCleanup,
	onSettled,
	Show,
	untrack,
} from "solid-js";

import {
	Alert,
	BackIcon,
	Button,
	ConfirmDialog,
	EditTextButton,
	EmptyState,
	FORMAT_BUTTON,
	FORMAT_STYLE,
	FormatAsk,
	FormatBar,
	FormatFootBar,
	FileChoice,
	FormatSeparator,
	IconButton,
	iconButton,
	Menu,
	MoreIcon,
	NOTE_FIELD,
	NOTE_TITLE,
	NoteAskDock,
	NoteBlocks,
	NoteCaption,
	NoteCard,
	NoteColumn,
	NoteGlyphChoices,
	NoteGroupLabel,
	NoteIcon,
	NoteListRow,
	NoteMeta,
	NotePanelRow,
	NoteSearchField,
	notify,
	PlusIcon,
	Popover,
	type PopoverControl,
	SearchIcon,
	SharedChip,
	Skeleton,
	Spinner,
	StarIcon,
	Text,
	ThreadChip,
	UploadIcon,
	ListIcon,
	ChecklistIcon,
	AtIcon,
	CodeIcon,
	LinkIcon,
	CheckIcon,
} from "@/kit";
import { workspaceHref } from "@/lib/active-workspace";
import { ApiError } from "@/lib/api-client";
import { useAuth } from "@/modules/auth";
import { highlightLines } from "@/modules/chat/lib/markdown";
import { draftsStore } from "@/modules/chat/stores/drafts";
import { threadsStore } from "@/modules/chat/stores/threads";
import { ShellSlot, useShell } from "@/modules/shell";

import { useWorkspace } from "../context/workspace-context";
import {
	joinNote,
	noteSummary,
	parseNote,
	splitNote,
	taskCount,
	toggleTask,
} from "../lib/note-doc";
import { code, type Edit, link, markLines, mention, wrap } from "../lib/note-edit";
import { relativeTime } from "../lib/relative-time";
import { filesService } from "../services/files.service";
import { notesStore } from "../stores/notes";
import type { Note, NoteIcon as NoteGlyph, NotePatch } from "../types/project.types";

export { noteSummary } from "../lib/note-doc";

/** A note's glyph: its own, else a checklist's or the plain note's. */
function glyphOf(note: Note): NoteGlyph {
	return note.icon ?? (taskCount(note.body) ? "check" : "note");
}

/** When a note last changed, as short as the list has room for: now, 2m, 3h, 1d, Sep 3. */
function shortTime(iso: string): string {
	const when = relativeTime(iso);
	return when === "just now" ? "now" : when === "yesterday" ? "1d" : when;
}

/** "edited 2m ago", "edited just now", "edited yesterday", "edited Sep 3". */
function edited(iso: string): string {
	const when = relativeTime(iso);
	return /^\d+[mhd]$/.test(when) ? `edited ${when} ago` : `edited ${when}`;
}

/** Whether a note matches what was typed in search: its title or its words. */
function matches(note: Note, query: string): boolean {
	const words = query.trim().toLowerCase();
	return !words || note.body.toLowerCase().includes(words);
}

async function copyText(text: string, done: string): Promise<void> {
	try {
		await navigator.clipboard.writeText(text);
		notify({ title: done });
	} catch {
		notify({ title: "Could not copy to the clipboard", tone: "danger" });
	}
}

/** Save a note as a Markdown file. */
function download(note: Note): void {
	const title = noteSummary(note.body).title;
	const name = `${title.replace(/[\\/:*?"<>|]+/g, " ").trim() || "note"}.md`;
	const url = URL.createObjectURL(new Blob([note.body], { type: "text/markdown" }));
	const anchor = document.createElement("a");
	anchor.href = url;
	anchor.download = name;
	anchor.click();
	setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** A note quoted for a message to an agent, no longer than `limit`. */
function quoted(body: string, limit: number): string {
	const text = body.length > limit ? `${body.slice(0, limit)}…` : body;
	return text
		.split("\n")
		.map((line) => `> ${line}`)
		.join("\n");
}

const NOTE_MENU = (note: Note) => [
	{
		items: [
			{ id: "pin", label: note.pinned ? "Unpin" : "Pin to the top" },
			{ id: "share", label: note.shared ? "Stop sharing with agents" : "Share with agents" },
		],
	},
	{
		items: [
			{ id: "copy", label: "Copy text" },
			{ id: "download", label: "Download as Markdown" },
		],
	},
	{ items: [{ id: "delete", label: "Delete", danger: true }] },
];

/**
 * A project's notes (Figma 14 · Notes): decisions, rules and agent answers worth keeping. The
 * panel lists them, pinned first; the open note reads as a document you edit in place, with
 * tasks you tick and files as chips. A note shared with agents goes with the first message of
 * every new thread in the project. The open note is in the path (`/notes/:slug/:note`), `new`
 * for a new one.
 */
export function NotesScreen(): JSX.Element {
	const auth = useAuth();
	const workspace = useWorkspace();
	const navigate = useNavigate();
	const params = useParams<{ slug: string; note?: string }>();
	const slug = () => params.slug ?? "";
	const project = () => workspace.projects().find((item) => item.slug === slug());
	const notes = () => notesStore.notes(slug());
	const selected = () => params.note ?? "";
	const [query, setQuery] = createSignal("");
	const [searching, setSearching] = createSignal(false);
	const [deleting, setDeleting] = createSignal<Note | null>(null);
	const [removing, setRemoving] = createSignal(false);
	const found = () => notes().filter((note) => matches(note, query()));
	const pinned = () => found().filter((note) => note.pinned);
	const recent = () => found().filter((note) => !note.pinned);
	// Each note has its own path, so the router marks the open one's link as the current page.
	const href = (id: string) => workspaceHref(`/notes/${slug()}/${encodeURIComponent(id)}`);

	createEffect(
		() => [auth.token(), slug()] as const,
		([token, projectSlug]) => {
			if (token && projectSlug) {
				void notesStore.load(token, projectSlug);
				void threadsStore.load(token, projectSlug);
			}
		},
	);
	onSettled(() => threadsStore.watchRunning(() => auth.token()));

	// Links from before notes had their own path (`/notes/beta?note=<id>`) still open the note.
	const [legacy] = useSearchParams<{ note?: string }>();
	createEffect(
		() => [legacy.note, params.note, slug()] as const,
		([old, current, projectSlug]) => {
			if (old && !current && projectSlug)
				navigate(`/notes/${projectSlug}/${encodeURIComponent(old)}`, { replace: true });
		},
	);

	function open(id: string | null): void {
		navigate(`/notes/${slug()}${id ? `/${encodeURIComponent(id)}` : ""}`);
	}

	function retry(): void {
		const token = auth.token();
		if (token) void notesStore.load(token, slug());
	}

	async function change(note: Note, patch: NotePatch): Promise<void> {
		const token = auth.token();
		if (!token) return;
		try {
			await notesStore.update(token, slug(), note.id, patch);
		} catch (cause) {
			notify({
				title: cause instanceof Error ? cause.message : "Could not change the note",
				tone: "danger",
			});
		}
	}

	function act(note: Note, id: string): void {
		if (id === "pin") void change(note, { pinned: !note.pinned });
		else if (id === "share") void change(note, { shared: !note.shared });
		else if (id === "copy") void copyText(note.body, "Note copied");
		else if (id === "download") download(note);
		else if (id === "delete") setDeleting(note);
	}

	async function remove(note: Note): Promise<void> {
		const token = auth.token();
		if (!token) return;
		setRemoving(true);
		try {
			await notesStore.remove(token, slug(), note.id);
			if (selected() === note.id) open(null);
			setDeleting(null);
		} catch (cause) {
			setDeleting(null);
			notify({
				title: cause instanceof Error ? cause.message : "Could not delete the note",
				tone: "danger",
			});
		} finally {
			setRemoving(false);
		}
	}

	/** Ask an agent: a new thread in the project, with the question waiting in its composer. */
	function ask(text: string): void {
		draftsStore.set(slug(), text);
		navigate(workspaceHref(`/chat/${slug()}`));
	}

	return (
		<Show when={project()} fallback={<EmptyState title="Project not found" />}>
			<ShellSlot name="panelActions">
				<IconButton
					label="Search notes"
					size="sm"
					aria-pressed={searching() ? "true" : "false"}
					onClick={() => {
						if (searching()) setQuery("");
						setSearching(!searching());
					}}
				>
					<SearchIcon />
				</IconButton>
				<IconButton label="New note" size="sm" onClick={() => open("new")}>
					<PlusIcon />
				</IconButton>
			</ShellSlot>
			<ShellSlot name="panel">
				<Show when={searching()}>
					<div class="px-1 pb-1">
						<NoteSearchField
							compact
							autofocus
							label="Search notes"
							placeholder="Search notes"
							value={query()}
							onInput={setQuery}
							onKeyDown={(event) => {
								if (event.key === "Escape") {
									setQuery("");
									setSearching(false);
								}
							}}
						/>
					</div>
				</Show>
				<Show when={notesStore.loaded(slug())} fallback={<PanelSkeleton />}>
					<Show when={pinned().length}>
						<NoteGroupLabel>Pinned</NoteGroupLabel>
						<For each={pinned()}>
							{(note) => (
								<PanelRow
									note={note}
									href={href(note.id)}
									current={note.id === selected()}
									onAct={(id) => act(note, id)}
								/>
							)}
						</For>
					</Show>
					<Show when={recent().length}>
						<NoteGroupLabel>Recent</NoteGroupLabel>
						<For each={recent()}>
							{(note) => (
								<PanelRow
									note={note}
									href={href(note.id)}
									current={note.id === selected()}
									onAct={(id) => act(note, id)}
								/>
							)}
						</For>
					</Show>
					<Show when={found().length === 0}>
						<Text size="caption" tone="subtle" class="px-2 py-2">
							{query().trim() ? "No notes match." : "No notes yet."}
						</Text>
					</Show>
				</Show>
			</ShellSlot>

			<Show
				when={selected()}
				fallback={
					<NotesHome
						slug={slug()}
						projectName={project()?.name ?? slug()}
						notes={notes()}
						pinned={pinned()}
						recent={recent()}
						query={query()}
						onQuery={setQuery}
						href={href}
						onNew={() => open("new")}
						onAct={act}
						onRetry={retry}
						onAsk={ask}
					/>
				}
			>
				<NoteView
					id={selected()}
					slug={slug()}
					projectName={project()?.name ?? slug()}
					onOpen={(id) => navigate(`/notes/${slug()}/${encodeURIComponent(id)}`, { replace: true })}
					onBack={() => open(null)}
					onAct={act}
					onChange={change}
					onAsk={ask}
				/>
			</Show>

			<ConfirmDialog
				open={deleting() !== null}
				title="Delete this note?"
				description="It is removed from the project for everyone, and new threads no longer start with it. This cannot be undone."
				confirm="Delete"
				danger
				pending={removing()}
				stayOpen
				onConfirm={() => {
					const note = deleting();
					if (note) void remove(note);
				}}
				onClose={() => setDeleting(null)}
			/>
		</Show>
	);
}

function PanelSkeleton(): JSX.Element {
	return (
		<div class="flex flex-col gap-2 p-2">
			<Skeleton class="h-10" />
			<Skeleton class="h-10" />
			<Skeleton class="h-10" />
		</div>
	);
}

/** A note in the panel, with its menu for pointers and a long press. */
function PanelRow(props: {
	note: Note;
	href: string;
	current: boolean;
	onAct: (id: string) => void;
}): JSX.Element {
	let menu: PopoverControl | undefined;
	const summary = () => noteSummary(props.note.body);
	return (
		<NotePanelRow
			href={props.href}
			title={summary().title}
			preview={summary().preview || props.note.source || ""}
			time={shortTime(props.note.updatedAt)}
			icon={glyphOf(props.note)}
			shared={props.note.shared}
			current={props.current}
			onMenuAt={(point) => menu?.open(point)}
			actions={
				<Menu
					label={`Actions for ${summary().title}`}
					trigger={<MoreIcon size="sm" />}
					triggerClass={iconButton({ size: "xs" })}
					placement="bottom-end"
					pointerOnly
					control={(control) => {
						menu = control;
					}}
					groups={NOTE_MENU(props.note)}
					onSelect={props.onAct}
				/>
			}
		/>
	);
}

/**
 * The notes at a glance (Figma Notes — Mobile): search, pinned notes as cards, the rest by when
 * they changed, and a box to ask an agent about them.
 */
function NotesHome(props: {
	slug: string;
	projectName: string;
	notes: Note[];
	pinned: Note[];
	recent: Note[];
	query: string;
	onQuery: (value: string) => void;
	href: (id: string) => string;
	onNew: () => void;
	onAct: (note: Note, id: string) => void;
	onRetry: () => void;
	onAsk: (text: string) => void;
}): JSX.Element {
	const [question, setQuestion] = createSignal("");
	const count = () => props.notes.length;

	function ask(): void {
		const text = question().trim();
		if (!text) return;
		// Shared notes already go with the thread; the rest are quoted so the agent has them all.
		const kept = props.notes.filter((note) => !note.shared);
		let attached = "";
		for (const note of kept) {
			const next = attached ? `${attached}\n\n---\n\n${note.body}` : note.body;
			if (next.length > 8000) break;
			attached = next;
		}
		setQuestion("");
		props.onAsk(attached ? `${text}\n\nOur project notes:\n\n${attached}` : text);
	}

	return (
		<div class="flex min-h-0 flex-1 flex-col">
			<ShellSlot name="heading">
				<div class="flex min-w-0 flex-col items-center">
					<Text as="h1" tone="strong" weight="medium" size="body-lg" truncate>
						Notes
					</Text>
					<Text size="caption" tone="subtle" truncate>
						{props.projectName} · {count()} note{count() === 1 ? "" : "s"}
					</Text>
				</div>
			</ShellSlot>
			<ShellSlot name="trailing">
				<IconButton
					label="New note"
					variant="secondary"
					shape="round"
					size="lg"
					onClick={props.onNew}
				>
					<PlusIcon />
				</IconButton>
			</ShellSlot>
			<div class="min-h-0 flex-1 overflow-y-auto overscroll-contain">
				<div class="mx-auto flex w-full max-w-2xl flex-col pb-4 md:pt-6">
					<div class="px-4 pt-1 pb-2">
						<NoteSearchField
							label="Search notes"
							placeholder="Search notes"
							value={props.query}
							onInput={props.onQuery}
						/>
					</div>
					<Show when={notesStore.error(props.slug)}>
						{(message) => (
							<div class="px-4 pb-2">
								<Alert
									tone="danger"
									title={message()}
									action={
										<Button size="sm" onClick={props.onRetry}>
											Try again
										</Button>
									}
								/>
							</div>
						)}
					</Show>
					<Show
						when={notesStore.loaded(props.slug)}
						fallback={
							<div class="flex flex-col gap-3 px-4 pt-2">
								<Skeleton class="h-24" />
								<Skeleton class="h-14" />
								<Skeleton class="h-14" />
							</div>
						}
					>
						<Show
							when={count() > 0}
							fallback={
								<Show when={!notesStore.error(props.slug)}>
									<EmptyState
										icon={<NoteIcon size="lg" />}
										title="No notes yet"
										description="Keep rules, decisions and agent answers here. Share a note with agents and every new thread in the project starts with it."
										action={
											<Button
												size="sm"
												variant="primary"
												icon={<PlusIcon size="sm" />}
												onClick={props.onNew}
											>
												New note
											</Button>
										}
									/>
								</Show>
							}
						>
							<Show when={props.pinned.length}>
								<NoteGroupLabel phone>Pinned</NoteGroupLabel>
								<div class="grid grid-cols-2 gap-2 px-4 pt-1 pb-2 sm:grid-cols-3">
									<For each={props.pinned}>
										{(note) => (
											<NoteCard
												href={props.href(note.id)}
												title={noteSummary(note.body).title}
												preview={noteSummary(note.body).preview || note.source || ""}
												icon={glyphOf(note)}
											/>
										)}
									</For>
								</div>
							</Show>
							<Show when={props.recent.length}>
								<NoteGroupLabel phone>Recent</NoteGroupLabel>
								<ul>
									<For each={props.recent}>
										{(note) => (
											<NoteListRow
												href={props.href(note.id)}
												title={noteSummary(note.body).title}
												preview={noteSummary(note.body).preview || note.source || ""}
												time={shortTime(note.updatedAt)}
												icon={glyphOf(note)}
												shared={note.shared}
											/>
										)}
									</For>
								</ul>
							</Show>
							<Show when={props.pinned.length + props.recent.length === 0}>
								<Text tone="subtle" class="px-4 py-6 text-center">
									No notes match “{props.query.trim()}”.
								</Text>
							</Show>
						</Show>
					</Show>
				</div>
			</div>
			<div class="mx-auto w-full max-w-2xl">
				<NoteAskDock
					label="Ask an agent about your notes"
					placeholder="Ask about your notes…"
					value={question()}
					onInput={setQuestion}
					onSubmit={ask}
				/>
			</div>
		</div>
	);
}

type SaveState = "idle" | "saving" | "error" | "empty" | "long";

/** The longest note the API keeps (characters). */
const NOTE_LIMIT = 20_000;

/**
 * The open note as a document (Figma 14 · Notes, Document): its title, who changed it and
 * whether agents get it, the format bar, then its text. Reading, tasks tick in place; a press
 * on the words opens them for writing, and every change saves itself.
 */
function NoteView(props: {
	id: string;
	slug: string;
	projectName: string;
	/** A new note was saved: show it at its own address. */
	onOpen: (id: string) => void;
	onBack: () => void;
	onAct: (note: Note, id: string) => void;
	onChange: (note: Note, patch: NotePatch) => Promise<void>;
	onAsk: (text: string) => void;
}): JSX.Element {
	const auth = useAuth();
	const shell = useShell();
	// The note this view writes to: "new" until the first save gives it an id.
	const [noteId, setNoteId] = createSignal(untrack(() => props.id));
	const note = () => notesStore.notes(props.slug).find((item) => item.id === noteId()) ?? null;
	// The text as last written here, for its note, until the saved note catches up with it.
	const [written, setWritten] = createSignal<{ id: string; text: string } | null>(null);
	const body = () => {
		const mine = written();
		return mine && mine.id === noteId() ? mine.text : (note()?.body ?? "");
	};
	const parts = createMemo(() => splitNote(body()));
	const [editing, setEditing] = createSignal(untrack(() => props.id) === "new");
	const [titleDraft, setTitleDraft] = createSignal("");
	const [restDraft, setRestDraft] = createSignal("");
	const [state, setState] = createSignal<SaveState>("idle");
	let field: HTMLTextAreaElement | undefined;
	let titleField: HTMLInputElement | undefined;
	let page: HTMLDivElement | undefined;
	let menu: PopoverControl | undefined;
	let phoneMenu: PopoverControl | undefined;
	let timer: ReturnType<typeof setTimeout> | undefined;
	let saving: Promise<void> | null = null;
	let failures = 0;
	// The note being written to (signal writes land at the end of the batch, so it is kept here
	// too), and what waits to be saved, by note: switching notes never drops what was written.
	let currentId = untrack(() => props.id);
	const waiting = new Map<string, string>();

	// Another note opened: what was written to this one is saved, and the view starts from it.
	createEffect(
		() => props.id,
		(id) => {
			if (id === currentId) return;
			void flush();
			currentId = id;
			setNoteId(id);
			setEditing(id === "new");
			// The title starts from the note itself (its field may still have focus from the last one).
			const mine = untrack(written);
			const next =
				mine?.id === id
					? mine.text
					: untrack(() => notesStore.notes(props.slug).find((item) => item.id === id)?.body);
			setTitleDraft(next ? splitNote(next).title : "");
			setRestDraft("");
			setState("idle");
			// A new note starts at its title.
			if (id === "new") requestAnimationFrame(() => titleField?.focus());
		},
	);

	// The title field follows the note while you are not typing in it.
	createEffect(
		() => parts().title,
		(title) => {
			if (document.activeElement !== titleField) setTitleDraft(title);
		},
	);

	// Leaving the page or the app (a closed tab, a phone put away) saves what is waiting.
	onSettled(() => {
		const away = () => {
			if (document.visibilityState === "hidden") void flush();
		};
		const leave = () => void flush();
		document.addEventListener("visibilitychange", away);
		window.addEventListener("pagehide", leave);
		return () => {
			document.removeEventListener("visibilitychange", away);
			window.removeEventListener("pagehide", leave);
		};
	});

	onCleanup(() => {
		void flush();
	});

	/** Keep a change: shown at once, saved a moment after the typing stops. */
	function schedule(next: string, now = false): void {
		waiting.set(currentId, next);
		setWritten({ id: currentId, text: next });
		clearTimeout(timer);
		timer = undefined;
		if (now) void flush();
		else timer = setTimeout(() => void flush(), 700);
	}

	/** Save what was written, one save at a time and note by note, the latest text for each. */
	async function flush(): Promise<void> {
		clearTimeout(timer);
		timer = undefined;
		while (saving) await saving;
		const token = auth.token();
		const first = waiting.entries().next();
		if (!token || first.done) return settle();
		const [id, text] = first.value;
		waiting.delete(id);
		// What the API would refuse is not sent: the note says why instead.
		const problem: SaveState | null = !text.trim()
			? "empty"
			: text.length > NOTE_LIMIT
				? "long"
				: null;
		if (problem) {
			if (id === currentId) setState(problem);
			return flush();
		}
		const saved = notesStore.notes(props.slug).find((item) => item.id === id);
		if (id !== "new" && saved?.body === text) {
			if (id === currentId) setState("idle");
			return flush();
		}
		if (id === currentId) setState("saving");
		let ok = false;
		saving = (async () => {
			try {
				if (id === "new") {
					const made = await notesStore.add(token, props.slug, { body: text });
					// Anything written while it was being made goes to it.
					const later = waiting.get("new");
					if (later !== undefined) {
						waiting.delete("new");
						waiting.set(made.id, later);
					}
					const mine = untrack(written);
					if (mine?.id === "new") setWritten({ id: made.id, text: mine.text });
					if (currentId === "new") {
						currentId = made.id;
						setNoteId(made.id);
						props.onOpen(made.id);
					}
				} else {
					await notesStore.update(token, props.slug, id, { body: text });
				}
				ok = true;
				failures = 0;
				if (id === currentId || (id === "new" && currentId !== "new")) setState("idle");
			} catch (cause) {
				// Kept for the next try, unless something newer was written meanwhile.
				if (!waiting.has(id)) waiting.set(id, text);
				failures += 1;
				setState("error");
				const status = cause instanceof ApiError ? cause.statusCode : 0;
				const retry = failures < 4 && (status === 0 || status >= 500 || status === 429);
				if (failures === 1 || !retry)
					notify({
						title: cause instanceof Error ? cause.message : "Could not save the note",
						tone: "danger",
					});
				// A network or server failure is tried again, a little later each time.
				if (retry) timer = setTimeout(() => void flush(), 2000 * failures);
			}
		})();
		await saving;
		saving = null;
		if (ok && waiting.size) await flush();
		else settle();
	}

	/** Nothing waiting: read the text from the saved note again. */
	function settle(): void {
		if (!waiting.size && !saving && !timer) setWritten(null);
	}

	function startEditing(): void {
		if (untrack(editing)) return;
		setRestDraft(untrack(parts).rest);
		setEditing(true);
	}

	function stopEditing(): void {
		if (!untrack(editing)) return;
		void flush();
		setEditing(false);
	}

	// Writing ends with a press outside the document (or Escape); menus it opened do not count.
	createEffect(editing, (on) => {
		if (!on) return;
		const away = (event: PointerEvent) => {
			const target = event.target as Element | null;
			if (!target || page?.contains(target) || target.closest("[popover]")) return;
			stopEditing();
		};
		document.addEventListener("pointerdown", away, true);
		return () => document.removeEventListener("pointerdown", away, true);
	});

	function writeTitle(title: string): void {
		setTitleDraft(title);
		const rest = untrack(editing) ? untrack(restDraft) : untrack(parts).rest;
		schedule(joinNote(note()?.body ?? "", title, rest));
	}

	function writeRest(rest: string): void {
		setRestDraft(rest);
		schedule(joinNote(note()?.body ?? "", untrack(titleDraft), rest));
	}

	/** Run a format bar edit on the field, opening it for writing first if needed. */
	function format(edit: (current: Edit) => Edit): void {
		const run = () => {
			if (!field) return;
			const next = edit({
				text: field.value,
				start: field.selectionStart,
				end: field.selectionEnd,
			});
			writeRest(next.text);
			field.value = next.text;
			field.focus();
			field.setSelectionRange(next.start, next.end);
			grow();
		};
		if (untrack(editing) && field) return run();
		startEditing();
		requestAnimationFrame(() => {
			if (!field) return;
			field.focus();
			field.setSelectionRange(field.value.length, field.value.length);
			run();
		});
	}

	function grow(): void {
		if (!field) return;
		field.style.height = "auto";
		field.style.height = `${field.scrollHeight}px`;
	}

	function keys(event: KeyboardEvent): void {
		const mod = event.metaKey || event.ctrlKey;
		if (event.key === "Escape") {
			event.preventDefault();
			stopEditing();
		} else if (mod && event.key.toLowerCase() === "b") {
			event.preventDefault();
			format((edit) => wrap(edit, "**", "**", "bold"));
		} else if (mod && event.key.toLowerCase() === "i") {
			event.preventDefault();
			format((edit) => wrap(edit, "_", "_", "italic"));
		} else if (mod && event.key.toLowerCase() === "k") {
			event.preventDefault();
			format(link);
		}
	}

	function tick(at: number, done: boolean): void {
		const rest = toggleTask(untrack(parts).rest, at, done);
		schedule(joinNote(note()?.body ?? "", untrack(parts).title, rest), true);
	}

	function ask(): void {
		const current = note();
		const title = untrack(titleDraft).trim() || "Untitled note";
		if (!current) return props.onAsk(`About the note “${title}”: `);
		props.onAsk(
			current.shared
				? `About the note “${title}” (it came with this thread): `
				: `About the note “${title}”:\n\n${quoted(splitNote(current.body).rest, 4000)}\n\n`,
		);
	}

	const blocks = createMemo(() => parseNote(parts().rest));
	const fileHref = (path: string, line: number | null) =>
		workspaceHref(
			`/files/${props.slug}?file=${encodeURIComponent(path.replace(/^\.?\//, ""))}${line ? `#L${line}` : ""}`,
		);
	const thread = () => {
		const id = note()?.threadId;
		return id ? (threadsStore.threads(props.slug).find((item) => item.id === id) ?? null) : null;
	};
	const editedLine = () => {
		if (state() === "saving") return "Saving…";
		if (state() === "error") return "Not saved";
		if (state() === "empty") return "Empty notes are not kept: write something, or delete it";
		if (state() === "long") return "Too long to save: 20,000 characters at most";
		const current = note();
		return current ? edited(current.updatedAt) : "Not saved yet";
	};
	const editedLabel = () => {
		const line = editedLine();
		return line.charAt(0).toUpperCase() + line.slice(1);
	};
	const missing = () => noteId() !== "new" && notesStore.loaded(props.slug) && !note();

	const formatButtons = (phone: boolean) => (
		<>
			<button
				type="button"
				aria-label="Bulleted list"
				title="Bulleted list"
				class={FORMAT_BUTTON}
				onPointerDown={(event) => event.preventDefault()}
				onClick={() => format((edit) => markLines(edit, "- "))}
			>
				<ListIcon />
			</button>
			<button
				type="button"
				aria-label="Checklist"
				title="Checklist"
				class={FORMAT_BUTTON}
				onPointerDown={(event) => event.preventDefault()}
				onClick={() => format((edit) => markLines(edit, "- [ ] "))}
			>
				<Show when={phone} fallback={<CheckIcon />}>
					<ChecklistIcon />
				</Show>
			</button>
			<button
				type="button"
				aria-label="Code"
				title="Code"
				class={FORMAT_BUTTON}
				onPointerDown={(event) => event.preventDefault()}
				onClick={() => format(code)}
			>
				<CodeIcon />
			</button>
			<button
				type="button"
				aria-label="Link"
				title="Link"
				class={FORMAT_BUTTON}
				onPointerDown={(event) => event.preventDefault()}
				onClick={() => format(link)}
			>
				<LinkIcon />
			</button>
			<MentionPicker
				slug={props.slug}
				phone={phone}
				onPick={(path) => format((edit) => mention(edit, path))}
			/>
		</>
	);

	const actionsMenu = (phone: boolean) => (
		<Show when={note()}>
			{(current) => (
				<Menu
					label="Note actions"
					title={phone ? "Note" : undefined}
					trigger={<MoreIcon />}
					triggerClass={
						phone
							? iconButton({ size: "lg", shape: "round", variant: "secondary" })
							: iconButton({ size: "sm" })
					}
					placement="bottom-end"
					control={(control) => {
						if (phone) phoneMenu = control;
						else menu = control;
					}}
					header={
						<NoteGlyphChoices
							label="Its glyph"
							value={glyphOf(current())}
							onChange={(icon) => {
								(phone ? phoneMenu : menu)?.close();
								void props.onChange(current(), { icon });
							}}
						/>
					}
					groups={NOTE_MENU(current())}
					onSelect={(id) => props.onAct(current(), id)}
				/>
			)}
		</Show>
	);

	return (
		<div class="flex min-h-0 flex-1 flex-col">
			<ShellSlot name="crumb">{titleDraft().trim() || "Untitled note"}</ShellSlot>
			<ShellSlot name="actions">
				<Show when={note()}>
					{(current) => (
						<>
							<SharedChip
								shared={current().shared}
								onToggle={() => void props.onChange(current(), { shared: !current().shared })}
							/>
							<IconButton
								label={current().pinned ? "Unpin" : "Pin to the top"}
								size="sm"
								aria-pressed={current().pinned ? "true" : "false"}
								onClick={() => void props.onChange(current(), { pinned: !current().pinned })}
							>
								<span class={current().pinned ? "text-warning [&_path]:fill-current" : ""}>
									<StarIcon />
								</span>
							</IconButton>
							<IconButton
								label="Download as Markdown"
								size="sm"
								onClick={() => download(current())}
							>
								<UploadIcon />
							</IconButton>
							{actionsMenu(false)}
						</>
					)}
				</Show>
			</ShellSlot>
			<ShellSlot name="heading">
				<div class="flex min-w-0 flex-col items-center">
					<Text as="h1" tone="strong" weight="medium" size="body-lg" truncate>
						Notes
					</Text>
					<Text size="caption" tone="subtle" truncate>
						{editedLabel()}
					</Text>
				</div>
			</ShellSlot>
			<ShellSlot name="leading">
				<IconButton
					label="Back to notes"
					variant="secondary"
					shape="round"
					size="lg"
					onClick={() => {
						void flush();
						props.onBack();
					}}
				>
					<BackIcon />
				</IconButton>
			</ShellSlot>
			<ShellSlot name="trailing">{actionsMenu(true)}</ShellSlot>

			<Show
				when={!missing()}
				fallback={
					<EmptyState
						icon={<NoteIcon size="lg" />}
						title="Note not found"
						description="It may have been deleted."
						action={<Button onClick={props.onBack}>Back to notes</Button>}
					/>
				}
			>
				<Show
					when={noteId() === "new" || note()}
					fallback={
						<div class="mx-auto flex w-full max-w-170 flex-col gap-4 px-4 pt-10">
							<Skeleton class="h-8 w-1/2" />
							<Skeleton class="h-4 w-1/3" />
							<Skeleton class="h-24" />
						</div>
					}
				>
					<div
						class="min-h-0 flex-1 overflow-y-auto overscroll-contain"
						ref={(el) => {
							page = el;
						}}
					>
						<NoteColumn>
							<div class="flex flex-col gap-2">
								<input
									ref={(el) => {
										titleField = el;
										if (untrack(noteId) === "new") queueMicrotask(() => el.focus());
									}}
									aria-label="Title"
									placeholder="Untitled note"
									value={titleDraft()}
									onInput={(event) => writeTitle(event.currentTarget.value)}
									onKeyDown={(event) => {
										if (event.key === "Enter") {
											event.preventDefault();
											startEditing();
											requestAnimationFrame(() => field?.focus());
										}
									}}
									class={NOTE_TITLE}
								/>
								<NoteMeta
									who={note()?.editor?.name ?? note()?.author?.name ?? null}
									when={
										<span
											class={state() === "error" || state() === "long" ? "text-danger" : undefined}
										>
											{shell.desktop() ? editedLine() : editedLabel()}
										</span>
									}
									context={note()?.shared ? `Context for agents in ${props.projectName}` : null}
									source={note()?.source ? <>Saved from {note()?.source}</> : undefined}
								/>
							</div>
							<div class="hidden md:block">
								<FormatBar label="Format">
									<TextStyle onPick={(mark) => format((edit) => markLines(edit, mark))} />
									<FormatSeparator />
									<button
										type="button"
										aria-label="Bold"
										title="Bold"
										class={FORMAT_BUTTON}
										onPointerDown={(event) => event.preventDefault()}
										onClick={() => format((edit) => wrap(edit, "**", "**", "bold"))}
									>
										B
									</button>
									<button
										type="button"
										aria-label="Italic"
										title="Italic"
										class={`${FORMAT_BUTTON} italic`}
										onPointerDown={(event) => event.preventDefault()}
										onClick={() => format((edit) => wrap(edit, "_", "_", "italic"))}
									>
										I
									</button>
									{formatButtons(false)}
									<FormatSeparator />
									<FormatAsk label="Ask an agent about this note" onClick={ask} />
								</FormatBar>
							</div>
							<Show
								when={editing()}
								fallback={
									<>
										<EditTextButton
											onClick={() => {
												startEditing();
												requestAnimationFrame(() => field?.focus());
											}}
										/>
										{/* oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- a press on the words opens them for writing; the keyboard has the Edit text button before them */}
										<div
											class="flex min-h-24 cursor-text flex-col gap-4"
											onClick={(event) => {
												const target = event.target as Element;
												if (target.closest("a, button, input, label, pre")) return;
												if (window.getSelection()?.toString()) return;
												startEditing();
												requestAnimationFrame(() => field?.focus());
											}}
										>
											<Show
												when={blocks().length}
												fallback={
													<Text tone="subtle">Write something, or press here to start.</Text>
												}
											>
												<NoteBlocks
													blocks={blocks()}
													onTask={tick}
													fileHref={fileHref}
													highlight={(text, language) =>
														language ? highlightLines(text, language) : null
													}
												/>
											</Show>
										</div>
									</>
								}
							>
								<textarea
									ref={(el) => {
										field = el;
										requestAnimationFrame(grow);
									}}
									aria-label="Note"
									placeholder="Write in Markdown: ## for a heading, - [ ] for a task, `src/file.ts` for a file."
									value={restDraft()}
									onInput={(event) => {
										writeRest(event.currentTarget.value);
										grow();
									}}
									onKeyDown={keys}
									class={`${NOTE_FIELD} min-h-48`}
								/>
							</Show>
							<Show when={note()?.threadId}>
								{(id) => (
									<div class="flex flex-col gap-2 pt-1">
										<NoteCaption>Linked threads</NoteCaption>
										<div class="flex flex-wrap gap-2">
											<ThreadChip
												href={workspaceHref(`/chat/${props.slug}/${id()}`)}
												title={thread()?.title ?? note()?.source ?? "The thread it came from"}
												working={threadsStore.isRunning(id())}
												status={threadsStore.isRunning(id()) ? "Working" : undefined}
											/>
										</div>
									</div>
								)}
							</Show>
						</NoteColumn>
					</div>
					<div class="md:hidden">
						<FormatFootBar label="Format">
							{formatButtons(true)}
							<FormatAsk filled label="Ask an agent about this note" onClick={ask} />
						</FormatFootBar>
					</div>
				</Show>
			</Show>
		</div>
	);
}

/** "Text ▾": make the lines plain text, a heading or a subheading. */
function TextStyle(props: { onPick: (mark: string) => void }): JSX.Element {
	return (
		<Menu
			label="Text style"
			trigger={
				<>
					Text <span aria-hidden="true">▾</span>
				</>
			}
			triggerClass={FORMAT_STYLE}
			placement="bottom-start"
			groups={[
				{
					items: [
						{ id: "", label: "Text" },
						{ id: "## ", label: "Heading" },
						{ id: "### ", label: "Subheading" },
					],
				},
			]}
			onSelect={props.onPick}
		/>
	);
}

/** "@": find a file in the project and name it in the note, where it shows as a chip. */
function MentionPicker(props: {
	slug: string;
	phone: boolean;
	onPick: (path: string) => void;
}): JSX.Element {
	const auth = useAuth();
	const [query, setQuery] = createSignal("");
	const [results, setResults] = createSignal<string[]>([]);
	const [loading, setLoading] = createSignal(false);
	const [error, setError] = createSignal<string | null>(null);
	let asked = 0;
	let wait: ReturnType<typeof setTimeout> | undefined;

	function find(text: string): void {
		setQuery(text);
		clearTimeout(wait);
		wait = setTimeout(() => void run(text), 150);
	}

	async function run(text: string): Promise<void> {
		const token = auth.token();
		if (!token) return;
		const mine = ++asked;
		setLoading(true);
		try {
			const paths = await filesService.search(token, props.slug, text.trim());
			if (mine !== asked) return;
			setResults(paths.slice(0, 30));
			setError(null);
		} catch (cause) {
			if (mine !== asked) return;
			setResults([]);
			setError(cause instanceof Error ? cause.message : "Could not search the files");
		} finally {
			if (mine === asked) setLoading(false);
		}
	}

	return (
		<Popover
			label="Name a file"
			title="Name a file"
			trigger={<AtIcon />}
			triggerClass={FORMAT_BUTTON}
			placement="bottom-start"
			width="md:w-80"
		>
			{(close) => {
				queueMicrotask(() => void run(query()));
				return (
					<div class="flex flex-col gap-1 p-2">
						<NoteSearchField
							compact
							autofocus
							label="Find a file"
							placeholder="Find a file"
							value={query()}
							onInput={find}
						/>
						<div class="flex max-h-72 flex-col overflow-y-auto">
							<Show
								when={results().length}
								fallback={
									<Text size="caption" tone="subtle" class="flex items-center gap-2 px-2 py-3">
										<Show when={loading()} fallback={error() ?? "No files match"}>
											<Spinner /> Searching…
										</Show>
									</Text>
								}
							>
								<For each={results()}>
									{(path) => (
										<FileChoice
											path={path}
											onPick={() => {
												close();
												props.onPick(path);
											}}
										/>
									)}
								</For>
							</Show>
						</div>
					</div>
				);
			}}
		</Popover>
	);
}
