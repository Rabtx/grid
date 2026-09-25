import { useMatch } from "@solidjs/router";
import type { JSX } from "@solidjs/web";
import { createEffect, createSignal, For, Loading, Show } from "solid-js";

import { useAuth } from "@/modules/auth";
import {
	Button,
	EmptyState,
	ErrorNotice,
	Field,
	FileIcon,
	FolderIcon,
	Input,
	Menu,
	MoreIcon,
	PlusIcon,
	Sheet,
	Skeleton,
} from "@/ui";

import { useWorkspace } from "../context/workspace-context";
import { filesService, type ProjectFile, type ProjectFileListing } from "../services/files.service";

function parent(path: string): string {
	return path.split("/").slice(0, -1).join("/");
}

/** A project's real files, one folder at a time. No editor is mounted until one exists. */
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
	const slug = () => match()?.params.slug ?? "";
	const project = () => workspace.projects().find((item) => item.slug === slug());
	const [path, setPath] = createSignal("");
	const [listing, setListing] = createSignal<ProjectFileListing | null>(null);
	const [loading, setLoading] = createSignal(true);
	const [error, setError] = createSignal<string | null>(null);
	const [revision, setRevision] = createSignal(0);
	const [creating, setCreating] = createSignal<ProjectFile["kind"] | null>(null);
	const [name, setName] = createSignal("");
	const [formError, setFormError] = createSignal<string | null>(null);
	const [saving, setSaving] = createSignal(false);
	let request = 0;

	createEffect(slug, () => {
		setPath("");
	});
	createEffect(
		() => [auth.token(), slug(), path(), revision(), workspace.folders()[slug()]] as const,
		([token, projectSlug, directory]) => {
			const current = ++request;
			setLoading(true);
			setError(null);
			setListing(null);
			if (!token || !projectSlug) {
				setLoading(false);
				return;
			}
			void filesService.list(token, projectSlug, directory).then(
				(value) => {
					if (current !== request) return;
					setListing(value);
					setLoading(false);
				},
				(cause) => {
					if (current !== request) return;
					setError(cause instanceof Error ? cause.message : "Could not read this folder");
					setLoading(false);
				},
			);
		},
	);

	function startCreate(kind: ProjectFile["kind"]): void {
		setName("");
		setFormError(null);
		setCreating(kind);
	}

	async function create(event: SubmitEvent): Promise<void> {
		event.preventDefault();
		const token = auth.token();
		const kind = creating();
		const value = name().trim();
		if (!token || !kind || saving()) return;
		if (
			!value ||
			value === "." ||
			value === ".." ||
			/[\\/]/.test(value) ||
			[...value].some((letter) => letter.charCodeAt(0) < 32)
		) {
			setFormError("Use a name without slashes or control characters");
			return;
		}
		setSaving(true);
		setFormError(null);
		try {
			await filesService.create(token, slug(), path(), value, kind);
			setCreating(null);
			setRevision((n) => n + 1);
		} catch (cause) {
			setFormError(cause instanceof Error ? cause.message : "Could not create this item");
		} finally {
			setSaving(false);
		}
	}

	async function copy(value: string): Promise<void> {
		try {
			await navigator.clipboard.writeText(value);
			setError(null);
		} catch {
			setError("Could not copy to the clipboard");
		}
	}

	return (
		<Show when={project()} fallback={<EmptyState title="Project not found" />}>
			<div class="mx-auto flex w-full max-w-4xl min-w-0 flex-col gap-3">
				<header class="flex min-w-0 flex-wrap items-center justify-between gap-2 border-stroke border-b pb-3">
					<div class="min-w-0">
						<h1 class="font-semibold text-ink text-title">Files</h1>
						<p class="truncate text-ink/45 text-ui-sm">{project()?.name}</p>
					</div>
					<div class="flex shrink-0 gap-1.5">
						<Button
							size="md"
							onClick={() => startCreate("folder")}
							disabled={!!error() || loading()}
							class="pointer-coarse:min-h-11"
						>
							<FolderIcon class="size-4" /> Folder
						</Button>
						<Button
							size="md"
							variant="primary"
							onClick={() => startCreate("file")}
							disabled={!!error() || loading()}
							class="pointer-coarse:min-h-11"
						>
							<PlusIcon class="size-4" /> File
						</Button>
					</div>
				</header>
				<nav aria-label="File path" class="flex min-w-0 flex-wrap items-center gap-1 text-ui-sm">
					<button
						type="button"
						onClick={() => setPath("")}
						class="focus-ring min-h-11 rounded-md px-2 text-ink/65 hover:bg-ink/8 pointer-fine:min-h-7"
					>
						{project()?.name}
					</button>
					<For each={path().split("/").filter(Boolean)}>
						{(part, index) => (
							<>
								<span class="text-ink/30">/</span>
								<button
									type="button"
									onClick={() =>
										setPath(
											path()
												.split("/")
												.slice(0, index() + 1)
												.join("/"),
										)
									}
									class="focus-ring min-h-11 max-w-36 truncate rounded-md px-2 text-ink/65 hover:bg-ink/8 pointer-fine:min-h-7"
								>
									{part}
								</button>
							</>
						)}
					</For>
				</nav>
				<Show when={error()}>
					{(message) => (
						<ErrorNotice
							message={message()}
							action={
								message().startsWith("Choose this project's folder") ? (
									<Button size="sm" onClick={() => workspace.chooseFolderFor(slug())}>
										Choose folder
									</Button>
								) : (
									<Button size="sm" onClick={() => setRevision((n) => n + 1)}>
										Try again
									</Button>
								)
							}
						/>
					)}
				</Show>
				<Show when={loading()}>
					<div class="flex flex-col gap-1">
						<Skeleton class="h-11" />
						<Skeleton class="h-11" />
						<Skeleton class="h-11" />
					</div>
				</Show>
				<Show when={!loading() && listing()}>
					<div class="min-w-0 overflow-hidden rounded-lg border border-ink/10">
						<Show when={path()}>
							<button
								type="button"
								onClick={() => setPath(parent(path()))}
								class="focus-ring flex min-h-11 w-full items-center gap-3 border-stroke border-b px-3 text-left text-ink/55 text-ui hover:bg-ink/5"
							>
								<FolderIcon class="size-4" /> .. <span class="text-ui-xs">Up one folder</span>
							</button>
						</Show>
						<Show
							when={listing()?.entries.length}
							fallback={
								<p class="px-3 py-8 text-center text-ink/45 text-ui-sm">
									This folder is empty. Add a file or folder to start.
								</p>
							}
						>
							<ul>
								<For each={listing()?.entries}>
									{(entry) => (
										<FileRow entry={entry} onOpen={() => setPath(entry.path)} onCopy={copy} />
									)}
								</For>
							</ul>
						</Show>
					</div>
				</Show>
			</div>
			<Sheet
				open={creating() !== null}
				onClose={() => setCreating(null)}
				label={`New ${creating() ?? "item"}`}
			>
				<form onSubmit={(event) => void create(event)} class="flex flex-col gap-4 p-4 pt-6 md:pt-4">
					<h2 class="font-semibold text-ink text-ui-lg">New {creating()}</h2>
					<Field label="Name" error={formError()}>
						<Input
							autofocus
							value={name()}
							onInput={(event) => setName(event.currentTarget.value)}
							autocomplete="off"
							autocapitalize="off"
							spellcheck={false}
							placeholder={creating() === "file" ? "notes.md" : "New folder"}
						/>
					</Field>
					<div class="flex justify-end gap-2">
						<Button onClick={() => setCreating(null)}>Cancel</Button>
						<Button type="submit" variant="primary" disabled={saving()}>
							{saving() ? "Creating…" : "Create"}
						</Button>
					</div>
				</form>
			</Sheet>
		</Show>
	);
}

function FileRow(props: {
	entry: ProjectFile;
	onOpen: () => void;
	onCopy: (value: string) => Promise<void>;
}): JSX.Element {
	let row: HTMLLIElement | undefined;
	let timer: ReturnType<typeof setTimeout> | undefined;
	let start = { x: 0, y: 0 };
	let held = false;
	const folder = () => props.entry.kind === "folder";
	const openMenu = () => {
		if (!row?.isConnected) return;
		const popover = row?.querySelector<HTMLElement>("[popover]");
		if (popover?.showPopover && !popover.matches(":popover-open")) popover.showPopover();
	};
	const cancelHold = () => {
		if (timer) clearTimeout(timer);
		timer = undefined;
	};
	const items = () => [
		...(folder() ? [{ id: "open", label: "Open folder" }] : []),
		{ id: "path", label: "Copy relative path" },
		{ id: "name", label: "Copy name" },
	];
	return (
		// The row owns secondary context gestures; its primary folder button remains keyboard accessible.
		// oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
		<li
			ref={(el) => {
				row = el;
			}}
			class="flex min-w-0 items-center border-stroke border-b last:border-b-0"
			onContextMenu={(event) => {
				event.preventDefault();
				// A mouse context event can light-dismiss a popover opened in the same event turn.
				setTimeout(openMenu, 0);
			}}
			onPointerDown={(event) => {
				if (event.pointerType !== "touch") return;
				start = { x: event.clientX, y: event.clientY };
				held = false;
				cancelHold();
				timer = setTimeout(() => {
					held = true;
					openMenu();
					timer = undefined;
				}, 500);
			}}
			onPointerMove={(event) => {
				if (Math.abs(event.clientX - start.x) > 8 || Math.abs(event.clientY - start.y) > 8)
					cancelHold();
			}}
			onPointerUp={cancelHold}
			onPointerCancel={cancelHold}
		>
			<Show
				when={folder()}
				fallback={
					<div class="flex min-h-11 min-w-0 flex-1 items-center gap-3 px-3 text-ui">
						<FileIcon class="size-4 shrink-0 text-ink/45" />
						<span class="min-w-0 flex-1 truncate">{props.entry.name}</span>
					</div>
				}
			>
				<button
					type="button"
					onClick={(event) => {
						if (held) {
							event.preventDefault();
							held = false;
						} else props.onOpen();
					}}
					class="focus-ring flex min-h-11 min-w-0 flex-1 items-center gap-3 px-3 text-left text-ui hover:bg-ink/5"
				>
					<FolderIcon class="size-4 shrink-0 text-ink/55" />
					<span class="min-w-0 flex-1 truncate">{props.entry.name}</span>
				</button>
			</Show>
			<Menu
				label={`${props.entry.name} actions`}
				trigger={<MoreIcon class="size-4" />}
				items={items()}
				onSelect={(id) => {
					if (id === "open") props.onOpen();
					else void props.onCopy(id === "name" ? props.entry.name : props.entry.path);
				}}
			/>
		</li>
	);
}
