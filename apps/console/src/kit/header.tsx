import type { JSX } from "@solidjs/web";
import { For, Show } from "solid-js";

import { iconButton } from "./button";
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
};

/**
 * Open things as tabs along the top, as a browser has them: the current one raised, each closable,
 * a plus for a new one. Scrolls sideways when there are many.
 */
export function HeaderTabs(props: {
	tabs: readonly HeaderTab[];
	current: string | null;
	onClose?: (id: string) => void;
	newHref?: string;
	newLabel?: string;
	/** In place of the plus link: a button or a menu that opens the new tab. */
	newAction?: JSX.Element;
}): JSX.Element {
	return (
		<div class="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto [scrollbar-width:none]">
			<For each={props.tabs}>
				{(tab) => (
					<div
						aria-current={props.current === tab.id ? "page" : undefined}
						class="group/tab relative flex h-kit-control-sm min-w-0 max-w-60 shrink items-center rounded-kit text-body text-fg-muted transition-colors duration-fast hover:bg-fill hover:text-fg aria-[current=page]:bg-selection aria-[current=page]:text-fg pointer-coarse:h-10"
					>
						<a
							href={tab.href}
							class="focus-ring flex min-w-0 flex-1 items-center gap-2 rounded-kit py-1 pr-2.5 pl-2.5"
						>
							<Show when={tab.icon}>
								<span class="grid size-4 shrink-0 place-items-center text-fg-muted [&_svg]:size-3.5">
									{tab.icon}
								</span>
							</Show>
							<span class={`truncate ${tab.running ? "thread-running" : ""}`}>{tab.label}</span>
							<Show when={tab.badge}>
								<span class="max-w-24 shrink-0 truncate rounded-kit-sm bg-fill-strong px-1 text-caption text-fg-subtle">
									{tab.badge}
								</span>
							</Show>
						</a>
						<Show when={props.onClose && tab.closable !== false}>
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
