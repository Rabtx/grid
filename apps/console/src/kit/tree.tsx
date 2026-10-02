import type { JSX } from "@solidjs/web";
import { createEffect, createSignal, For, onSettled, Show, untrack } from "solid-js";

import { attachContextMenu, type MenuPoint } from "./context-menu";
import { EntryIcon } from "./file-icon";
import { ChevronRightIcon } from "./icons";

export type TreeNode = { name: string; children?: readonly TreeNode[]; badge?: JSX.Element };

/** Files and folders, indented, folders folding open; the chosen file highlighted. */
export function FileTree(props: {
	nodes: readonly TreeNode[];
	selected?: string;
	onSelect?: (path: string) => void;
}): JSX.Element {
	return (
		<ul class="flex flex-col gap-px">
			<For each={props.nodes}>
				{(node) => (
					<TreeRow
						node={node}
						depth={0}
						path={node.name}
						selected={props.selected}
						onSelect={props.onSelect}
					/>
				)}
			</For>
		</ul>
	);
}

function TreeRow(props: {
	node: TreeNode;
	depth: number;
	path: string;
	selected?: string;
	onSelect?: (path: string) => void;
}): JSX.Element {
	const [open, setOpen] = createSignal(props.depth === 0);
	const folder = () => Boolean(props.node.children);
	return (
		<li>
			<button
				type="button"
				aria-expanded={folder() ? (open() ? "true" : "false") : undefined}
				aria-current={props.selected === props.path ? "true" : undefined}
				onClick={() => (folder() ? setOpen(!open()) : props.onSelect?.(props.path))}
				style={{ "padding-left": `${props.depth * 14 + 6}px` }}
				class="focus-ring flex h-7 w-full items-center gap-1.5 rounded-kit pr-2 text-left text-body text-fg-muted hover:bg-fill hover:text-fg aria-[current=true]:bg-fill-strong aria-[current=true]:text-fg pointer-coarse:h-10"
			>
				<span class="grid size-3.5 shrink-0 place-items-center text-fg-faint">
					<Show when={folder()}>
						<ChevronRightIcon
							class={`size-3 transition-transform duration-fast ${open() ? "rotate-90" : ""}`}
						/>
					</Show>
				</span>
				<span class="grid shrink-0 place-items-center text-fg-subtle">
					<EntryIcon name={props.node.name} folder={folder()} open={open()} />
				</span>
				<span class="min-w-0 flex-1 truncate">{props.node.name}</span>
				{props.node.badge}
			</button>
			<Show when={folder() && open()}>
				<ul class="flex flex-col gap-px">
					<For each={props.node.children}>
						{(child) => (
							<TreeRow
								node={child}
								depth={props.depth + 1}
								path={`${props.path}/${child.name}`}
								selected={props.selected}
								onSelect={props.onSelect}
							/>
						)}
					</For>
				</ul>
			</Show>
		</li>
	);
}

/** A file or folder in a real tree, by its path from the root. */
export type FolderEntry = { name: string; path: string; kind: "file" | "folder" };

type FolderTreeProps = {
	/** A folder's entries once loaded (`""` is the root); undefined while it loads. */
	entries: (path: string) => readonly FolderEntry[] | undefined;
	/** Why a folder could not be read, shown in its place. */
	error?: (path: string) => string | null;
	/** A folder was opened: load its entries if they are not there yet. */
	onExpand: (path: string) => void;
	selected?: string;
	onSelect: (entry: FolderEntry) => void;
	/**
	 * A mark at the end of a row, before its actions — a dirty dot on a file being edited, a
	 * count. Nothing for the rows it returns nothing for.
	 */
	mark?: (entry: FolderEntry) => JSX.Element;
	/** Row actions for pointers (a ⋯ menu), shown on hover. */
	actions?: (entry: FolderEntry) => JSX.Element;
	/** Right-click and long press on a row. */
	onMenuAt?: (entry: FolderEntry, point: MenuPoint) => void;
	/** A path to show: its folders open, as when a link lands on a file deep in the tree. */
	reveal?: string;
};

/**
 * A project's folders, loaded as they open: folders first, the open file lit. Rows are the
 * sidebar's height, taller on touch; their menu is a ⋯ on hover or a long press.
 */
export function FolderTree(props: FolderTreeProps): JSX.Element {
	const [open, setOpen] = createSignal<ReadonlySet<string>>(new Set());
	createEffect(
		() => props.reveal ?? "",
		(path) => {
			const parts = path.split("/").filter(Boolean);
			const folders = parts.map((_, index) => parts.slice(0, index + 1).join("/"));
			const current = untrack(open);
			const missing = folders.filter((folder) => !current.has(folder));
			if (missing.length === 0) return;
			for (const folder of missing) props.onExpand(folder);
			setOpen(new Set([...current, ...missing]));
		},
	);
	// An open folder whose entries went away (the tree was read again) asks for them again.
	createEffect(
		() => [...open()].filter((path) => props.entries(path) === undefined && !props.error?.(path)),
		(missing) => {
			for (const path of missing) props.onExpand(path);
		},
	);
	function toggle(path: string): void {
		const next = new Set(open());
		if (next.has(path)) next.delete(path);
		else {
			next.add(path);
			props.onExpand(path);
		}
		setOpen(next);
	}
	return (
		<FolderLevel
			tree={props}
			path=""
			depth={0}
			isOpen={(path) => open().has(path)}
			onToggle={toggle}
		/>
	);
}

function FolderLevel(props: {
	tree: FolderTreeProps;
	path: string;
	depth: number;
	isOpen: (path: string) => boolean;
	onToggle: (path: string) => void;
}): JSX.Element {
	const indent = () => ({ "padding-left": `${props.depth * 14 + 8}px` });
	return (
		<Show
			when={props.tree.entries(props.path)}
			fallback={
				<Show
					when={props.tree.error?.(props.path)}
					fallback={
						<p style={indent()} class="py-1.5 text-caption text-fg-faint">
							Loading…
						</p>
					}
				>
					{(message) => (
						<p style={indent()} class="py-1.5 pr-2 text-caption text-danger">
							{message()}
						</p>
					)}
				</Show>
			}
		>
			{(entries) => (
				<Show
					when={entries().length > 0}
					fallback={
						<p style={indent()} class="py-1.5 text-caption text-fg-faint">
							Empty
						</p>
					}
				>
					<ul class="flex flex-col gap-px">
						<For each={entries()}>
							{(entry) => (
								<li>
									<FolderRow
										tree={props.tree}
										entry={entry}
										depth={props.depth}
										open={props.isOpen(entry.path)}
										onToggle={() => props.onToggle(entry.path)}
									/>
									<Show when={entry.kind === "folder" && props.isOpen(entry.path)}>
										<FolderLevel {...props} path={entry.path} depth={props.depth + 1} />
									</Show>
								</li>
							)}
						</For>
					</ul>
				</Show>
			)}
		</Show>
	);
}

function FolderRow(props: {
	tree: FolderTreeProps;
	entry: FolderEntry;
	depth: number;
	open: boolean;
	onToggle: () => void;
}): JSX.Element {
	let frame: HTMLDivElement | undefined;
	onSettled(() => {
		const menu = props.tree.onMenuAt;
		return frame && menu
			? attachContextMenu(frame, (point) => menu(props.entry, point))
			: undefined;
	});
	const folder = () => props.entry.kind === "folder";
	const mark = () => (props.entry.kind === "file" ? props.tree.mark?.(props.entry) : undefined);
	const actions = () => props.tree.actions?.(props.entry);
	return (
		<div
			ref={(el) => {
				frame = el;
			}}
			class="group/row relative select-none [-webkit-touch-callout:none]"
		>
			<button
				type="button"
				aria-expanded={folder() ? (props.open ? "true" : "false") : undefined}
				aria-current={props.tree.selected === props.entry.path ? "true" : undefined}
				onClick={() => (folder() ? props.onToggle() : props.tree.onSelect(props.entry))}
				style={{ "padding-left": `${props.depth * 14 + 6}px` }}
				class="focus-ring flex h-7 w-full min-w-0 items-center gap-1.5 rounded-kit pr-8 text-left text-body text-fg-muted hover:bg-fill hover:text-fg aria-[current=true]:bg-fill-strong aria-[current=true]:text-fg pointer-coarse:h-10 pointer-coarse:pr-2"
			>
				<span class="grid size-3.5 shrink-0 place-items-center text-fg-faint">
					<Show when={folder()}>
						<ChevronRightIcon
							class={`size-3 transition-transform duration-fast ${props.open ? "rotate-90" : ""}`}
						/>
					</Show>
				</span>
				<span class="grid shrink-0 place-items-center text-fg-subtle">
					<EntryIcon name={props.entry.name} folder={folder()} open={props.open} />
				</span>
				<span class="min-w-0 flex-1 truncate">{props.entry.name}</span>
				<Show when={mark()}>
					<span class="grid shrink-0 place-items-center pr-1">{mark()}</span>
				</Show>
			</button>
			<Show when={actions()}>
				<div class="absolute inset-y-0 right-0.5 flex items-center opacity-0 transition-opacity duration-fast group-hover/row:opacity-100 focus-within:opacity-100 pointer-coarse:pointer-events-none pointer-coarse:opacity-0">
					{actions()}
				</div>
			</Show>
		</div>
	);
}

/**
 * A file or folder as a row in a list (Figma 13 · Files on phones): its icon on a tile, its name
 * with a stat beside it, a line under it, a mark and a chevron on the right. The whole row is a link.
 */
export function FileRow(props: {
	/** Where it opens; none for something that cannot be opened (a deleted file). */
	href?: string;
	name: string;
	folder: boolean;
	/** Beside the name: lines added and removed. */
	stat?: JSX.Element;
	detail?: string;
	/** Before the chevron: how it stands in git (M, A). */
	mark?: JSX.Element;
	label?: string;
}): JSX.Element {
	const ROW = "flex min-h-14 min-w-0 items-center gap-3 rounded-kit-lg px-1 py-2";
	const inside = () => (
		<>
			<span class="grid size-9 shrink-0 place-items-center [&_img]:size-7 [&_svg]:size-6">
				<EntryIcon name={props.name} folder={props.folder} />
			</span>
			<span class="flex min-w-0 flex-1 flex-col">
				<span class="flex min-w-0 items-baseline gap-2">
					<span class="truncate text-body-lg text-fg">{props.name}</span>
					{props.stat}
				</span>
				<Show when={props.detail}>
					<span class="truncate text-caption text-fg-subtle">{props.detail}</span>
				</Show>
			</span>
			{props.mark}
		</>
	);
	return (
		<Show when={props.href} fallback={<div class={`${ROW} opacity-70`}>{inside()}</div>}>
			{(href) => (
				<a
					href={href()}
					aria-label={props.label}
					class={`focus-ring ${ROW} transition-colors duration-fast hover:bg-fill`}
				>
					{inside()}
					<ChevronRightIcon size="sm" class="shrink-0 text-fg-faint" />
				</a>
			)}
		</Show>
	);
}

/** How a file stands in git, as a letter in its colour: M (amber), A (green), D (red). */
export function GitMark(props: {
	status: "modified" | "added" | "deleted" | "renamed";
}): JSX.Element {
	const look = () =>
		({
			modified: { letter: "M", tone: "text-warning", label: "Modified" },
			added: { letter: "A", tone: "text-success", label: "Added" },
			deleted: { letter: "D", tone: "text-danger", label: "Deleted" },
			renamed: { letter: "R", tone: "text-accent", label: "Renamed" },
		})[props.status];
	return (
		<span
			title={look().label}
			class={`w-4 shrink-0 text-center font-medium text-caption ${look().tone}`}
		>
			<span aria-hidden="true">{look().letter}</span>
			<span class="sr-only">{look().label}</span>
		</span>
	);
}

/** A file's state in git as a tinted word beside its name (Modified, Added) in a table. */
export function GitBadge(props: {
	status: "modified" | "added" | "deleted" | "renamed";
}): JSX.Element {
	const look = () =>
		({
			modified: { label: "Modified", tint: "tint-warning" },
			added: { label: "Added", tint: "tint-success" },
			deleted: { label: "Deleted", tint: "tint-danger" },
			renamed: { label: "Renamed", tint: "tint-accent" },
		})[props.status];
	return (
		<span
			class={`inline-flex h-5 shrink-0 items-center rounded-kit-sm px-1.5 text-caption ${look().tint}`}
		>
			{look().label}
		</span>
	);
}
