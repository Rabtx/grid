import { useMatch, useSearchParams } from "@solidjs/router";
import type { JSX } from "@solidjs/web";
import { createEffect, createSignal, Loading, Show, untrack } from "solid-js";

import {
	Alert,
	Button,
	CodeView,
	CopyIcon,
	Dialog,
	EditIcon,
	EmptyState,
	Field,
	FileIcon,
	type FolderEntry,
	FolderIcon,
	FolderTree,
	IconButton,
	iconButton,
	Input,
	ListDetail,
	Menu,
	type MenuGroup,
	MoreIcon,
	notify,
	PaneHeader,
	PlusIcon,
	type PopoverControl,
	Skeleton,
	Stack,
	StatusDot,
} from "@/kit";
import { useAuth } from "@/modules/auth";

import { useWorkspace } from "../context/workspace-context";
import { filesService, type ProjectFile, type ProjectFileContent } from "../services/files.service";

import { FileEditor } from "./file-editor";

const NEEDS_FOLDER = "Choose this project's folder";

function parent(path: string): string {
	return path.split("/").slice(0, -1).join("/");
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

/**
 * A project's real files: its folders as a tree, loaded as they open, and the chosen file beside
 * it to read. The open file is in the URL (`?file=`), so a link or a reload lands on it; on phones
 * the file covers the tree, with a way back.
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
	const auth = useAuth();
	const workspace = useWorkspace();
	const match = useMatch(() => "/files/:slug");
	const [search, setSearch] = useSearchParams<{ file?: string }>();
	const slug = () => match()?.params.slug ?? "";
	const project = () => workspace.projects().find((item) => item.slug === slug());
	const file = () => search.file ?? "";
	const [listings, setListings] = createSignal<ReadonlyMap<string, readonly FolderEntry[]>>(
		new Map(),
	);
	const [errors, setErrors] = createSignal<ReadonlyMap<string, string>>(new Map());
	const [creating, setCreating] = createSignal<{ kind: ProjectFile["kind"]; in: string } | null>(
		null,
	);
	// Bumped to read the tree again from the root: after linking a folder, or "Try again".
	const [revision, setRevision] = createSignal(0);
	/** The file being edited with unsaved changes, so its row carries a dirty dot. */
	const [dirtyPath, setDirtyPath] = createSignal<string | null>(null);
	/** The file whose editor should open as soon as it is read: a file just created. */
	const [editOnOpen, setEditOnOpen] = createSignal<string | null>(null);

	/**
	 * The token and project are passed in rather than read here: this runs from the effect below,
	 * which already tracks both, and reading them again inside it would be a read that cannot
	 * update. A listing for another project than the one on screen is dropped.
	 */
	async function load(path: string, token: string | null, project: string | null): Promise<void> {
		if (!token || !project) return;
		try {
			const listing = await filesService.list(token, project, path);
			if (project !== slug()) return;
			setListings((current) => new Map(current).set(path, listing.entries));
			setErrors((current) => {
				const next = new Map(current);
				next.delete(path);
				return next;
			});
		} catch (cause) {
			if (project !== slug()) return;
			setErrors((current) =>
				new Map(current).set(path, message(cause, "Could not read this folder")),
			);
		}
	}

	// A new project, a newly linked folder or a retry starts the tree over from its root.
	createEffect(
		() => [auth.token(), slug(), workspace.folders()[slug()], revision()] as const,
		([token, project]) => {
			setListings(new Map());
			setErrors(new Map());
			void load("", token, project);
		},
	);

	function open(path: string | null): void {
		setSearch({ file: path ?? undefined });
	}

	/** Read one folder again, keeping the rest of the tree as it is. */
	function refresh(path: string): void {
		setListings((current) => {
			const next = new Map(current);
			next.delete(path);
			return next;
		});
		void load(path, auth.token(), slug());
	}

	const rootError = () => errors().get("") ?? null;
	// New items go in the open file's folder, or the root.
	const here = () => (file() ? parent(file()) : "");

	return (
		<Show when={project()} fallback={<EmptyState title="Project not found" />}>
			<ListDetail
				open={file() !== ""}
				list={
					<>
						<PaneHeader
							title="Files"
							detail={project()?.name}
							actions={
								<Show when={!rootError()}>
									<IconButton
										size="sm"
										label="New folder"
										onClick={() => setCreating({ kind: "folder", in: here() })}
									>
										<FolderIcon />
									</IconButton>
									<IconButton
										size="sm"
										label="New file"
										onClick={() => setCreating({ kind: "file", in: here() })}
									>
										<PlusIcon />
									</IconButton>
								</Show>
							}
						/>
						<div class="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2 pb-safe">
							<Show
								when={rootError()}
								fallback={
									<FolderTree
										entries={(path) => listings().get(path)}
										error={(path) => (path === "" ? null : (errors().get(path) ?? null))}
										onExpand={(path) => {
											if (!listings().has(path)) void load(path, auth.token(), slug());
										}}
										selected={file()}
										onSelect={(entry) => open(entry.path)}
										mark={(entry) =>
											dirtyPath() === entry.path ? (
												<StatusDot status="busy" size="sm" label="Unsaved changes" />
											) : (
												<></>
											)
										}
										actions={(entry) => (
											<EntryMenu entry={entry} onCreate={setCreating} onRefresh={refresh} />
										)}
									/>
								}
							>
								{(text) => (
									<EmptyState
										icon={<FolderIcon size="lg" />}
										title={
											text().startsWith(NEEDS_FOLDER) ? "No folder yet" : "Could not read the files"
										}
										description={
											text().startsWith(NEEDS_FOLDER)
												? "Link this project to a folder on this machine to browse its files."
												: text()
										}
										action={
											text().startsWith(NEEDS_FOLDER) ? (
												<Button variant="primary" onClick={() => workspace.chooseFolderFor(slug())}>
													Choose folder
												</Button>
											) : (
												<Button onClick={() => setRevision((n) => n + 1)}>Try again</Button>
											)
										}
									/>
								)}
							</Show>
						</div>
					</>
				}
			>
				<Show
					when={file()}
					fallback={
						<EmptyState
							icon={<FileIcon size="lg" />}
							title="Pick a file"
							description="Choose a file in the tree to read it here."
						/>
					}
				>
					{(path) => (
						<FilePane
							path={path()}
							slug={slug()}
							openInEditor={editOnOpen() === path()}
							onOpened={() => setEditOnOpen(null)}
							onDirty={(dirty) => setDirtyPath(dirty ? path() : null)}
							onBack={() => open(null)}
						/>
					)}
				</Show>
			</ListDetail>
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

/** A tree row's ⋯: new items inside a folder, and copying its path or name. */
function EntryMenu(props: {
	entry: FolderEntry;
	onCreate: (request: { kind: ProjectFile["kind"]; in: string }) => void;
	onRefresh: (path: string) => void;
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

/**
 * The open file: its name and folder over its numbered lines, or the editor once someone asks to
 * change it. Reading is the default everywhere, so a phone opens a file to read it and edits it
 * only when it says so; the editor is loaded at that point and not before.
 */
function FilePane(props: {
	path: string;
	slug: string;
	/** Open straight into the editor: a file just created to be written in. */
	openInEditor?: boolean;
	onOpened?: () => void;
	/** This file has unsaved changes (or no longer does). */
	onDirty?: (dirty: boolean) => void;
	onBack: () => void;
}): JSX.Element {
	const auth = useAuth();
	const [content, setContent] = createSignal<ProjectFileContent | null>(null);
	const [error, setError] = createSignal<string | null>(null);
	const [editing, setEditing] = createSignal(false);
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
			if (!token) return;
			void filesService.read(token, slug, path).then(
				(value) => {
					if (current !== request) return;
					setContent(value);
					// A file made to be written in opens in the editor rather than the reader.
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

	const name = () => props.path.split("/").pop() ?? props.path;
	/**
	 * Only a text file small enough to hold in the browser, and with the version a save needs, can
	 * be edited here.
	 */
	const editable = () => {
		const file = content();
		return file !== null && file.text !== null && file.hash !== null;
	};

	return (
		<>
			<PaneHeader
				title={name()}
				detail={parent(props.path) || undefined}
				onBack={props.onBack}
				backLabel="Back to files"
				actions={
					<>
						<Show when={!editing() && editable()}>
							<Button size="sm" icon={<EditIcon size="sm" />} onClick={() => setEditing(true)}>
								Edit
							</Button>
						</Show>
						<IconButton
							size="sm"
							label="Copy path"
							onClick={() => void copy(props.path, "the path")}
						>
							<CopyIcon />
						</IconButton>
					</>
				}
			/>
			<Show
				when={editing() && content()}
				fallback={
					<div class="min-h-0 flex-1 overflow-auto overscroll-contain pb-safe">
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
									when={file().text}
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
									{(text) => (
										<Show
											when={text().length > 0}
											fallback={
												<EmptyState
													title="Empty file"
													description="There is nothing in it yet."
													action={
														<Button variant="primary" onClick={() => setEditing(true)}>
															Write in it
														</Button>
													}
												/>
											}
										>
											<CodeView text={text()} />
										</Show>
									)}
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
						onClose={() => {
							props.onDirty?.(false);
							setEditing(false);
						}}
					/>
				)}
			</Show>
		</>
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
