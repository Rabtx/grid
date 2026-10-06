import type { JSX } from "@solidjs/web";
import { createEffect, createMemo, createSignal, For, Show, untrack } from "solid-js";

import type { ChangedFile } from "@/modules/chat/lib/thread-facts";
import type { FileDiff } from "@/modules/chat/types/chat.types";
import {
	CodeIcon,
	GlobeIcon,
	iconButton,
	Menu,
	type MenuGroup,
	MoreIcon,
	SPLIT_TAB_TYPE,
	SplitDropTarget,
	SplitHandle,
	SplitShare,
	type SplitTab,
	SplitTabs,
	TerminalIcon,
} from "@/kit";

import {
	activate,
	clampStack,
	closeTab,
	moveToOtherPane,
	openTab,
	type Pane,
	type PaneTab,
	paneOf,
	STACK,
	tabId,
} from "../lib/layout";
import { baseName } from "../lib/paths";
import { layoutsStore } from "../stores/layouts";
import type { ThreadPlace } from "../stores/thread-terminals";

import { FilePane } from "./file-pane";
import { PreviewPane } from "./preview-pane";
import { TerminalPane } from "./terminal-pane";

export type WorkspaceProps = {
	place: ThreadPlace;
	project: string;
	/** The project's folder on its machine. */
	folder: string | undefined;
	/** The files the agent has changed in this thread. */
	files: readonly ChangedFile[];
	diffsFor: (path: string) => FileDiff[];
	/** One pane only, whatever the layout says: the phone's docked card. */
	single?: boolean;
};

type PaneActions = {
	activate: (id: string) => void;
	close: (id: string) => void;
	open: (tab: PaneTab) => void;
	move: (id: string) => void;
};

function describe(tab: PaneTab): SplitTab {
	if (tab.kind === "terminal") return { id: "terminal", label: "Terminal", icon: <TerminalIcon /> };
	if (tab.kind === "preview") return { id: "preview", label: "Preview", icon: <GlobeIcon /> };
	return { id: tabId(tab), label: baseName(tab.path), icon: <CodeIcon />, closable: true };
}

/**
 * The thread's workspace: one pane in Split, two stacked in Three. Each pane's tabs stay mounted
 * once opened, so a terminal keeps its connection and a preview its page while other tabs show.
 */
export function Workspace(props: WorkspaceProps): JSX.Element {
	const thread = () => props.place.thread;
	const layout = () => layoutsStore.of(thread());
	// A phone shows one pane holding every tab. Which one it shows is its own choice, so using the
	// phone never rearranges the desktop's layout.
	const [phoneActive, setPhoneActive] = createSignal<string | null>(null);
	const merged = createMemo((): Pane => {
		const tabs = layout().panes.flatMap((pane) => pane.tabs);
		const wanted = phoneActive();
		const active =
			wanted && tabs.some((tab) => tabId(tab) === wanted) ? wanted : layout().panes[0].active;
		return { tabs, active };
	});
	const panes = createMemo(() => (props.single ? [merged()] : layout().panes));
	const [dragging, setDragging] = createSignal<{ pane: number; id: string } | null>(null);
	let column: HTMLDivElement | undefined;

	const change = (fn: Parameters<typeof layoutsStore.update>[1]) =>
		layoutsStore.update(thread(), fn);

	/** What a pane's tabs and menu do: on a phone, on the merged pane; otherwise on pane `index`. */
	function actionsFor(index: number): PaneActions {
		if (props.single)
			return {
				activate: setPhoneActive,
				close: (id) => change((current) => closeTab(current, paneOf(current, id), id)),
				open: (tab) => {
					change((current) => openTab(current, tab, 0));
					setPhoneActive(tabId(tab));
				},
				move: () => {},
			};
		return {
			activate: (id) => change((current) => activate(current, index, id)),
			close: (id) => change((current) => closeTab(current, index, id)),
			open: (tab) => change((current) => openTab(current, tab, index)),
			move: (id) => change((current) => moveToOtherPane(current, index, id)),
		};
	}

	function drop(target: number, event: DragEvent): void {
		event.preventDefault();
		setDragging(null);
		const raw = event.dataTransfer?.getData(SPLIT_TAB_TYPE);
		if (!raw) return;
		try {
			const { pane, id } = JSON.parse(raw) as { pane: number; id: string };
			if (typeof pane !== "number" || typeof id !== "string") return;
			// Dropped where it already is with nowhere else to go: nothing to do.
			if (pane === target && layout().panes.length > 1) return;
			change((current) => moveToOtherPane(current, pane, id));
		} catch {
			// Not a tab from this workspace.
		}
	}

	// The divider between the two panes of Three: dragged, or moved with the arrow keys.
	function dragStack(event: PointerEvent): void {
		if (!column) return;
		const box = column.getBoundingClientRect();
		const handle = event.currentTarget as HTMLElement;
		handle.setPointerCapture(event.pointerId);
		const move = (next: PointerEvent) =>
			layoutsStore.preview(thread(), (current) => ({
				...current,
				stack: clampStack((next.clientY - box.top) / box.height),
			}));
		const end = () => {
			handle.removeEventListener("pointermove", move);
			handle.removeEventListener("pointerup", end);
			handle.removeEventListener("pointercancel", end);
			layoutsStore.save(thread());
		};
		handle.addEventListener("pointermove", move);
		handle.addEventListener("pointerup", end);
		handle.addEventListener("pointercancel", end);
	}

	return (
		<div
			ref={(el) => {
				column = el;
			}}
			class="flex min-h-0 min-w-0 flex-1 flex-col gap-2"
		>
			{/* By position, not by object: a layout change makes new pane objects, and remounting
			    a pane would drop its terminal's connection. */}
			<For each={panes()} keyed={false}>
				{(pane, index) => (
					<>
						<Show when={index === 1}>
							<SplitHandle
								orientation="horizontal"
								label="Resize panes"
								value={Math.round(layout().stack * 100)}
								min={Math.round(STACK.min * 100)}
								max={Math.round(STACK.max * 100)}
								onPointerDown={dragStack}
								onReset={() => change((current) => ({ ...current, stack: STACK.initial }))}
								onKeyDown={(event) => {
									const step =
										event.key === "ArrowUp" ? -0.05 : event.key === "ArrowDown" ? 0.05 : 0;
									if (!step) return;
									event.preventDefault();
									change((current) => ({ ...current, stack: clampStack(current.stack + step) }));
								}}
							/>
						</Show>
						<PaneView
							{...props}
							index={index}
							pane={pane()}
							grow={panes().length > 1 ? (index === 0 ? layout().stack : 1 - layout().stack) : 1}
							dragging={dragging()}
							canSplit={!props.single}
							onDragStart={(id) => setDragging({ pane: index, id })}
							onDragEnd={() => setDragging(null)}
							onDrop={(event) => drop(index, event)}
							actions={actionsFor(index)}
						/>
					</>
				)}
			</For>
		</div>
	);
}

function PaneView(
	props: WorkspaceProps & {
		index: number;
		pane: Pane;
		/** Its share of the column's height. */
		grow: number;
		dragging: { pane: number; id: string } | null;
		canSplit: boolean;
		onDragStart: (id: string) => void;
		onDragEnd: () => void;
		onDrop: (event: DragEvent) => void;
		actions: PaneActions;
	},
): JSX.Element {
	const layout = () => layoutsStore.of(props.place.thread);
	// Tabs are mounted the first time they show and kept after, hidden while another shows.
	const [mounted, setMounted] = createSignal<string[]>([]);
	createEffect(
		() => props.pane.active,
		(active) => {
			if (!untrack(mounted).includes(active)) setMounted((list) => [...list, active]);
		},
	);
	const live = createMemo(() => props.pane.tabs.filter((tab) => mounted().includes(tabId(tab))));

	// A drag from elsewhere lands here; in a single pane, a drag of one of its own tabs splits it.
	const dropTarget = () => {
		const drag = props.dragging;
		if (!drag || !props.canSplit) return false;
		if (drag.pane !== props.index) return true;
		return layout().panes.length === 1 && props.pane.tabs.length > 1;
	};
	const draggedLabel = () => {
		const drag = props.dragging;
		if (!drag) return "";
		const tab = layout().panes[drag.pane]?.tabs.find((item) => tabId(item) === drag.id);
		return tab ? describe(tab).label : "";
	};

	const menu = (): MenuGroup[] => {
		const open = (tab: PaneTab) => paneOf(layout(), tabId(tab)) < 0;
		const candidates: PaneTab[] = [
			{ kind: "terminal" },
			{ kind: "preview" },
			...props.files.map((file): PaneTab => ({ kind: "file", path: file.path })),
		];
		const offers = candidates.filter(open);
		const active = props.pane.active;
		const groups: MenuGroup[] = [];
		if (offers.length)
			groups.push({
				label: "Open",
				items: offers.map((tab) => ({
					id: `open:${tabId(tab)}`,
					label: describe(tab).label,
					description: tab.kind === "file" ? tab.path : undefined,
					icon: describe(tab).icon,
				})),
			});
		const here: MenuGroup["items"][number][] = [];
		if (props.canSplit && (layout().panes.length > 1 || props.pane.tabs.length > 1))
			here.push({
				id: "move",
				label: layout().panes.length > 1 ? "Move to the other pane" : "Open in a new pane",
			});
		here.push({
			id: "close",
			label: `Close ${describe(props.pane.tabs.find((t) => tabId(t) === active) ?? { kind: "terminal" }).label}`,
		});
		groups.push({ items: here });
		return groups;
	};

	function select(id: string): void {
		const active = props.pane.active;
		if (id.startsWith("open:")) {
			const key = id.slice("open:".length);
			const tab: PaneTab =
				key === "terminal"
					? { kind: "terminal" }
					: key === "preview"
						? { kind: "preview" }
						: { kind: "file", path: key.slice("file:".length) };
			props.actions.open(tab);
		} else if (id === "move") {
			props.actions.move(active);
		} else if (id === "close") {
			props.actions.close(active);
		}
	}

	return (
		<SplitShare share={props.grow}>
			<section
				aria-label={`Workspace pane ${props.index + 1}`}
				class="surface-card relative flex min-h-0 flex-1 flex-col overflow-hidden"
			>
				<header class="flex h-12 shrink-0 items-center gap-2 border-line border-b px-2">
					<SplitTabs
						label="Open in this pane"
						tabs={props.pane.tabs.map(describe)}
						active={props.pane.active}
						pane={props.canSplit ? props.index : undefined}
						onSelect={(id) => props.actions.activate(id)}
						onClose={(id) => props.actions.close(id)}
						onDragStart={props.onDragStart}
						onDragEnd={props.onDragEnd}
					/>
					<span class="flex-1" />
					<Menu
						label="Pane actions"
						trigger={<MoreIcon size="sm" />}
						triggerClass={iconButton({ size: "xs" })}
						placement="bottom-end"
						groups={menu()}
						onSelect={select}
					/>
				</header>
				<div class="relative flex min-h-0 flex-1 flex-col">
					<For each={live()} keyed={(tab) => tabId(tab)}>
						{(tab) => (
							<div
								class="absolute inset-0 flex flex-col"
								hidden={tabId(tab()) !== props.pane.active}
							>
								<Show when={tab().kind === "terminal"}>
									<TerminalPane place={props.place} active={tabId(tab()) === props.pane.active} />
								</Show>
								<Show when={tab().kind === "preview"}>
									<PreviewPane
										place={props.place}
										active={tabId(tab()) === props.pane.active}
										onShowTerminal={() => props.actions.open({ kind: "terminal" })}
									/>
								</Show>
								<Show when={tab().kind === "file" ? (tab() as { path: string }).path : null}>
									{(path) => (
										<FilePane
											project={props.project}
											folder={props.folder}
											cwd={props.place.cwd}
											path={path()}
											diffs={props.diffsFor(path())}
											active={tabId(tab()) === props.pane.active}
										/>
									)}
								</Show>
							</div>
						)}
					</For>
					<Show when={dropTarget()}>
						<SplitDropTarget
							label={`Open ${draggedLabel()} here`}
							hint="Release to split"
							icon={<CodeIcon />}
							lower={layout().panes.length === 1}
							onDrop={props.onDrop}
						/>
					</Show>
				</div>
			</section>
		</SplitShare>
	);
}
