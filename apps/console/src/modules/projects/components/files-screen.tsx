import { useMatch, useSearchParams } from "@solidjs/router";
import type { JSX } from "@solidjs/web";
import { createEffect, createSignal, Loading, Show } from "solid-js";

import {
	Alert,
	Button,
	CodeView,
	CopyIcon,
	Dialog,
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
} from "@/kit";
import { useAuth } from "@/modules/auth";

import { useWorkspace } from "../context/workspace-context";
import { filesService, type ProjectFile, type ProjectFileContent } from "../services/files.service";

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

	async function load(path: string): Promise<void> {
		const token = auth.token();
		if (!token || !slug()) return;
		const project = slug();
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
		() => {
			setListings(new Map());
			setErrors(new Map());
			void load("");
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
		void load(path);
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
											if (!listings().has(path)) void load(path);
										}}
										selected={file()}
										onSelect={(entry) => open(entry.path)}
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
					{(path) => <FilePane path={path()} slug={slug()} onBack={() => open(null)} />}
				</Show>
			</ListDetail>
			<CreateDialog
				request={creating()}
				slug={slug()}
				onClose={() => setCreating(null)}
				onCreated={(item) => {
					refresh(parent(item.path));
					if (item.kind === "file") open(item.path);
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

/** The open file: its name and folder over its numbered lines, or why it cannot be shown. */
function FilePane(props: { path: string; slug: string; onBack: () => void }): JSX.Element {
	const auth = useAuth();
	const [content, setContent] = createSignal<ProjectFileContent | null>(null);
	const [error, setError] = createSignal<string | null>(null);
	let request = 0;

	createEffect(
		() => [auth.token(), props.slug, props.path] as const,
		([token, slug, path]) => {
			const current = ++request;
			setContent(null);
			setError(null);
			if (!token) return;
			void filesService.read(token, slug, path).then(
				(value) => {
					if (current === request) setContent(value);
				},
				(cause) => {
					if (current === request) setError(message(cause, "Could not read this file"));
				},
			);
		},
	);

	const name = () => props.path.split("/").pop() ?? props.path;

	return (
		<>
			<PaneHeader
				title={name()}
				detail={parent(props.path) || undefined}
				onBack={props.onBack}
				backLabel="Back to files"
				actions={
					<IconButton size="sm" label="Copy path" onClick={() => void copy(props.path, "the path")}>
						<CopyIcon />
					</IconButton>
				}
			/>
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
										<EmptyState title="Empty file" description="There is nothing in it yet." />
									}
								>
									<CodeView text={text()} />
								</Show>
							)}
						</Show>
					)}
				</Show>
			</div>
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
