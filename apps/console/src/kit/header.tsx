import type { JSX } from "@solidjs/web";
import { createSignal, For, onCleanup, Show } from "solid-js";

import { iconButton } from "./button";
import { attachContextMenu, type MenuPoint } from "./context-menu";
import { CloseIcon, PlusIcon } from "./icons";

/** Where you are: `Chat / Meta ROAS dropped`, the last part in full ink. */
export function Breadcrumbs(props: {
	items: readonly { label: string; href?: string; icon?: JSX.Element }[];
}): JSX.Element {
	return (
		<nav aria-label="Breadcrumb" class="flex min-w-0 items-center gap-2 text-body-lg">
			<For each={props.items}>
				{(item, index) => (
					<>
						<Show when={index() > 0}>
							<span class="text-fg-faint">/</span>
						</Show>
						<Show
							when={item.href && index() < props.items.length - 1}
							fallback={
								<span
									class={`flex min-w-0 items-center gap-1.5 truncate ${index() === props.items.length - 1 ? "text-fg" : "text-fg-subtle"}`}
								>
									{item.icon}
									<span class="truncate">{item.label}</span>
								</span>
							}
						>
							<a
								href={item.href}
								class="focus-ring flex shrink-0 items-center gap-1.5 rounded-kit-sm text-fg-subtle hover:text-fg"
							>
								{item.icon}
								{item.label}
							</a>
						</Show>
					</>
				)}
			</For>
		</nav>
	);
}

export type HeaderTab = {
	id: string;
	label: string;
	href: string;
	icon?: JSX.Element;
	/** Its agent is working: the label shimmers. */
	running?: boolean;
	/** False for a tab that is a place rather than a document (a new chat). */
	closable?: boolean;
	/** A quiet word after the label: where it runs, or that it ended. */
	badge?: string;
	/** Kept at the front as its icon alone, and not closed by "close others". */
	pinned?: boolean;
	/** A dot on its icon: its agent waits on you, or finished while you were elsewhere. */
	attention?: "waiting" | "done";
};

const ATTENTION_LABEL = { waiting: "waiting on you", done: "finished" } as const;

/**
 * Open things as tabs along the top, as a browser has them: the current one raised, each closable,
 * a plus for a new one. Scrolls sideways when there are many. Pinned tabs sit first as their icon;
 * a tab's menu opens on right-click or a long press, and tabs drag into a new order.
 */
export function HeaderTabs(props: {
	tabs: readonly HeaderTab[];
	current: string | null;
	onClose?: (id: string) => void;
	/** Right-click or long press on a tab: its menu (pin, close others…), at that point. */
	onMenuAt?: (id: string, point: MenuPoint) => void;
	/** A tab was dropped beside another: move `id` before (or after) `target`. */
	onReorder?: (id: string, target: string, after: boolean) => void;
	newHref?: string;
	newLabel?: string;
	/** In place of the plus link: a button or a menu that opens the new tab. */
	newAction?: JSX.Element;
}): JSX.Element {
	const [dragging, setDragging] = createSignal<string | null>(null);
	const [over, setOver] = createSignal<{ id: string; after: boolean } | null>(null);
	const half = (event: DragEvent) => {
		const box = (event.currentTarget as HTMLElement).getBoundingClientRect();
		return event.clientX > box.left + box.width / 2;
	};
	return (
		<div class="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto [scrollbar-width:none]">
			<For each={props.tabs}>
				{(tab) => (
					<div
						ref={(el) => {
							if (!props.onMenuAt) return;
							onCleanup(attachContextMenu(el, (point) => props.onMenuAt?.(tab.id, point)));
						}}
						aria-current={props.current === tab.id ? "page" : undefined}
						data-tab={tab.id}
						draggable={props.onReorder && tab.closable !== false ? "true" : undefined}
						onDragStart={(event) => {
							setDragging(tab.id);
							event.dataTransfer?.setData("text/plain", tab.id);
							if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
						}}
						onDragOver={(event) => {
							const from = dragging();
							if (!from || from === tab.id || tab.closable === false) return;
							event.preventDefault();
							setOver({ id: tab.id, after: half(event) });
						}}
						onDragLeave={() => setOver(null)}
						onDrop={(event) => {
							const from = dragging();
							const target = over();
							event.preventDefault();
							setOver(null);
							setDragging(null);
							if (from && target) props.onReorder?.(from, target.id, target.after);
						}}
						onDragEnd={() => {
							setDragging(null);
							setOver(null);
						}}
						class={`group/tab relative flex h-kit-control-sm min-w-0 shrink items-center rounded-kit text-body text-fg-muted transition-colors duration-fast hover:bg-fill hover:text-fg aria-[current=page]:bg-selection aria-[current=page]:text-fg pointer-coarse:h-10 ${tab.pinned ? "shrink-0" : "max-w-60"} ${dragging() === tab.id ? "opacity-50" : ""}`}
					>
						<Show when={over()?.id === tab.id}>
							<span
								aria-hidden="true"
								class={`absolute inset-y-1 w-0.5 rounded-full bg-accent ${over()?.after ? "-right-0.5" : "-left-0.5"}`}
							/>
						</Show>
						<a
							href={tab.href}
							draggable="false"
							aria-label={
								tab.pinned || tab.attention
									? `${tab.label}${tab.pinned ? ", pinned" : ""}${tab.attention ? `, ${ATTENTION_LABEL[tab.attention]}` : ""}`
									: undefined
							}
							title={tab.pinned ? tab.label : undefined}
							class={`focus-ring flex min-w-0 flex-1 items-center gap-2 rounded-kit py-1 ${tab.pinned ? "px-2" : "pr-2.5 pl-2.5"}`}
						>
							<Show when={tab.icon}>
								<span class="relative grid size-4 shrink-0 place-items-center text-fg-muted [&_svg]:size-3.5">
									{tab.icon}
									<Show when={tab.attention}>
										{(kind) => (
											<span
												aria-hidden="true"
												class={`absolute -top-0.5 -right-0.5 size-1.5 rounded-full ring-2 ring-surface ${kind() === "waiting" ? "bg-warning" : "bg-accent"}`}
											/>
										)}
									</Show>
								</span>
							</Show>
							<Show when={!tab.pinned}>
								<span class={`truncate ${tab.running ? "thread-running" : ""}`}>{tab.label}</span>
								<Show when={tab.badge}>
									<span class="max-w-24 shrink-0 truncate rounded-kit-sm bg-fill-strong px-1 text-caption text-fg-subtle">
										{tab.badge}
									</span>
								</Show>
							</Show>
						</a>
						<Show when={props.onClose && tab.closable !== false && !tab.pinned}>
							<button
								type="button"
								aria-label={`Close ${tab.label}`}
								onClick={() => props.onClose?.(tab.id)}
								class="focus-ring -ml-1.5 mr-1 grid size-4.5 shrink-0 place-items-center rounded-kit-xs text-fg-faint opacity-0 hover:bg-fill-strong hover:text-fg focus-visible:opacity-100 group-hover/tab:opacity-100 group-focus-within/tab:opacity-100 group-aria-[current=page]/tab:opacity-100 pointer-coarse:opacity-100"
							>
								<CloseIcon class="size-3" />
							</button>
						</Show>
					</div>
				)}
			</For>
			{props.newAction}
			<Show when={!props.newAction && props.newHref}>
				<a
					href={props.newHref}
					aria-label={props.newLabel ?? "New tab"}
					title={props.newLabel ?? "New tab"}
					class={iconButton({ size: "sm" })}
				>
					<PlusIcon />
				</a>
			</Show>
		</div>
	);
}
