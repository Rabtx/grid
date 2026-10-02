import { useBeforeLeave, useMatch, useNavigate, useSearchParams } from "@solidjs/router";
import type { JSX } from "@solidjs/web";
import { createEffect, createMemo, createSignal, For, Loading, Show, untrack } from "solid-js";

import { workspaceHref } from "@/lib/active-workspace";
import {
	Alert,
	Avatar,
	BranchIcon,
	Button,
	ChevronRightIcon,
	CodeAskAction,
	CodeAskBar,
	CodeLines,
	ConfirmDialog,
	CopyIcon,
	DiffCard,
	Dialog,
	DiffStat,
	EditIcon,
	EmptyState,
	EntryIcon,
	Field,
	FileIcon,
	FileRow,
	type FolderEntry,
	FolderIcon,
	FolderTree,
	GitBadge,
	GitMark,
	HeaderTabs,
	IconButton,
	iconButton,
	Input,
	LaptopIcon,
	type LineRange,
	Menu,
	type MenuGroup,
	MoreIcon,
	NavNote,
	notify,
	PlusIcon,
	type PopoverControl,
	Prose,
	ProjectTile,
	SearchIcon,
	SearchInput,
	Segmented,
	Skeleton,
	SparklesIcon,
	Stack,
	StatusDot,
	StatusStrip,
	Table,
	Td,
	Text,
	Th,
	Tr,
} from "@/kit";
import { diffLines } from "@/kit/diff";
import { useAuth } from "@/modules/auth";
import { highlightLines, languageFor, renderMarkdown } from "@/modules/chat/lib/markdown";
import { draftsStore } from "@/modules/chat/stores/drafts";
import { environmentsStore, placementsStore } from "@/modules/environments";
import { ShellSlot } from "@/modules/shell";

import { useWorkspace } from "../context/workspace-context";
import { changeOf, changesIn, lineMarks } from "../lib/file-git";
import { relativeTime } from "../lib/relative-time";
import {
	type FileChange,
	filesService,
	type LastChange,
	type ProjectFile,
	type ProjectFileContent,
	type ProjectFileListing,
} from "../services/files.service";

import { FileEditor } from "./file-editor";

const NEEDS_FOLDER = "Choose this project's folder";

function parent(path: string): string {
	return path.split("/").slice(0, -1).join("/");
}

function baseName(path: string): string {
	return path.split("/").pop() ?? path;
}

function message(cause: unknown, fallback: string): string {
	return cause instanceof Error ? cause.message : fallback;
}

async function copy(value: string, what: string): Promise<void> {
	try {
		await navigator.clipboard.writeText(value);
		notify({ title: `Copied ${what}` });
	} catch {
		notify({ title: "Could not copy to the clipboard", tone: "danger" });
	}
}

/** "Sam · Round ETAs · 2h ago": who last changed something, what, and when. */
function lastLine(last: LastChange | null | undefined): string | undefined {
	if (!last) return undefined;
	return [last.subject, relativeTime(last.at)].filter(Boolean).join(" · ");
}

const tabsKey = (slug: string) => `grid.files.tabs.${slug}`;

function rememberedTabs(slug: string): string[] {
	try {
		const saved: unknown = JSON.parse(localStorage.getItem(tabsKey(slug)) ?? "[]");
		return Array.isArray(saved)
			? saved.filter((item): item is string => typeof item === "string")
			: [];
	} catch {
		return [];
	}
}

function rememberTabs(slug: string, paths: string[]): void {
	try {
		localStorage.setItem(tabsKey(slug), JSON.stringify(paths));
	} catch {
		// Not kept; the tabs start empty next time.
	}
}

/**
 * A project's files (Figma 13 · Files & Editor): the tree in the panel, a folder as a table of its
 * entries with who last changed each (a list on phones, its changes first), and a file to read
 * with what changed since the last commit marked in its margin. The open folder and file are in
 * the URL (`?dir=`, `?file=`), so a link or a reload lands on them.
 */
export function FilesScreen(): JSX.Element {
	return (
		<Loading
			fallback={
				<div class="p-4">
					<Skeleton class="h-11" />
				</div>
			}
		>
			<FilesView />
		</Loading>
	);
}

function FilesView(): JSX.Element {
	// Each row's menu by path, so a long press on the row (touch) opens the same menu as its ⋯.
	const entryMenus = new Map<string, PopoverControl>();
	const auth = useAuth();
	const workspace = useWorkspace();
	const navigate = useNavigate();
	const match = useMatch(() => "/files/:slug");
	const [search, setSearch] = useSearchParams<{ file?: string; dir?: string; show?: string }>();
	const slug = () => match()?.params.slug ?? "";
	const project = () => workspace.projects().find((item) => item.slug === slug());
	const file = () => search.file ?? "";
	// The folder on screen: the open file's, or the one asked for.
	const dir = () => (file() ? parent(file()) : (search.dir ?? ""));
	const [listings, setListings] = createSignal<ReadonlyMap<string, readonly FolderEntry[]>>(
		new Map(),
	);
	const [errors, setErrors] = createSignal<ReadonlyMap<string, string>>(new Map());
	// The project's git story, read with the folder on screen: branch, changes, last commits.
	const [repo, setRepo] = createSignal<ProjectFileListing["git"]>(null);
	const [lasts, setLasts] = createSignal<Record<string, LastChange>>({});
	const [creating, setCreating] = createSignal<{ kind: ProjectFile["kind"]; in: string } | null>(
		null,
	);
	// Bumped to read the tree again from the root: after linking a folder, or "Try again".
	const [revision, setRevision] = createSignal(0);
	/** The file being edited with unsaved changes, so its row carries a dirty dot. */
	const [dirtyPath, setDirtyPath] = createSignal<string | null>(null);
	/** Where to go once unsaved changes are confirmed away; wrapped, as a signal cannot hold a bare function. */
	const [leaving, setLeaving] = createSignal<{ go: () => void } | null>(null);
	let discarded = false;
	const unsaved = () => !discarded && dirtyPath() !== null;
	/** The file whose editor should open as soon as it is read: a file just created. */
	const [editOnOpen, setEditOnOpen] = createSignal<string | null>(null);
	const changes = () => repo()?.changes ?? [];
	/** Folder reads under way, so a reveal and a click do not read the same folder twice. */
	const inFlight = new Set<string>();

	/**
	 * The token and project are passed in rather than read here: this runs from the effects below,
	 * which already track both. A listing for another project than the one on screen is dropped.
	 * `git` asks for the folder's git story too (the folder on screen).
	 */
	async function load(
		path: string,
		token: string | null,
		project: string | null,
		git = false,
	): Promise<void> {
		if (!token || !project) return;
		const key = `${project}\n${path}\n${git}`;
		if (inFlight.has(key)) return;
		inFlight.add(key);
		try {
			const listing = await filesService.list(token, project, path, git);
			if (project !== slug()) return;
			setListings((current) => new Map(current).set(path, listing.entries));
			setErrors((current) => {
				const next = new Map(current);
				next.delete(path);
				return next;
			});
			if (git) {
				setRepo(listing.git ?? null);
				setLasts((current) => ({ ...current, ...listing.git?.last }));
			}
		} catch (cause) {
			if (project !== slug()) return;
			setErrors((current) =>
				new Map(current).set(path, message(cause, "Could not read this folder")),
			);
		} finally {
			inFlight.delete(key);
		}
	}

	// A new project, a newly linked folder or a retry starts the tree over from its root.
	createEffect(
		() => [auth.token(), slug(), workspace.folders()[slug()], revision()] as const,
		([token, project]) => {
			setListings(new Map());
			setErrors(new Map());
			setRepo(null);
			setLasts({});
			// The root for the tree; with its git story when it is the folder on screen.
			void load("", token, project, untrack(dir) === "");
		},
	);
	// The folder on screen is read with its git story (the root's came with the read above).
	createEffect(
		() => [auth.token(), slug(), dir(), workspace.folders()[slug()], revision()] as const,
		([token, project, folder]) => {
			if (folder) void load(folder, token, project, true);
		},
	);
	// Going back up to the root after a folder: its git story again.
	let lastDir = untrack(dir);
	createEffect(dir, (folder) => {
		if (folder === "" && lastDir !== "") void load("", untrack(auth.token), untrack(slug), true);
		lastDir = folder;
	});

	// Open files are tabs along the top, kept per project.
	const [tabs, setTabs] = createSignal<string[]>([]);
	// One place decides the tabs: the project's remembered ones, plus the file opened. (Two
	// effects would each see the other's write only after a flush, and lose the remembered tabs.)
	let tabsOf: string | null = null;
	createEffect(
		() => [slug(), file()] as const,
		([current, path]) => {
			if (!current) return;
			const base = tabsOf === current ? untrack(tabs) : rememberedTabs(current);
			tabsOf = current;
			const next = path && !base.includes(path) ? [...base, path] : base;
			setTabs(next);
			if (next !== base) rememberTabs(current, next);
		},
	);
	function closeTab(path: string): void {
		const drop = () => {
			const open = tabs();
			const next = open.filter((item) => item !== path);
			setTabs(next);
			rememberTabs(slug(), next);
			return { open, next };
		};
		if (file() !== path) {
			drop();
			return;
		}
		// The open file: closing it is leaving it, so unsaved changes are asked about first.
		leave(() => {
			const { open, next } = drop();
			const index = open.indexOf(path);
			const neighbour = next[index] ?? next[index - 1];
			setSearch({ file: neighbour, dir: neighbour ? undefined : parent(path) || undefined });
		});
	}

	/** Run `go` now, or once unsaved changes in the open file are confirmed away. */
	function leave(go: () => void): void {
		if (unsaved()) setLeaving({ go });
		else go();
	}

	function open(path: string | null): void {
		if ((path ?? "") === file()) return;
		leave(() => setSearch({ file: path ?? undefined, dir: undefined, show: undefined }));
	}

	// Any other way out (a link, the sidebar, the browser's back) asks too.
	useBeforeLeave((event) => {
		if (!unsaved() || event.defaultPrevented) return;
		event.preventDefault();
		setLeaving({ go: () => event.retry(true) });
	});

	/** Read one folder again, keeping the rest of the tree as it is. */
	function refresh(path: string): void {
		setListings((current) => {
			const next = new Map(current);
			next.delete(path);
			return next;
		});
		void load(path, auth.token(), slug(), path === dir());
	}

	const rootError = () => errors().get("") ?? null;
	const href = (params: { file?: string; dir?: string }) => {
		const query = new URLSearchParams();
		if (params.file) query.set("file", params.file);
		else if (params.dir) query.set("dir", params.dir);
		const text = query.toString();
		return workspaceHref(`/files/${slug()}${text ? `?${text}` : ""}`);
	};
	const machine = () =>
		environmentsStore.labelOf(placementsStore.environmentOf(slug())) ?? "This machine";

	return (
		<Show when={project()} fallback={<EmptyState title="Project not found" />}>
			<ShellSlot name="panel">
				<div class="flex items-center justify-between gap-2 pr-1 pb-1 pl-2.5">
					<a
						href={href({})}
						class="focus-ring flex min-w-0 items-center gap-2 px-0 py-1 font-medium text-body text-fg"
					>
						<EntryIcon name={project()?.name ?? ""} folder open />
						<span class="truncate">{project()?.name}</span>
					</a>
					<Show when={!rootError()}>
						<span class="flex shrink-0 items-center">
							<IconButton
								size="xs"
								label="New folder"
								onClick={() => setCreating({ kind: "folder", in: dir() })}
							>
								<FolderIcon />
							</IconButton>
							<IconButton
								size="xs"
								label="New file"
								onClick={() => setCreating({ kind: "file", in: dir() })}
							>
								<PlusIcon />
							</IconButton>
						</span>
					</Show>
				</div>
				<Show
					when={!rootError()}
					fallback={
						<NavNote>
							{rootError()?.startsWith(NEEDS_FOLDER) ? "No folder yet." : rootError()}
						</NavNote>
					}
				>
					<FolderTree
						entries={(path) => listings().get(path)}
						error={(path) => (path === "" ? null : (errors().get(path) ?? null))}
						onExpand={(path) => {
							// The folder on screen is already being read, with its git story.
							if (!listings().has(path) && path !== dir()) void load(path, auth.token(), slug());
						}}
						selected={file() || dir()}
						reveal={dir()}
						onSelect={(entry) => {
							if (entry.kind === "file") open(entry.path);
							else leave(() => setSearch({ dir: entry.path || undefined, file: undefined }));
						}}
						mark={(entry) => {
							if (dirtyPath() === entry.path)
								return <StatusDot status="busy" size="sm" label="Unsaved changes" />;
							const status = entry.kind === "file" ? changeOf(changes(), entry.path, false) : null;
							return status ? <GitMark status={status} /> : <></>;
						}}
						actions={(entry) => (
							<EntryMenu
								entry={entry}
								onCreate={setCreating}
								onRefresh={refresh}
								register={(path, control) => entryMenus.set(path, control)}
							/>
						)}
						onMenuAt={(entry, point) => entryMenus.get(entry.path)?.open(point)}
					/>
				</Show>
			</ShellSlot>
			<Show when={tabs().length > 0 && file()}>
				<ShellSlot name="tabs">
					<HeaderTabs
						current={file()}
						onClose={closeTab}
						tabs={tabs().map((path) => {
							const status = changeOf(changes(), path, false);
							return {
								id: path,
								label: baseName(path),
								href: href({ file: path }),
								icon: <EntryIcon name={baseName(path)} folder={false} />,
								badge: status === "modified" ? "M" : status === "added" ? "A" : undefined,
							};
						})}
					/>
				</ShellSlot>
			</Show>
			<Show when={!file()}>
				<ShellSlot name="crumb">
					<Crumbs
						path={dir()}
						root={project()?.name ?? slug()}
						href={(path) => href({ dir: path })}
					/>
				</ShellSlot>
			</Show>
			<ShellSlot name="subtitle">
				{[project()?.name, repo()?.branch].filter(Boolean).join(" · ")}
			</ShellSlot>

			<Show
				when={!rootError()}
				fallback={
					<EmptyState
						icon={<FolderIcon size="lg" />}
						title={
							rootError()?.startsWith(NEEDS_FOLDER) ? "No folder yet" : "Could not read the files"
						}
						description={
							rootError()?.startsWith(NEEDS_FOLDER)
								? "Link this project to a folder on this machine to browse its files."
								: (rootError() ?? undefined)
						}
						action={
							rootError()?.startsWith(NEEDS_FOLDER) ? (
								<Button
									size="sm"
									variant="primary"
									onClick={() => workspace.chooseFolderFor(slug())}
								>
									Choose folder
								</Button>
							) : (
								<Button onClick={() => setRevision((n) => n + 1)}>Try again</Button>
							)
						}
					/>
				}
			>
				<Show
					when={file()}
					fallback={
						<FolderView
							slug={slug()}
							path={dir()}
							name={dir() ? baseName(dir()) : (project()?.name ?? slug())}
							entries={listings().get(dir())}
							error={errors().get(dir()) ?? null}
							changes={changesIn(changes(), dir())}
							lasts={lasts()}
							branch={repo()?.branch ?? null}
							changedOnly={search.show === "changed"}
							onChangedOnly={(on) =>
								setSearch({ show: on ? "changed" : undefined }, { replace: true })
							}
							href={href}
						/>
					}
				>
					{(path) => (
						<FilePane
							path={path()}
							slug={slug()}
							root={project()?.name ?? slug()}
							machine={machine()}
							crumbHref={(folder) => href({ dir: folder })}
							openInEditor={editOnOpen() === path()}
							onOpened={() => setEditOnOpen(null)}
							onDirty={(dirty) => {
								if (dirty) discarded = false;
								setDirtyPath(dirty ? path() : null);
							}}
							onBack={() =>
								leave(() => setSearch({ file: undefined, dir: parent(path()) || undefined }))
							}
							onAsk={(text) => {
								draftsStore.set(slug(), text);
								navigate(`/chat/${slug()}`);
							}}
						/>
					)}
				</Show>
			</Show>
			<Show when={leaving()}>
				<ConfirmDialog
					open
					onClose={() => setLeaving(null)}
					onConfirm={() => {
						const next = leaving();
						setLeaving(null);
						discarded = true;
						setDirtyPath(null);
						next?.go();
					}}
					title="Leave without saving?"
					description={`${dirtyPath()?.split("/").pop() ?? "This file"} has changes that are not saved. Leaving now throws them away.`}
					confirm="Discard changes"
					danger
				/>
			</Show>
			<CreateDialog
				request={creating()}
				slug={slug()}
				onClose={() => setCreating(null)}
				onCreated={(item) => {
					refresh(parent(item.path));
					if (item.kind === "file") {
						// A file made to be written in, so it opens in the editor.
						setEditOnOpen(item.path);
						open(item.path);
					}
				}}
			/>
		</Show>
	);
}

/** Where a folder or file is: the project, then each folder, each a link back up. */
function Crumbs(props: {
	path: string;
	root: string;
	href: (path: string) => string;
}): JSX.Element {
	const parts = () => (props.path ? props.path.split("/") : []);
	return (
		<span class="flex min-w-0 items-center gap-1 text-body">
			<a href={props.href("")} class="focus-ring shrink-0 text-fg-subtle hover:text-fg">
				{props.root}
			</a>
			<For each={parts()}>
				{(part, index) => (
					<>
						<ChevronRightIcon size="xs" class="shrink-0 text-fg-faint" />
						<Show
							when={index() < parts().length - 1}
							fallback={<span class="min-w-0 truncate text-fg">{part}</span>}
						>
							<a
								href={props.href(
									parts()
										.slice(0, index() + 1)
										.join("/"),
								)}
								class="focus-ring min-w-0 truncate text-fg-subtle hover:text-fg"
							>
								{part}
							</a>
						</Show>
					</>
				)}
			</For>
		</span>
	);
}

/**
 * A folder (Figma 13 · Files): its name and the last commit to touch it, a filter, then its
 * entries with their last commit and when — a table on desktop; on phones a list, with what is
 * changed in it first. A README in the folder is shown under it.
 */
function FolderView(props: {
	slug: string;
	path: string;
	name: string;
	entries: readonly FolderEntry[] | undefined;
	error: string | null;
	changes: FileChange[];
	lasts: Record<string, LastChange>;
	branch: string | null;
	changedOnly: boolean;
	onChangedOnly: (on: boolean) => void;
	href: (params: { file?: string; dir?: string }) => string;
}): JSX.Element {
	const auth = useAuth();
	const [filter, setFilter] = createSignal("");
	const shown = createMemo(() => {
		const query = filter().trim().toLowerCase();
		const entries = props.entries ?? [];
		const listed = props.changedOnly
			? props.changes.map((change) => ({
					name: change.path.slice(props.path ? props.path.length + 1 : 0),
					path: change.path,
					kind: "file" as const,
				}))
			: entries;
		return query ? listed.filter((entry) => entry.name.toLowerCase().includes(query)) : listed;
	});
	const deleted = (path: string) =>
		props.changes.some((change) => change.path === path && change.status === "deleted");
	// A deleted file has nothing to open: its row stays where it is.
	const linkTo = (entry: FolderEntry) =>
		deleted(entry.path)
			? undefined
			: entry.kind === "file"
				? props.href({ file: entry.path })
				: props.href({ dir: entry.path });
	const statusOf = (entry: FolderEntry) =>
		changeOf(props.changes, entry.path, entry.kind === "folder");

	// The folder's README, read when there is one.
	const readme = () =>
		(props.entries ?? []).find(
			(entry) => entry.kind === "file" && /^readme\.md$/i.test(entry.name),
		) ?? null;
	const [readmeText, setReadmeText] = createSignal<string | null>(null);
	let readmeRequest = 0;
	createEffect(
		() => [auth.token(), props.slug, readme()?.path] as const,
		([token, slug, path]) => {
			const current = ++readmeRequest;
			setReadmeText(null);
			if (!token || !path) return;
			// Only the latest folder's README: a slow one from the folder before is dropped.
			void filesService.read(token, slug, path).then(
				(value) => {
					if (current === readmeRequest) setReadmeText(value.text);
				},
				() => {
					if (current === readmeRequest) setReadmeText(null);
				},
			);
		},
	);

	const last = () => props.lasts[props.path];
	return (
		<div class="min-h-0 flex-1 overflow-y-auto overscroll-contain">
			<div class="mx-auto flex w-full max-w-4xl flex-col gap-4 px-4 pt-4 pb-8 md:px-8 md:pt-10">
				<header class="hidden items-center gap-3 md:flex">
					<ProjectTile>
						<EntryIcon name={props.name} folder open />
					</ProjectTile>
					<div class="flex min-w-0 flex-col">
						<Text as="h1" size="headline" tone="strong" weight="medium" truncate>
							{props.name}
						</Text>
						<Text size="caption" tone="subtle" truncate>
							{[
								last() ? `${last()?.author} · ${lastLine(last())}` : null,
								props.changes.length
									? `${props.changes.length} changed since the last commit`
									: null,
							]
								.filter(Boolean)
								.join(" · ") || "Not in a git repository"}
						</Text>
					</div>
				</header>

				<div class="flex items-center gap-2">
					<SearchInput
						icon={<SearchIcon />}
						type="search"
						value={filter()}
						aria-label={`Filter files in ${props.name}`}
						placeholder={`Filter files in ${props.name}`}
						onInput={(event) => setFilter(event.currentTarget.value)}
						class="min-w-0 flex-1"
					/>
					<Show when={props.changes.length > 0}>
						<Segmented
							label="Show"
							value={props.changedOnly ? "changed" : "all"}
							onChange={(value) => props.onChangedOnly(value === "changed")}
							options={[
								{ value: "all", label: "All" },
								{ value: "changed", label: "Changed", count: props.changes.length },
							]}
						/>
					</Show>
				</div>

				<Show when={props.error}>{(text) => <Alert tone="danger" title={text()} />}</Show>
				<Show
					when={props.entries}
					fallback={
						<Stack gap={2}>
							<Skeleton class="h-11" />
							<Skeleton class="h-11" />
							<Skeleton class="h-11" />
						</Stack>
					}
				>
					{/* Phones: what is changed here first, then everything in the folder. */}
					<div class="flex flex-col md:hidden">
						<Show when={!props.changedOnly && props.changes.length > 0}>
							<p class="px-1 pt-1 pb-1 text-caption text-fg-subtle">
								Changed since the last commit
							</p>
							<For each={props.changes.slice(0, 5)}>
								{(change) => (
									<FileRow
										href={
											change.status === "deleted" ? undefined : props.href({ file: change.path })
										}
										name={baseName(change.path)}
										folder={false}
										stat={
											change.added !== null ? (
												<DiffStat added={change.added} removed={change.removed ?? 0} />
											) : undefined
										}
										detail={
											parent(change.path).slice(props.path ? props.path.length + 1 : 0) || undefined
										}
										mark={<GitMark status={change.status} />}
									/>
								)}
							</For>
							<div class="my-2 h-px bg-line" />
						</Show>
						<p class="px-1 pt-1 pb-1 text-caption text-fg-subtle">
							{props.name} · {shown().length} item{shown().length === 1 ? "" : "s"}
						</p>
						<For each={shown()}>
							{(entry) => (
								<FileRow
									href={linkTo(entry)}
									name={entry.name}
									folder={entry.kind === "folder"}
									detail={lastLine(props.lasts[entry.path])}
									mark={
										statusOf(entry) && entry.kind === "file" ? (
											<GitMark status={statusOf(entry) ?? "modified"} />
										) : undefined
									}
								/>
							)}
						</For>
					</div>
					{/* Desktop: a table of the entries and their last commit. */}
					<div class="hidden md:block">
						<Table framed>
							<thead>
								<tr>
									<Th>Name</Th>
									<Th>Last change</Th>
									<Th align="right">Updated</Th>
								</tr>
							</thead>
							<tbody>
								<For each={shown()}>
									{(entry) => (
										<Tr>
											<Td>
												<a
													href={linkTo(entry)}
													class="focus-ring flex min-w-0 items-center gap-2.5 font-medium text-fg"
												>
													<EntryIcon name={entry.name} folder={entry.kind === "folder"} />
													<span class="truncate">{entry.name}</span>
													<Show when={entry.kind === "file" ? statusOf(entry) : null}>
														{(status) => <GitBadge status={status()} />}
													</Show>
												</a>
											</Td>
											<Td>
												<Show
													when={props.lasts[entry.path]}
													fallback={<span class="text-fg-faint">—</span>}
												>
													{(change) => (
														<span class="flex min-w-0 items-center gap-2">
															<Avatar name={change().author} size="xs" />
															<span class="max-w-96 truncate" title={change().author}>
																{change().subject}
															</span>
														</span>
													)}
												</Show>
											</Td>
											<Td align="right">
												<span class="text-caption text-fg-subtle">
													{props.lasts[entry.path] ? relativeTime(props.lasts[entry.path].at) : ""}
												</span>
											</Td>
										</Tr>
									)}
								</For>
							</tbody>
						</Table>
					</div>
					<Show when={shown().length === 0}>
						<Text tone="subtle" class="py-6 text-center">
							{filter() ? `Nothing here matches “${filter()}”.` : "This folder is empty."}
						</Text>
					</Show>
				</Show>

				<Show when={readme() && readmeText()}>
					{(text) => (
						<section aria-label={readme()?.name} class="flex flex-col gap-2">
							<a
								href={props.href({ file: readme()?.path })}
								class="focus-ring flex items-center gap-2 self-start font-medium text-body text-fg"
							>
								<EntryIcon name={readme()?.name ?? "README.md"} folder={false} />
								{readme()?.name}
							</a>
							<Prose html={renderMarkdown(text())} framed />
						</section>
					)}
				</Show>
			</div>
		</div>
	);
}

/** Language names for the status strip, by the highlighter's language. */
const LANGUAGE_NAME: Record<string, string> = {
	typescript: "TypeScript",
	javascript: "JavaScript",
	json: "JSON",
	css: "CSS",
	xml: "HTML",
	markdown: "Markdown",
	python: "Python",
	rust: "Rust",
	go: "Go",
	sql: "SQL",
	bash: "Shell",
	yaml: "YAML",
};

type FileView = "code" | "changes";

/**
 * The open file (Figma 13 · Editor): where it is and who last changed it over its lines, with what
 * changed since the last commit marked in the margin; the changes on their own as a diff; the
 * editor once someone asks to change it. Selecting lines offers to ask an agent about them.
 * Along the foot, the branch and the machine.
 */
function FilePane(props: {
	path: string;
	slug: string;
	root: string;
	machine: string;
	crumbHref: (folder: string) => string;
	/** Open straight into the editor: a file just created to be written in. */
	openInEditor?: boolean;
	onOpened?: () => void;
	/** This file has unsaved changes (or no longer does). */
	onDirty?: (dirty: boolean) => void;
	onBack: () => void;
	/** Start a thread with this text in its composer. */
	onAsk: (text: string) => void;
}): JSX.Element {
	const auth = useAuth();
	const [content, setContent] = createSignal<ProjectFileContent | null>(null);
	const [error, setError] = createSignal<string | null>(null);
	const [editing, setEditing] = createSignal(false);
	const [view, setView] = createSignal<FileView>("code");
	/** The lines picked in the code, for the bar's Ask. */
	const [selected, setSelected] = createSignal<LineRange | null>(null);
	let request = 0;

	createEffect(
		() => [auth.token(), props.slug, props.path] as const,
		([token, slug, path]) => {
			// Read untracked: the flag is consumed here and cleared by `onOpened`, which must not
			// send this effect round again and close the editor it just opened.
			const openInEditor = untrack(() => props.openInEditor);
			const current = ++request;
			setContent(null);
			setError(null);
			setEditing(false);
			setView("code");
			if (!token) return;
			void filesService.read(token, slug, path).then(
				(value) => {
					if (current !== request) return;
					setContent(value);
					if (openInEditor && value.text !== null) {
						setEditing(true);
						props.onOpened?.();
					}
				},
				(cause) => {
					if (current === request) setError(message(cause, "Could not read this file"));
				},
			);
		},
	);

	const name = () => baseName(props.path);
	const git = () => content()?.git ?? null;
	const change = () => git()?.change ?? null;
	const language = () => languageFor(props.path);
	const editable = () => {
		const file = content();
		return file !== null && file.text !== null && file.hash !== null;
	};
	/** What the file was at the last commit: its text, or nothing for a new file. */
	const before = () => (change()?.status === "added" ? "" : (git()?.base ?? null));
	const lines = createMemo(() => highlightLines(content()?.text ?? "", language()));
	const marks = createMemo(() => {
		const text = content()?.text;
		const base = before();
		return text !== null && text !== undefined && base !== null && change()
			? lineMarks(base, text)
			: new Map();
	});
	const diff = createMemo(() => {
		const text = content()?.text;
		const base = before();
		return text !== null && text !== undefined && base !== null ? diffLines(base, text) : [];
	});

	function ask(range: LineRange | null, ending = ""): void {
		const text = content()?.text ?? "";
		if (!range) {
			props.onAsk(`About ${props.path}:\n\n${ending}`);
			return;
		}
		const snippet = text
			.split("\n")
			.slice(range.from - 1, range.to)
			.join("\n");
		const where =
			range.from === range.to ? `line ${range.from}` : `lines ${range.from}–${range.to}`;
		props.onAsk(
			`About ${props.path}, ${where}:\n\n\`\`\`${language() ?? ""}\n${snippet}\n\`\`\`\n\n${ending}`,
		);
	}

	const folder = () => parent(props.path);
	return (
		<div class="flex min-h-0 flex-1 flex-col">
			{/* Where the file is, who last changed it, and how to look at it. */}
			<div class="flex h-11 shrink-0 items-center gap-2 border-line border-b px-3 md:px-4">
				<IconButton size="sm" label="Back to the folder" onClick={props.onBack} class="md:hidden">
					<ChevronRightIcon class="rotate-180" />
				</IconButton>
				<span class="hidden min-w-0 items-center gap-1 md:flex">
					<Crumbs path={folder()} root={props.root} href={props.crumbHref} />
					<ChevronRightIcon size="xs" class="shrink-0 text-fg-faint" />
				</span>
				<span class="flex min-w-0 items-center gap-1.5 text-body text-fg">
					<EntryIcon name={name()} folder={false} />
					<span class="truncate">{name()}</span>
					<Show when={change()}>{(changed) => <GitMark status={changed().status} />}</Show>
				</span>
				<span class="flex-1" />
				<Text size="caption" tone="subtle" truncate class="hidden lg:block">
					{change()
						? "Changed since the last commit"
						: git()?.last
							? `Last commit by ${git()?.last?.author} · ${relativeTime(git()?.last?.at ?? "")}`
							: ""}
				</Text>
				<Show when={!editing() && change() && before() !== null}>
					<Segmented<FileView>
						label="View"
						value={view()}
						onChange={setView}
						options={[
							{ value: "code", label: "Code" },
							{
								value: "changes",
								label: "Changes",
								count: (change()?.added ?? 0) + (change()?.removed ?? 0) || undefined,
							},
						]}
					/>
				</Show>
				<Show when={!editing() && editable()}>
					{/* Phones edit from the bar along the foot. */}
					<span class="hidden md:contents">
						<Button size="sm" icon={<EditIcon size="sm" />} onClick={() => setEditing(true)}>
							Edit
						</Button>
					</span>
				</Show>
				<Show when={!editing() && content()?.text}>
					<span class="hidden md:contents">
						<Button size="sm" icon={<SparklesIcon size="sm" />} onClick={() => ask(selected())}>
							{selected() ? "Ask about the selection" : "Ask an agent"}
						</Button>
					</span>
				</Show>
				<IconButton size="sm" label="Copy path" onClick={() => void copy(props.path, "the path")}>
					<CopyIcon />
				</IconButton>
			</div>

			<Show
				when={editing() && content()}
				fallback={
					<div class="min-h-0 flex-1 overflow-auto overscroll-contain">
						<Show
							when={content()}
							fallback={
								<Show
									when={error()}
									fallback={
										<Stack gap={2} class="p-4">
											<Skeleton class="h-4 w-2/3" />
											<Skeleton class="h-4 w-1/2" />
											<Skeleton class="h-4 w-3/4" />
										</Stack>
									}
								>
									{(text) => (
										<div class="p-4">
											<Alert tone="danger" title={text()} />
										</div>
									)}
								</Show>
							}
						>
							{(file) => (
								<Show
									when={file().text !== null}
									fallback={
										<EmptyState
											icon={<FileIcon size="lg" />}
											title={file().binary ? "Not a text file" : "Too large to show"}
											description={
												file().binary
													? "This file is binary, so there is nothing to read here."
													: `This file is ${Math.round(file().size / 1024)} KB; files over 512 KB are not shown.`
											}
										/>
									}
								>
									<Show
										when={(file().text ?? "").length > 0}
										fallback={
											<EmptyState
												title="Empty file"
												description="There is nothing in it yet."
												action={
													<Button size="sm" variant="primary" onClick={() => setEditing(true)}>
														Write in it
													</Button>
												}
											/>
										}
									>
										<Show
											when={view() === "changes"}
											fallback={
												<CodeLines
													label={props.path}
													lines={lines()}
													marks={marks()}
													onSelect={setSelected}
													actions={(range) => (
														<CodeAskBar>
															<CodeAskAction
																primary
																icon={<SparklesIcon />}
																onClick={() => ask(range)}
															>
																Ask about{" "}
																{range.from === range.to
																	? `line ${range.from}`
																	: `lines ${range.from}–${range.to}`}
															</CodeAskAction>
															<CodeAskAction
																onClick={() => ask(range, "Explain what these lines do.")}
															>
																Explain
															</CodeAskAction>
															<CodeAskAction
																onClick={() => ask(range, "Write a test that covers these lines.")}
															>
																Add test
															</CodeAskAction>
														</CodeAskBar>
													)}
												/>
											}
										>
											<div class="p-4 md:p-6">
												<DiffCard
													path={props.path}
													lines={diff()}
													added={change()?.added ?? undefined}
													removed={change()?.removed ?? undefined}
												/>
											</div>
										</Show>
									</Show>
								</Show>
							)}
						</Show>
					</div>
				}
			>
				{(file) => (
					<FileEditor
						slug={props.slug}
						file={file()}
						onDirty={(dirty) => props.onDirty?.(dirty)}
						onSaved={(saved) => {
							setContent({ ...saved, git: content()?.git ?? null });
							// What changed (and how much) moves with the save: read the file's git story again.
							const token = auth.token();
							if (!token) return;
							const current = request;
							void filesService.read(token, props.slug, props.path).then(
								(fresh) => {
									if (current === request && fresh.hash === saved.hash)
										setContent((now) => (now ? { ...now, git: fresh.git ?? null } : now));
								},
								() => {},
							);
						}}
						onClose={() => {
							props.onDirty?.(false);
							setEditing(false);
						}}
					/>
				)}
			</Show>

			<Show when={!editing()}>
				<StatusStrip
					start={
						<>
							<Show when={git()?.branch}>
								{(branch) => (
									<span class="flex items-center gap-1.5">
										<BranchIcon />
										{branch()}
									</span>
								)}
							</Show>
							<Show when={git()?.changed}>{(count) => <span>{count()} changed</span>}</Show>
						</>
					}
					end={
						<>
							<Show when={language()}>{(id) => <span>{LANGUAGE_NAME[id()] ?? id()}</span>}</Show>
							<span class="flex items-center gap-1.5">
								<LaptopIcon />
								{props.machine}
							</span>
						</>
					}
				/>
				{/* Phones: edit, and ask an agent about the file, in thumb reach. */}
				<div class="flex shrink-0 items-center gap-2 border-line border-t px-3 py-2 pb-safe md:hidden">
					<Show when={editable()}>
						<IconButton
							label="Edit"
							variant="secondary"
							shape="round"
							onClick={() => setEditing(true)}
						>
							<EditIcon />
						</IconButton>
					</Show>
					<span class="flex-1" />
					<Button variant="primary" size="xl" icon={<SparklesIcon />} onClick={() => ask(null)}>
						Ask an agent
					</Button>
				</div>
			</Show>
		</div>
	);
}

/** A tree row's ⋯: new items inside a folder, and copying its path or name. */
function EntryMenu(props: {
	entry: FolderEntry;
	onCreate: (request: { kind: ProjectFile["kind"]; in: string }) => void;
	onRefresh: (path: string) => void;
	/** Hands over this row's menu, so a long press on the row can open it. */
	register: (path: string, control: PopoverControl) => void;
}): JSX.Element {
	let menu: PopoverControl | undefined;
	const groups = (): MenuGroup[] => [
		...(props.entry.kind === "folder"
			? [
					{
						items: [
							{ id: "new-file", label: "New file here", icon: <PlusIcon size="sm" /> },
							{ id: "new-folder", label: "New folder here", icon: <FolderIcon size="sm" /> },
							{ id: "refresh", label: "Refresh" },
						],
					},
				]
			: []),
		{
			items: [
				{ id: "path", label: "Copy relative path" },
				{ id: "name", label: "Copy name" },
			],
		},
	];
	return (
		<Menu
			label={`Actions for ${props.entry.name}`}
			trigger={<MoreIcon size="sm" />}
			triggerClass={iconButton({ size: "xs" })}
			groups={groups()}
			placement="bottom-end"
			pointerOnly
			control={(control) => {
				menu = control;
				props.register(props.entry.path, control);
			}}
			onSelect={(id) => {
				if (id === "new-file") props.onCreate({ kind: "file", in: props.entry.path });
				else if (id === "new-folder") props.onCreate({ kind: "folder", in: props.entry.path });
				else if (id === "refresh") props.onRefresh(props.entry.path);
				else if (id === "path") void copy(props.entry.path, "the path");
				else void copy(props.entry.name, "the name");
				menu?.close();
			}}
		/>
	);
}

/** Name a new file or folder; names with slashes or control characters are refused here first. */
function CreateDialog(props: {
	request: { kind: ProjectFile["kind"]; in: string } | null;
	slug: string;
	onClose: () => void;
	onCreated: (item: ProjectFile) => void;
}): JSX.Element {
	const auth = useAuth();
	const [name, setName] = createSignal("");
	const [error, setError] = createSignal<string | null>(null);
	const [saving, setSaving] = createSignal(false);
	const kind = () => props.request?.kind ?? "file";

	createEffect(
		() => props.request,
		(request) => {
			if (!request) return;
			setName("");
			setError(null);
		},
	);

	async function create(): Promise<void> {
		const token = auth.token();
		const request = props.request;
		const value = name().trim();
		if (!token || !request || saving()) return;
		if (
			!value ||
			value === "." ||
			value === ".." ||
			/[\\/]/.test(value) ||
			[...value].some((letter) => letter.charCodeAt(0) < 32)
		) {
			setError("Use a name without slashes or control characters");
			return;
		}
		setSaving(true);
		setError(null);
		try {
			const item = await filesService.create(token, props.slug, request.in, value, request.kind);
			props.onClose();
			props.onCreated(item);
		} catch (cause) {
			setError(message(cause, "Could not create this item"));
		} finally {
			setSaving(false);
		}
	}

	return (
		<Dialog
			open={props.request !== null}
			onClose={props.onClose}
			title={kind() === "file" ? "New file" : "New folder"}
			description={props.request?.in ? `In ${props.request.in}` : "At the top of the project"}
			width="26rem"
			footer={
				<>
					<Button variant="ghost" onClick={props.onClose}>
						Cancel
					</Button>
					<Button type="submit" form="create-file-form" variant="primary" disabled={saving()}>
						{saving() ? "Creating…" : "Create"}
					</Button>
				</>
			}
		>
			<form
				id="create-file-form"
				onSubmit={(event) => {
					event.preventDefault();
					void create();
				}}
			>
				<Field label="Name" error={error()}>
					{(id) => (
						<Input
							id={id}
							ref={(el: HTMLInputElement) => queueMicrotask(() => el.focus())}
							value={name()}
							onInput={(event) => setName(event.currentTarget.value)}
							autocomplete="off"
							autocapitalize="off"
							spellcheck={false}
							placeholder={kind() === "file" ? "notes.md" : "New folder"}
						/>
					)}
				</Field>
			</form>
		</Dialog>
	);
}
