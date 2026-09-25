import { useLocation, useMatch, useNavigate } from "@solidjs/router";
import type { JSX } from "@solidjs/web";
import { createEffect, createSignal, For, Show, untrack } from "solid-js";

import { useAuth } from "@/modules/auth";
import { threadsStore } from "@/modules/chat/stores/threads";
import type { ChatSession } from "@/modules/chat/types/chat.types";
import { type Project, useWorkspace } from "@/modules/projects";
import {
	BoardIcon,
	FileIcon,
	ChevronDownIcon,
	ConfirmDialog,
	FolderIcon,
	Menu,
	type MenuItem,
	MoreIcon,
	PlusIcon,
	Skeleton,
} from "@/ui";

import { useShell } from "../context/shell-context";

const OPEN_KEY = "grid.sidebar.open";

const PROJECT_MENU: MenuItem[] = [
	{ id: "new", label: "New thread" },
	{ id: "rename", label: "Rename" },
	{ id: "folder", label: "Change folder" },
	{ id: "board", label: "Open board" },
	{ id: "files", label: "Open files" },
	{ id: "remove", label: "Remove from Grid", danger: true },
];

const THREAD_MENU: MenuItem[] = [
	{ id: "rename", label: "Rename" },
	{ id: "delete", label: "Delete", danger: true },
];

const ROW =
	"focus-ring flex w-full min-w-0 items-center gap-2 rounded-md text-left text-ui transition-colors duration-fast ease-out-grid hover:bg-ink/10 hover:text-ink aria-[current=page]:bg-selection-strong aria-[current=page]:text-ink";

// Hover-revealed row actions; always shown on touch screens, which cannot hover.
const ACTIONS =
	"absolute inset-y-0 right-0.5 flex items-center opacity-0 transition-opacity duration-fast focus-within:opacity-100 group-hover/row:opacity-100 pointer-coarse:opacity-100";

function rememberedOpen(): string[] {
	try {
		const saved: unknown = JSON.parse(localStorage.getItem(OPEN_KEY) ?? "[]");
		return Array.isArray(saved)
			? saved.filter((slug): slug is string => typeof slug === "string")
			: [];
	} catch {
		return [];
	}
}

function relative(iso: string): string {
	const minutes = Math.round((Date.now() - Date.parse(iso)) / 60_000);
	if (minutes < 1) return "now";
	if (minutes < 60) return `${minutes}m`;
	const hours = Math.round(minutes / 60);
	if (hours < 24) return `${hours}h`;
	return `${Math.round(hours / 24)}d`;
}

/**
 * Projects as folders you open and close, each holding its threads. A project is a folder on
 * this machine: opening it lists its threads, picking it goes back to the thread you were in.
 * Projects and threads each have a menu (rename, and the rest).
 */
export function ProjectTree(): JSX.Element {
	const workspace = useWorkspace();
	const [open, setOpen] = createSignal<string[]>(rememberedOpen());
	const [deleting, setDeleting] = createSignal<ChatSession | null>(null);
	const [pending, setPending] = createSignal(false);
	const auth = useAuth();

	function setOpenFor(slug: string, value: boolean): void {
		const current = untrack(open);
		const next = value ? [...new Set([...current, slug])] : current.filter((item) => item !== slug);
		setOpen(next);
		try {
			localStorage.setItem(OPEN_KEY, JSON.stringify(next));
		} catch {
			// Not remembered; the tree opens on the current project next time.
		}
	}

	// The project you are in is always open.
	createEffect(
		() => workspace.currentSlug(),
		(slug) => {
			if (slug && !untrack(open).includes(slug)) setOpenFor(slug, true);
		},
	);

	return (
		<>
			<Show
				when={workspace.projects().length > 0}
				fallback={
					<div class="px-2">
						<button
							type="button"
							class={`${ROW} h-8 px-2 text-ink/50 pointer-coarse:h-11`}
							onClick={() => workspace.setAddProjectOpen(true)}
						>
							<PlusIcon class="size-4 shrink-0" />
							Open a folder as a project
						</button>
					</div>
				}
			>
				<ul class="flex flex-col gap-px px-2">
					<For each={workspace.projects()}>
						{(project) => (
							<ProjectNode
								project={project}
								open={open().includes(project.slug)}
								onToggle={(value) => setOpenFor(project.slug, value)}
								onDelete={setDeleting}
							/>
						)}
					</For>
				</ul>
			</Show>
			<ConfirmDialog
				open={deleting() !== null}
				title={`Delete “${deleting()?.title ?? "this thread"}”?`}
				description="The thread and its history are removed. Files the agent changed stay as they are."
				confirmLabel="Delete"
				tone="danger"
				pending={pending()}
				onConfirm={() => {
					const session = deleting();
					const token = auth.token();
					if (!session || !token) return;
					setPending(true);
					void threadsStore.remove(token, session).finally(() => {
						setPending(false);
						setDeleting(null);
					});
				}}
				onCancel={() => setDeleting(null)}
			/>
		</>
	);
}

function ProjectNode(props: {
	project: Project;
	open: boolean;
	onToggle: (open: boolean) => void;
	onDelete: (session: ChatSession) => void;
}): JSX.Element {
	const auth = useAuth();
	const shell = useShell();
	const workspace = useWorkspace();
	const navigate = useNavigate();
	const location = useLocation();
	const slug = () => props.project.slug;
	const current = () => slug() === workspace.currentSlug();
	const folder = () => workspace.folders()[slug()];
	const onBoard = () => workspace.activeSlug() === slug();

	// A project's threads are read the first time it is opened.
	createEffect(
		() => [props.open, auth.token(), slug(), threadsStore.loaded(slug())] as const,
		([open, token, project, loaded]) => {
			if (open && token && !loaded) void threadsStore.load(token, project);
		},
	);

	function onMenu(id: string): void {
		// The dialogs open over the page, so the phone drawer steps aside first.
		if (id !== "new" && id !== "board") shell.setDrawerOpen(false);
		if (id === "new") navigate(`/chat/${slug()}`);
		else if (id === "rename" || id === "remove")
			workspace.setProjectAction({ kind: id, slug: slug() });
		else if (id === "folder") workspace.chooseFolderFor(slug());
		else if (id === "board") navigate(`/board/${slug()}`);
		else if (id === "files") navigate(`/files/${slug()}`);
	}

	return (
		<li>
			<div class="group/row relative flex items-center">
				<button
					type="button"
					aria-label={props.open ? `Close ${props.project.name}` : `Open ${props.project.name}`}
					aria-expanded={props.open ? "true" : "false"}
					class="focus-ring grid size-6 shrink-0 place-items-center rounded-md text-ink/40 hover:bg-ink/10 hover:text-ink pointer-coarse:size-10"
					onClick={() => props.onToggle(!props.open)}
				>
					<ChevronDownIcon
						class={`size-3.5 transition-transform duration-fast ${props.open ? "" : "-rotate-90"}`}
					/>
				</button>
				<a
					href={`/chat/${slug()}`}
					aria-current={current() ? "page" : undefined}
					class={`${ROW} h-8 flex-1 pr-15 pl-1 font-medium text-ink/60 pointer-coarse:h-11`}
					onClick={(event) => {
						if (event.metaKey || event.ctrlKey || event.shiftKey) return;
						event.preventDefault();
						props.onToggle(true);
						// Read at click time: the last thread changes as you work.
						navigate(workspace.projectHref(slug()));
					}}
				>
					<FolderIcon class="size-4 shrink-0 text-ink/45" />
					<span class="min-w-0 flex-1 truncate">{props.project.name}</span>
				</a>
				<div class={ACTIONS}>
					<a
						href={`/chat/${slug()}`}
						title="New thread"
						aria-label={`New thread in ${props.project.name}`}
						class="focus-ring grid size-6 place-items-center rounded-md text-ink/50 hover:bg-ink/10 hover:text-ink pointer-coarse:size-10"
					>
						<PlusIcon class="size-3.5" />
					</a>
					<Menu
						label={`${props.project.name} options`}
						trigger={<MoreIcon class="size-4" />}
						items={PROJECT_MENU}
						onSelect={onMenu}
					/>
				</div>
			</div>
			<Show when={props.open}>
				<div class="mb-1 ml-3 flex flex-col gap-px border-ink/10 border-l pl-1.5">
					<a
						href={`/board/${slug()}`}
						aria-current={onBoard() ? "page" : undefined}
						class={`${ROW} h-7 px-2 text-ink/60 text-ui-sm pointer-coarse:h-10`}
					>
						<BoardIcon class="size-3.5 shrink-0 text-ink/45" />
						Board
					</a>
					<a
						href={`/files/${slug()}`}
						aria-current={location.pathname === `/files/${slug()}` ? "page" : undefined}
						class={`${ROW} h-7 px-2 text-ink/60 text-ui-sm pointer-coarse:h-11`}
					>
						<FileIcon class="size-3.5 shrink-0 text-ink/45" /> Files
					</a>
					<Show when={!folder()}>
						<button
							type="button"
							class={`${ROW} h-7 px-2 text-link text-ui-sm pointer-coarse:h-10`}
							onClick={() => {
								shell.setDrawerOpen(false);
								workspace.chooseFolderFor(slug());
							}}
						>
							<FolderIcon class="size-3.5 shrink-0" />
							Choose its folder
						</button>
					</Show>
					<Show when={threadsStore.loaded(slug())} fallback={<Skeleton class="my-0.5 h-6" />}>
						<Show
							when={threadsStore.threads(slug()).length > 0}
							fallback={
								<p class="px-2 py-1 text-ink/40 text-ui-xs">
									{threadsStore.error(slug()) ?? "No threads yet"}
								</p>
							}
						>
							<For each={threadsStore.threads(slug())}>
								{(session) => <ThreadRow session={session} onDelete={props.onDelete} />}
							</For>
						</Show>
					</Show>
				</div>
			</Show>
		</li>
	);
}

function ThreadRow(props: {
	session: ChatSession;
	onDelete: (session: ChatSession) => void;
}): JSX.Element {
	const auth = useAuth();
	const inThread = useMatch(() => "/chat/:project/:id");
	const [renaming, setRenaming] = createSignal(false);
	const [error, setError] = createSignal<string | null>(null);
	const active = () => inThread()?.params.id === props.session.id;

	async function save(title: string): Promise<void> {
		const token = untrack(auth.token);
		const next = title.trim();
		// Enter saves and closes the field, which then blurs: only the first of the two counts. The
		// blur arrives while the field is being removed, inside an update, so the reads are untracked.
		if (!untrack(renaming)) return;
		const session = untrack(() => props.session);
		setRenaming(false);
		if (!token || !next || next === session.title) return;
		try {
			await threadsStore.rename(token, session, next);
			setError(null);
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : "Could not rename the thread");
		}
	}

	return (
		<div class="group/row relative">
			<Show
				when={renaming()}
				fallback={
					<a
						href={`/chat/${props.session.project}/${props.session.id}`}
						aria-current={active() ? "page" : undefined}
						title={error() ?? props.session.title}
						class={`${ROW} h-7 pr-8 pl-2 text-ink/60 text-ui-sm pointer-coarse:h-10 ${error() ? "text-danger" : ""}`}
						onDblClick={(event) => {
							event.preventDefault();
							setRenaming(true);
						}}
					>
						<span class="min-w-0 flex-1 truncate">{props.session.title}</span>
						<span class="shrink-0 text-ink/35 text-ui-caption tabular-nums group-hover/row:invisible pointer-coarse:invisible">
							{relative(props.session.updatedAt)}
						</span>
					</a>
				}
			>
				<input
					ref={(el) => queueMicrotask(() => el.select())}
					value={props.session.title}
					aria-label="Thread name"
					class="h-7 w-full rounded-md border border-ink/20 bg-canvas px-2 text-ink text-ui-sm outline-none focus:border-ink/40 pointer-coarse:h-10 pointer-coarse:text-ui-input"
					onKeyDown={(event) => {
						if (event.key === "Enter") void save(event.currentTarget.value);
						else if (event.key === "Escape") setRenaming(false);
					}}
					onBlur={(event) => void save(event.currentTarget.value)}
				/>
			</Show>
			<Show when={!renaming()}>
				<div class={ACTIONS}>
					<Menu
						label={`${props.session.title} options`}
						trigger={<MoreIcon class="size-4" />}
						items={THREAD_MENU}
						onSelect={(id) => {
							if (id === "rename") setRenaming(true);
							// The confirmation is a modal of its own, above the drawer.
							else props.onDelete(props.session);
						}}
					/>
				</div>
			</Show>
		</div>
	);
}
