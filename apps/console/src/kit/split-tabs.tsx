import type { JSX } from "@solidjs/web";
import { For, onSettled, Show } from "solid-js";

import { attachEdgeFade } from "./edge-fade";
import { tap } from "./haptics";
import { CloseIcon } from "./icons";

export type SplitTab = {
	id: string;
	label: string;
	icon?: JSX.Element;
	/** Shows a close button on the tab (files); fixed tabs (a terminal) close from the pane menu. */
	closable?: boolean;
};

/** The drag payload a tab carries: which tab, from which pane. */
export const SPLIT_TAB_TYPE = "application/x-grid-split-tab";

/**
 * A workspace pane's tabs: a pill strip like `Segmented`, scrolling sideways when it fills, with
 * closable tabs and tabs that can be dragged into another pane.
 */
export function SplitTabs(props: {
	label: string;
	tabs: readonly SplitTab[];
	active: string;
	onSelect: (id: string) => void;
	onClose?: (id: string) => void;
	/** Set to let tabs be dragged; the payload carries this pane's index. */
	pane?: number;
	onDragStart?: (id: string) => void;
	onDragEnd?: () => void;
}): JSX.Element {
	let strip: HTMLDivElement | undefined;
	onSettled(() => (strip ? attachEdgeFade(strip) : undefined));
	return (
		<div
			ref={(el) => {
				strip = el;
			}}
			role="tablist"
			aria-label={props.label}
			class="edge-fade flex min-w-0 items-center gap-0.5 overflow-x-auto rounded-kit bg-fill-strong p-0.5 [scrollbar-width:none]"
		>
			<For each={props.tabs}>
				{(tab) => (
					<div
						role="presentation"
						draggable={props.pane !== undefined ? "true" : "false"}
						onDragStart={(event) => {
							if (props.pane === undefined || !event.dataTransfer) return;
							event.dataTransfer.effectAllowed = "move";
							event.dataTransfer.setData(
								SPLIT_TAB_TYPE,
								JSON.stringify({ pane: props.pane, id: tab.id }),
							);
							props.onDragStart?.(tab.id);
						}}
						onDragEnd={() => props.onDragEnd?.()}
						data-selected={props.active === tab.id ? "" : undefined}
						class="flex shrink-0 items-center rounded-kit-sm data-selected:bg-surface data-selected:shadow-knob"
					>
						<button
							type="button"
							role="tab"
							aria-selected={props.active === tab.id ? "true" : "false"}
							title={tab.label}
							onClick={() => {
								if (props.active !== tab.id) tap();
								props.onSelect(tab.id);
							}}
							class={`focus-ring flex h-[calc(var(--kit-h-control-sm)-0.25rem)] max-w-48 items-center gap-1.5 whitespace-nowrap rounded-kit-sm pl-2.5 text-body text-fg-subtle transition-colors duration-fast hover:text-fg aria-selected:font-medium aria-selected:text-fg [&_svg]:size-3.5 ${tab.closable && props.onClose ? "pr-1" : "pr-2.5"}`}
						>
							{tab.icon}
							<span class="min-w-0 truncate">{tab.label}</span>
						</button>
						<Show when={tab.closable && props.onClose}>
							<button
								type="button"
								aria-label={`Close ${tab.label}`}
								onClick={() => props.onClose?.(tab.id)}
								class="focus-ring mr-1 grid size-5 place-items-center rounded-kit-sm text-fg-faint hover:bg-fill hover:text-fg [&_svg]:size-3"
							>
								<CloseIcon />
							</button>
						</Show>
					</div>
				)}
			</For>
		</div>
	);
}
