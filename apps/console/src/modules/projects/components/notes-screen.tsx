import { useMatch } from "@solidjs/router";
import type { JSX } from "@solidjs/web";
import { createEffect, createSignal, For, onSettled, Show } from "solid-js";

import { workspaceHref } from "@/lib/active-workspace";
import { useAuth } from "@/modules/auth";
import {
	attachContextMenu,
	Button,
	ConfirmDialog,
	EmptyState,
	ErrorNotice,
	Menu,
	type MenuControl,
	MoreIcon,
	NoteIcon,
	PlusIcon,
	Skeleton,
	toast,
} from "@/ui";

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

/**
 * A project's notes: decisions, snippets and agent answers worth keeping, newest first. Saved
 * here or from any chat with "Add as note"; they belong to the project, not to a machine.
 */
export function NotesScreen(): JSX.Element {
	const auth = useAuth();
	const workspace = useWorkspace();
	const match = useMatch(() => "/notes/:slug");
	const slug = () => match()?.params.slug ?? "";
	const project = () => workspace.projects().find((item) => item.slug === slug());
	const [writing, setWriting] = createSignal(false);
	const [draft, setDraft] = createSignal("");
	const [saving, setSaving] = createSignal(false);
	const [deleting, setDeleting] = createSignal<Note | null>(null);

	loadRenderer();

	createEffect(
		() => [auth.token(), slug()] as const,
		([token, projectSlug]) => {
			if (token && projectSlug) void notesStore.load(token, projectSlug);
		},
	);

	async function save(): Promise<void> {
		const token = auth.token();
		const body = draft().trim();
		if (!token || !body || saving()) return;
		setSaving(true);
		try {
			await notesStore.add(token, slug(), { body });
			setDraft("");
			setWriting(false);
		} catch (cause) {
			toast({
				message: cause instanceof Error ? cause.message : "Could not save the note",
				tone: "danger",
			});
		} finally {
			setSaving(false);
		}
	}

	async function remove(note: Note): Promise<void> {
		const token = auth.token();
		if (!token) return;
		try {
			await notesStore.remove(token, slug(), note.id);
		} catch (cause) {
			toast({
				message: cause instanceof Error ? cause.message : "Could not delete the note",
				tone: "danger",
			});
		}
	}

	return (
		<Show when={project()} fallback={<EmptyState title="Project not found" />}>
			<div class="mx-auto flex w-full max-w-3xl min-w-0 flex-col gap-3">
				<header class="flex min-w-0 items-center justify-between gap-2 border-stroke border-b pb-3">
					<div class="min-w-0">
						<h1 class="font-semibold text-ink text-title">Notes</h1>
						<p class="truncate text-ink/45 text-ui-sm">{project()?.name}</p>
					</div>
					<Show when={!writing()}>
						<Button
							size="md"
							variant="primary"
							onClick={() => setWriting(true)}
							class="shrink-0 pointer-coarse:min-h-11"
						>
							<PlusIcon class="size-4" /> Note
						</Button>
					</Show>
				</header>
				<Show when={writing()}>
					<form
						class="flex flex-col gap-2 rounded-lg border border-ink/10 p-3"
						onSubmit={(event) => {
							event.preventDefault();
							void save();
						}}
					>
						<MarkdownField
							label="New note"
							value={draft()}
							onInput={setDraft}
							onSubmit={() => void save()}
							placeholder="A decision, a snippet, anything worth keeping…"
						/>
						<div class="flex justify-end gap-2">
							<Button
								onClick={() => {
									setWriting(false);
									setDraft("");
								}}
							>
								Cancel
							</Button>
							<Button type="submit" variant="primary" disabled={saving() || !draft().trim()}>
								{saving() ? "Saving…" : "Save note"}
							</Button>
						</div>
					</form>
				</Show>
				<Show when={notesStore.error(slug())}>
					{(message) => (
						<ErrorNotice
							message={message()}
							action={
								<Button
									size="sm"
									onClick={() => {
										const token = auth.token();
										if (token) void notesStore.load(token, slug());
									}}
								>
									Try again
								</Button>
							}
						/>
					)}
				</Show>
				<Show
					when={notesStore.loaded(slug())}
					fallback={
						<div class="flex flex-col gap-2">
							<Skeleton class="h-20" />
							<Skeleton class="h-20" />
						</div>
					}
				>
					<Show
						when={notesStore.notes(slug()).length > 0}
						fallback={
							<Show when={!writing() && !notesStore.error(slug())}>
								<div class="flex flex-col items-center gap-2 px-4 py-12 text-center">
									<NoteIcon class="size-6 text-ink/30" />
									<p class="font-medium text-ink/70 text-ui">No notes yet</p>
									<p class="max-w-sm text-ink/45 text-ui-sm">
										Keep decisions and agent answers here: write one, or use “Add as note” on any
										message in a chat.
									</p>
								</div>
							</Show>
						}
					>
						<ul class="flex flex-col gap-2">
							<For each={notesStore.notes(slug())}>
								{(note) => <NoteCard note={note} slug={slug()} onDelete={setDeleting} />}
							</For>
						</ul>
					</Show>
				</Show>
			</div>
			<ConfirmDialog
				open={deleting() !== null}
				title="Delete this note?"
				description="It is removed from the project for everyone. This cannot be undone."
				confirmLabel="Delete"
				tone="danger"
				onConfirm={() => {
					const note = deleting();
					setDeleting(null);
					if (note) void remove(note);
				}}
				onCancel={() => setDeleting(null)}
			/>
		</Show>
	);
}

function NoteCard(props: {
	note: Note;
	slug: string;
	onDelete: (note: Note) => void;
}): JSX.Element {
	const auth = useAuth();
	const [editing, setEditing] = createSignal(false);
	const [draft, setDraft] = createSignal("");
	const [saving, setSaving] = createSignal(false);
	let row: HTMLLIElement | undefined;
	let menu: MenuControl | undefined;
	// Right-click and long press open the note's menu; the ⋯ is for pointers, on hover.
	onSettled(() => (row ? attachContextMenu(row, (point) => menu?.open(point)) : undefined));

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
			toast({
				message: cause instanceof Error ? cause.message : "Could not save the note",
				tone: "danger",
			});
		} finally {
			setSaving(false);
		}
	}

	function onMenu(id: string): void {
		if (id === "edit") edit();
		else if (id === "copy")
			void navigator.clipboard?.writeText(props.note.body).then(
				() => toast({ message: "Note copied" }),
				() => toast({ message: "Could not copy to the clipboard", tone: "danger" }),
			);
		else if (id === "delete") props.onDelete(props.note);
	}

	return (
		<li
			ref={(el) => {
				row = el;
			}}
			class="group/note relative min-w-0 rounded-lg border border-ink/10 px-3.5 py-3 [-webkit-touch-callout:none]"
		>
			<Show
				when={editing()}
				fallback={
					<>
						{/* oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- delegates clicks from the code cards' own buttons */}
						<div
							class="chat-prose min-w-0 break-words pr-7 text-ink text-ui"
							innerHTML={renderer()?.renderMarkdown(props.note.body) ?? ""}
							onClick={(event) => renderer()?.copyCodeFrom(event)}
						/>
						<Show when={!renderer()}>
							<p class="whitespace-pre-wrap break-words pr-7 text-ink text-ui">{props.note.body}</p>
						</Show>
						<p class="mt-2 flex min-w-0 flex-wrap items-center gap-x-1.5 text-ink/45 text-ui-xs">
							<Show when={props.note.source}>
								{(source) => <span class="min-w-0 truncate">{source()}</span>}
							</Show>
							<Show when={props.note.source}>
								<span aria-hidden="true">·</span>
							</Show>
							<time datetime={props.note.createdAt} title={props.note.createdAt}>
								{relativeTime(props.note.createdAt)}
							</time>
							<Show when={props.note.threadId}>
								{(thread) => (
									<>
										<span aria-hidden="true">·</span>
										<a
											href={workspaceHref(`/chat/${props.slug}/${thread()}`)}
											class="focus-ring rounded-sm text-link underline-offset-2 hover:underline pointer-coarse:py-2"
										>
											Open chat
										</a>
									</>
								)}
							</Show>
						</p>
					</>
				}
			>
				<form
					class="flex flex-col gap-2"
					onSubmit={(event) => {
						event.preventDefault();
						void save();
					}}
				>
					<MarkdownField
						label="Edit note"
						value={draft()}
						onInput={setDraft}
						onSubmit={() => void save()}
					/>
					<div class="flex justify-end gap-2">
						<Button onClick={() => setEditing(false)}>Cancel</Button>
						<Button type="submit" variant="primary" disabled={saving() || !draft().trim()}>
							{saving() ? "Saving…" : "Save"}
						</Button>
					</div>
				</form>
			</Show>
			<Show when={!editing()}>
				<div class="absolute top-2 right-2 opacity-0 transition-opacity duration-fast focus-within:opacity-100 group-hover/note:opacity-100 pointer-coarse:opacity-100">
					<Menu
						label="Note actions"
						trigger={<MoreIcon class="size-4" />}
						items={[
							{ id: "edit", label: "Edit" },
							{ id: "copy", label: "Copy" },
							{ id: "delete", label: "Delete", danger: true },
						]}
						pointerOnly
						control={(control) => {
							menu = control;
						}}
						onSelect={onMenu}
					/>
				</div>
			</Show>
		</li>
	);
}
