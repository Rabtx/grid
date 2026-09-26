import type { JSX } from "@solidjs/web";
import { createSignal, For, Show } from "solid-js";

import { ChevronRightIcon, FileIcon, FolderIcon } from "./icons";

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
				<span class="shrink-0 text-fg-subtle">
					<Show when={folder()} fallback={<FileIcon class="size-4" />}>
						<FolderIcon class="size-4" />
					</Show>
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
