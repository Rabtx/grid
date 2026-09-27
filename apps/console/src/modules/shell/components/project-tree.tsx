import { useMatch, useNavigate } from "@solidjs/router";
import type { JSX } from "@solidjs/web";
import { createEffect, createSignal, For, onSettled, Show, untrack } from "solid-js";

import {
	BoardIcon,
	BranchIcon,
	CheckIcon,
	ConfirmDialog,
	EditIcon,
	FileIcon,
	FolderIcon,
	IconButton,
	iconButton,
	InlineInput,
	Menu,
	type MenuGroup,
	MoreIcon,
	NavButton,
	NavGroup,
	NavLink,
	NavNote,
	NoteIcon,
	notify,
	PullRequestIcon,
	PlusIcon,
	type PopoverControl,
	Shimmer,
	Skeleton,
	Stack,
	Text,
	TrashIcon,
	WorkingDots,
} from "@/kit";
import { workspaceHref } from "@/lib/active-workspace";
import { useAuth } from "@/modules/auth";
import { chatService } from "@/modules/chat/services/chat.service";
import { threadsStore } from "@/modules/chat/stores/threads";
import { placementsStore } from "@/modules/environments/stores/placements";
import type { ChatSession } from "@/modules/chat/types/chat.types";
import { type Project, ProjectIcon, useWorkspace } from "@/modules/projects";

import { useShell } from "../context/shell-context";

import { WorktreeDialog } from "./worktree-dialog";

const OPEN_KEY = "grid.sidebar.open";

/**
 * A project's menu. `worktrees` is whether its new threads get their own git worktree (null
 * while that is not known yet).
 */
function projectMenu(worktrees: boolean | null): MenuGroup[] {
	return [
		{
			items: [
				{ id: "new", label: "New thread", icon: <PlusIcon /> },
				{ id: "rename", label: "Rename", icon: <EditIcon /> },
				{ id: "customize", label: "Customize…" },
				{ id: "folder", label: "Change folder", icon: <FolderIcon /> },
			],
		},
		{
			items: [
				{ id: "board", label: "Open board", icon: <BoardIcon /> },
				{ id: "files", label: "Open files", icon: <FileIcon /> },
				{ id: "pulls", label: "Open pull requests", icon: <PullRequestIcon /> },
				{ id: "notes", label: "Open notes", icon: <NoteIcon /> },
			],
		},
		{
			items: [
				{
					id: "worktrees",
					label: "A worktree per thread",
					icon: <BranchIcon />,
					disabled: worktrees === null,
					trailing: worktrees ? <CheckIcon size="sm" /> : undefined,
				},
			],
		},
		{ items: [{ id: "remove", label: "Remove from Grid", icon: <TrashIcon />, danger: true }] },
	];
}

/** A thread's menu; one with its own worktree can remove it. */
function threadMenu(session: ChatSession): MenuGroup[] {
	return [
		{
			items: [
				{ id: "rename", label: "Rename", icon: <EditIcon /> },
				...(session.worktree
					? [{ id: "worktree", label: "Remove worktree…", icon: <BranchIcon /> }]
					: []),
				{ id: "delete", label: "Delete", icon: <TrashIcon />, danger: true },
			],
		},
	];
}

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
 * Projects as folders you open and close, each holding its pages and threads. A project is a
 * folder on this machine: opening it lists its threads, picking it goes back to the thread you
 * were in. Projects and threads each have a menu: ⋯ on hover, right-click, or a long press.
 */
export function ProjectTree(): JSX.Element {
	const workspace = useWorkspace();
	const auth = useAuth();
	const [open, setOpen] = createSignal<string[]>(rememberedOpen());
	const [deleting, setDeleting] = createSignal<ChatSession | null>(null);
	const [discarding, setDiscarding] = createSignal<ChatSession | null>(null);
	const [pending, setPending] = createSignal(false);

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

	// Which threads are working, for the shimmer and the moving project icons.
	onSettled(() => threadsStore.watchRunning(() => auth.token()));

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
					<NavButton
						icon={<PlusIcon />}
						label="Open a folder as a project"
						onClick={() => workspace.setAddProjectOpen(true)}
					/>
				}
			>
				<Stack gap={0.5}>
					<For each={workspace.projects()}>
						{(project) => (
							<ProjectNode
								project={project}
								open={open().includes(project.slug)}
								onToggle={(value) => setOpenFor(project.slug, value)}
								onDelete={setDeleting}
								onWorktree={setDiscarding}
							/>
						)}
					</For>
				</Stack>
			</Show>
			<WorktreeDialog session={discarding()} onClose={() => setDiscarding(null)} />
			<ConfirmDialog
				open={deleting() !== null}
				onClose={() => setDeleting(null)}
				title={`Delete “${deleting()?.title ?? "this thread"}”?`}
				description="The thread and its history are removed. Its worktree goes too if nothing in it is uncommitted or unpushed; otherwise it stays, with its branch."
				confirm="Delete"
				danger
				stayOpen
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
			/>
		</>
	);
}

function ProjectNode(props: {
	project: Project;
	open: boolean;
	onWorktree: (session: ChatSession) => void;
	onToggle: (open: boolean) => void;
	onDelete: (session: ChatSession) => void;
}): JSX.Element {
	const auth = useAuth();
	const shell = useShell();
	const workspace = useWorkspace();
	const navigate = useNavigate();
	const slug = () => props.project.slug;
	const current = () => slug() === workspace.currentSlug();
	const folder = () => workspace.folders()[slug()];
	let menu: PopoverControl | undefined;

	// A project's threads are read the first time it is opened.
	createEffect(
		() => [props.open, auth.token(), slug(), threadsStore.loaded(slug())] as const,
		([open, token, project, loaded]) => {
			if (open && token && !loaded) void threadsStore.load(token, project);
		},
	);

	// Whether new threads get their own worktree, read when the project is opened.
	const [worktrees, setWorktrees] = createSignal<boolean | null>(null);
	createEffect(
		() => [props.open, auth.token(), slug()] as const,
		([open, token, project]) => {
			if (!open || !token) return;
			chatService
				.projectSettings(token, project, placementsStore.scopeOf(project))
				.then((settings) => setWorktrees(settings.worktrees))
				.catch(() => setWorktrees(null));
		},
	);

	async function toggleWorktrees(): Promise<void> {
		const token = auth.token();
		const next = !worktrees();
		if (!token) return;
		setWorktrees(next);
		try {
			await chatService.saveProjectSettings(
				token,
				slug(),
				{ worktrees: next },
				placementsStore.scopeOf(slug()),
			);
			notify({
				title: next
					? "New threads get their own worktree"
					: "New threads work in the project folder",
			});
		} catch (cause) {
			setWorktrees(!next);
			notify({ title: cause instanceof Error ? cause.message : "Not saved", tone: "danger" });
		}
	}

	function onMenu(id: string): void {
		if (id === "worktrees") return void toggleWorktrees();
		// The dialogs open over the page, so the phone drawer steps aside first.
		if (id !== "new" && id !== "board") shell.setDrawerOpen(false);
		if (id === "new") navigate(`/chat/${slug()}`);
		else if (id === "rename" || id === "remove" || id === "customize")
			workspace.setProjectAction({ kind: id, slug: slug() });
		else if (id === "folder") workspace.chooseFolderFor(slug());
		else if (id === "board") navigate(`/board/${slug()}`);
		else if (id === "files") navigate(`/files/${slug()}`);
		else if (id === "notes") navigate(`/notes/${slug()}`);
		else if (id === "pulls") navigate(`/pulls/${slug()}`);
	}

	return (
		<div>
			<NavLink
				href={workspaceHref(`/chat/${slug()}`)}
				aria-expanded={props.open ? "true" : "false"}
				icon={<ProjectIcon project={props.project} running={threadsStore.runningIn(slug()) > 0} />}
				label={props.project.name}
				onMenuAt={(point) => menu?.open(point)}
				onClick={(event: MouseEvent) => {
					if (event.metaKey || event.ctrlKey || event.shiftKey) return;
					event.preventDefault();
					// The project you are in folds and unfolds; another one opens and is gone to.
					if (current() && props.open) return props.onToggle(false);
					props.onToggle(true);
					// Read at click time: the last thread changes as you work.
					navigate(workspace.projectHref(slug()));
				}}
				actions={
					<>
						<IconButton
							size="xs"
							label={`New thread in ${props.project.name}`}
							onClick={() => navigate(`/chat/${slug()}`)}
						>
							<PlusIcon size="sm" />
						</IconButton>
						<Menu
							label={`${props.project.name} options`}
							pointerOnly
							width="md:w-56"
							triggerClass={iconButton({ size: "xs" })}
							trigger={<MoreIcon />}
							groups={projectMenu(worktrees())}
							onSelect={onMenu}
							control={(control) => {
								menu = control;
							}}
						/>
					</>
				}
			/>
			<Show when={props.open}>
				<NavGroup>
					<Show when={!folder()}>
						<NavButton
							level={1}
							tone="accent"
							icon={<FolderIcon size="sm" />}
							label="Choose its folder"
							onClick={() => {
								shell.setDrawerOpen(false);
								workspace.chooseFolderFor(slug());
							}}
						/>
					</Show>
					<Show when={threadsStore.loaded(slug())} fallback={<Skeleton class="my-0.5 h-6" />}>
						<Show
							when={threadsStore.threads(slug()).length > 0}
							fallback={<NavNote>{threadsStore.error(slug()) ?? "No threads yet"}</NavNote>}
						>
							<For each={threadsStore.threads(slug())}>
								{(session) => (
									<ThreadRow
										session={session}
										onDelete={props.onDelete}
										onWorktree={props.onWorktree}
									/>
								)}
							</For>
						</Show>
					</Show>
				</NavGroup>
			</Show>
		</div>
	);
}

function ThreadRow(props: {
	session: ChatSession;
	onDelete: (session: ChatSession) => void;
	onWorktree: (session: ChatSession) => void;
}): JSX.Element {
	const auth = useAuth();
	const inThread = useMatch(() => "/chat/:project/:id");
	const [renaming, setRenaming] = createSignal(false);
	const [error, setError] = createSignal<string | null>(null);
	const active = () => inThread()?.params.id === props.session.id;
	const running = () => threadsStore.isRunning(props.session.id);
	let menu: PopoverControl | undefined;

	async function save(title: string): Promise<void> {
		const token = untrack(auth.token);
		const next = title.trim();
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
		<Show
			when={!renaming()}
			fallback={
				<InlineInput
					label="Thread name"
					value={props.session.title}
					onSave={(value) => void save(value)}
					onCancel={() => setRenaming(false)}
				/>
			}
		>
			<NavLink
				level={1}
				href={workspaceHref(`/chat/${props.session.project}/${props.session.id}`)}
				current={active()}
				tone={error() ? "danger" : "default"}
				title={error() ?? props.session.title}
				label={<Shimmer active={running()}>{props.session.title}</Shimmer>}
				trailing={
					<Show
						when={running()}
						fallback={
							<Text as="span" size="micro" tone="faint" tabular>
								{relative(props.session.updatedAt)}
							</Text>
						}
					>
						<WorkingDots />
					</Show>
				}
				onDblClick={(event: MouseEvent) => {
					event.preventDefault();
					setRenaming(true);
				}}
				onMenuAt={(point) => menu?.open(point)}
				actions={
					<Menu
						label={`${props.session.title} options`}
						pointerOnly
						width="md:w-44"
						triggerClass={iconButton({ size: "xs" })}
						trigger={<MoreIcon />}
						groups={threadMenu(props.session)}
						control={(control) => {
							menu = control;
						}}
						onSelect={(id) => {
							if (id === "rename") setRenaming(true);
							// The confirmations are modals of their own, above the drawer.
							else if (id === "worktree") props.onWorktree(props.session);
							else props.onDelete(props.session);
						}}
					/>
				}
			/>
		</Show>
	);
}
