import { useMatch, useSearchParams } from "@solidjs/router";
import type { JSX } from "@solidjs/web";
import { createEffect, createSignal, For, Show } from "solid-js";

import {
	Alert,
	Button,
	ConfirmDialog,
	EditIcon,
	EmptyState,
	iconButton,
	IconButton,
	ListDetail,
	ListRow,
	Menu,
	MoreIcon,
	NoteIcon,
	notify,
	PaneHeader,
	PlusIcon,
	type PopoverControl,
	Prose,
	Row,
	Skeleton,
	Stack,
	Text,
	TextLink,
} from "@/kit";
import { workspaceHref } from "@/lib/active-workspace";
import { useAuth } from "@/modules/auth";

import { useWorkspace } from "../context/workspace-context";
import { relativeTime } from "../lib/relative-time";
import { notesStore } from "../stores/notes";
import type { Note } from "../types/project.types";

import { MarkdownField } from "./markdown-field";

type Renderer = {
	renderMarkdown: (text: string) => string;
	copyCodeFrom: (event: MouseEvent) => void;
};

// Notes are Markdown; the renderer lives with chat and loads with the page.
const [renderer, setRenderer] = createSignal<Renderer | null>(null);
let loading: Promise<void> | null = null;
function loadRenderer(): void {
	loading ??= import("@/modules/chat/lib/markdown").then((markdown) => {
		setRenderer(markdown);
	});
}

/** A Markdown line as plain words: no heading marks, emphasis, list bullets or code ticks. */
function plain(line: string): string {
	return line
		.replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+\.)\s+/, "")
		.replace(/[`*_~]/g, "")
		.trim();
}

/** A note's title (its first line) and a preview of what follows, for the list. */
export function noteSummary(body: string): { title: string; preview: string } {
	const lines = body
		.split("\n")
		.filter((line) => !/^\s*`{3}/.test(line))
		.map(plain)
		.filter(Boolean);
	return {
		title: lines[0]?.slice(0, 120) || "Untitled note",
		preview: lines.slice(1).join(" ").slice(0, 160),
	};
}

async function copyNote(note: Note): Promise<void> {
	try {
		await navigator.clipboard.writeText(note.body);
		notify({ title: "Note copied" });
	} catch {
		notify({ title: "Could not copy to the clipboard", tone: "danger" });
	}
}

/**
 * A project's notes: decisions, snippets and agent answers worth keeping, newest first, beside
 * the one you are reading. Saved here or from any chat with "Add as note"; they belong to the
 * project, not to a machine. The open note is in the URL (`?note=`), `new` for a draft.
 */
export function NotesScreen(): JSX.Element {
	const auth = useAuth();
	const workspace = useWorkspace();
	const match = useMatch(() => "/notes/:slug");
	const [search, setSearch] = useSearchParams<{ note?: string }>();
	const slug = () => match()?.params.slug ?? "";
	const project = () => workspace.projects().find((item) => item.slug === slug());
	const notes = () => notesStore.notes(slug());
	const selected = () => search.note ?? "";
	const openNote = () => notes().find((note) => note.id === selected()) ?? null;
	const [deleting, setDeleting] = createSignal<Note | null>(null);
	const [removing, setRemoving] = createSignal(false);
	loadRenderer();

	createEffect(
		() => [auth.token(), slug()] as const,
		([token, projectSlug]) => {
			if (token && projectSlug) void notesStore.load(token, projectSlug);
		},
	);

	function open(id: string | null): void {
		setSearch({ note: id ?? undefined });
	}

	function retry(): void {
		const token = auth.token();
		if (token) void notesStore.load(token, slug());
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

	return (
		<Show when={project()} fallback={<EmptyState title="Project not found" />}>
			<ListDetail
				open={selected() !== ""}
				list={
					<>
						<PaneHeader
							title="Notes"
							detail={notes().length > 0 ? String(notes().length) : undefined}
							actions={
								<IconButton size="sm" label="New note" onClick={() => open("new")}>
									<PlusIcon />
								</IconButton>
							}
						/>
						<div class="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2 pb-safe">
							<Show when={notesStore.error(slug())}>
								{(message) => (
									<div class="mb-2">
										<Alert
											tone="danger"
											title={message()}
											action={
												<Button size="sm" onClick={retry}>
													Try again
												</Button>
											}
										/>
									</div>
								)}
							</Show>
							<Show
								when={notesStore.loaded(slug())}
								fallback={
									<Stack gap={2} class="p-1">
										<Skeleton class="h-14" />
										<Skeleton class="h-14" />
										<Skeleton class="h-14" />
									</Stack>
								}
							>
								<Show
									when={notes().length > 0}
									fallback={
										<Show when={!notesStore.error(slug())}>
											<EmptyState
												icon={<NoteIcon size="lg" />}
												title="No notes yet"
												description="Keep decisions and agent answers here: write one, or use “Add as note” on any message in a chat."
												action={
													<Button
														size="sm"
														variant="primary"
														icon={<PlusIcon size="sm" />}
														onClick={() => open("new")}
													>
														New note
													</Button>
												}
											/>
										</Show>
									}
								>
									<Stack gap={0.5}>
										<For each={notes()}>
											{(note) => (
												<NoteRow
													note={note}
													current={note.id === selected()}
													onOpen={() => open(note.id)}
													onDelete={() => setDeleting(note)}
												/>
											)}
										</For>
									</Stack>
								</Show>
							</Show>
						</div>
					</>
				}
			>
				<Show
					when={selected() === "new"}
					fallback={
						<Show
							when={openNote()}
							fallback={
								<EmptyState
									icon={<NoteIcon size="lg" />}
									title={selected() && notesStore.loaded(slug()) ? "Note not found" : "Pick a note"}
									description={
										selected() && notesStore.loaded(slug())
											? "It may have been deleted."
											: "Choose a note in the list to read it here."
									}
								/>
							}
						>
							{(note) => (
								<NotePane
									note={note()}
									slug={slug()}
									onBack={() => open(null)}
									onDelete={() => setDeleting(note())}
								/>
							)}
						</Show>
					}
				>
					<NewNotePane slug={slug()} onDone={open} />
				</Show>
			</ListDetail>
			<ConfirmDialog
				open={deleting() !== null}
				title="Delete this note?"
				description="It is removed from the project for everyone. This cannot be undone."
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

/** A note in the list: its first line, a preview, when it was saved; copy and delete in its menu. */
function NoteRow(props: {
	note: Note;
	current: boolean;
	onOpen: () => void;
	onDelete: () => void;
}): JSX.Element {
	let menu: PopoverControl | undefined;
	const summary = () => noteSummary(props.note.body);
	return (
		<ListRow
			title={summary().title}
			subtitle={summary().preview || props.note.source || undefined}
			trailing={relativeTime(props.note.createdAt)}
			current={props.current}
			onClick={props.onOpen}
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
					groups={[
						{ items: [{ id: "copy", label: "Copy" }] },
						{ items: [{ id: "delete", label: "Delete", danger: true }] },
					]}
					onSelect={(id) => {
						if (id === "copy") void copyNote(props.note);
						else props.onDelete();
					}}
				/>
			}
		/>
	);
}

/** The open note: read in the reading style, edited in place, with where it came from. */
function NotePane(props: {
	note: Note;
	slug: string;
	onBack: () => void;
	onDelete: () => void;
}): JSX.Element {
	const auth = useAuth();
	const [editing, setEditing] = createSignal(false);
	const [draft, setDraft] = createSignal("");
	const [saving, setSaving] = createSignal(false);
	let menu: PopoverControl | undefined;

	// Another note opened: leave any edit behind.
	createEffect(
		() => props.note.id,
		() => {
			setEditing(false);
		},
	);

	function edit(): void {
		setDraft(props.note.body);
		setEditing(true);
	}

	async function save(): Promise<void> {
		const token = auth.token();
		const body = draft().trim();
		if (!token || !body || saving()) return;
		setSaving(true);
		try {
			await notesStore.update(token, props.slug, props.note.id, body);
			setEditing(false);
		} catch (cause) {
			notify({
				title: cause instanceof Error ? cause.message : "Could not save the note",
				tone: "danger",
			});
		} finally {
			setSaving(false);
		}
	}

	return (
		<>
			<PaneHeader
				title={noteSummary(props.note.body).title}
				onBack={props.onBack}
				backLabel="Back to notes"
				actions={
					<Show when={!editing()}>
						<IconButton size="sm" label="Edit note" onClick={edit}>
							<EditIcon />
						</IconButton>
						<Menu
							label="Note actions"
							trigger={<MoreIcon />}
							triggerClass={iconButton({ size: "sm" })}
							placement="bottom-end"
							control={(control) => {
								menu = control;
							}}
							groups={[
								{ items: [{ id: "copy", label: "Copy" }] },
								{ items: [{ id: "delete", label: "Delete", danger: true }] },
							]}
							onSelect={(id) => {
								menu?.close();
								if (id === "copy") void copyNote(props.note);
								else props.onDelete();
							}}
						/>
					</Show>
				}
			/>
			<div class="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-safe">
				<div class="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-5 md:px-8 md:py-8">
					<Row gap={1.5} wrap>
						<Text as="span" size="caption" tone="subtle">
							<time datetime={props.note.createdAt} title={props.note.createdAt}>
								Saved {relativeTime(props.note.createdAt)}
							</time>
						</Text>
						<Show when={props.note.source}>
							{(source) => (
								<Text as="span" size="caption" tone="subtle" truncate>
									· {source()}
								</Text>
							)}
						</Show>
						<Show when={props.note.threadId}>
							{(thread) => (
								<TextLink tone="accent" href={workspaceHref(`/chat/${props.slug}/${thread()}`)}>
									Open chat
								</TextLink>
							)}
						</Show>
					</Row>
					<Show
						when={editing()}
						fallback={
							<Show
								when={renderer()}
								fallback={<Text class="whitespace-pre-wrap break-words">{props.note.body}</Text>}
							>
								{(markdown) => (
									<Prose
										html={markdown().renderMarkdown(props.note.body)}
										onClick={(event) => markdown().copyCodeFrom(event)}
									/>
								)}
							</Show>
						}
					>
						<form
							onSubmit={(event) => {
								event.preventDefault();
								void save();
							}}
						>
							<Stack gap={3}>
								<MarkdownField
									label="Edit note"
									value={draft()}
									onInput={setDraft}
									onSubmit={() => void save()}
									rows={12}
								/>
								<Row gap={2} justify="end">
									<Button variant="ghost" onClick={() => setEditing(false)}>
										Cancel
									</Button>
									<Button type="submit" variant="primary" disabled={saving() || !draft().trim()}>
										{saving() ? "Saving…" : "Save"}
									</Button>
								</Row>
							</Stack>
						</form>
					</Show>
				</div>
			</div>
		</>
	);
}

/** A new note being written; saving opens it. */
function NewNotePane(props: { slug: string; onDone: (id: string | null) => void }): JSX.Element {
	const auth = useAuth();
	const [draft, setDraft] = createSignal("");
	const [saving, setSaving] = createSignal(false);

	async function save(): Promise<void> {
		const token = auth.token();
		const body = draft().trim();
		if (!token || !body || saving()) return;
		setSaving(true);
		try {
			const note = await notesStore.add(token, props.slug, { body });
			setDraft("");
			props.onDone(note.id);
		} catch (cause) {
			notify({
				title: cause instanceof Error ? cause.message : "Could not save the note",
				tone: "danger",
			});
		} finally {
			setSaving(false);
		}
	}

	return (
		<>
			<PaneHeader title="New note" onBack={() => props.onDone(null)} backLabel="Back to notes" />
			<div class="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-safe">
				<form
					class="mx-auto w-full max-w-3xl px-4 py-5 md:px-8 md:py-8"
					onSubmit={(event) => {
						event.preventDefault();
						void save();
					}}
				>
					<Stack gap={3}>
						<MarkdownField
							label="Note"
							value={draft()}
							onInput={setDraft}
							onSubmit={() => void save()}
							placeholder="A decision, a snippet, anything worth keeping…"
							rows={12}
						/>
						<Row gap={2} justify="end">
							<Button variant="ghost" onClick={() => props.onDone(null)}>
								Cancel
							</Button>
							<Button type="submit" variant="primary" disabled={saving() || !draft().trim()}>
								{saving() ? "Saving…" : "Save note"}
							</Button>
						</Row>
					</Stack>
				</form>
			</div>
		</>
	);
}
