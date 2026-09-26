import type { JSX } from "@solidjs/web";
import { For, Show } from "solid-js";

import { CloseIcon, PlusIcon } from "../ui/icons";

/** Where you are: `Chat / Meta ROAS dropped`, the last part in full ink. */
export function Breadcrumbs(props: {
	items: readonly { label: string; href?: string; icon?: JSX.Element }[];
}): JSX.Element {
	return (
		<nav aria-label="Breadcrumb" class="flex min-w-0 items-center gap-1.5 text-body">
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

export type HeaderTab = { id: string; label: string; href: string; icon?: JSX.Element };

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
}): JSX.Element {
	return (
		<div class="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto [scrollbar-width:none]">
			<For each={props.tabs}>
				{(tab) => (
					<div
						aria-current={props.current === tab.id ? "page" : undefined}
						class="group/tab relative flex h-7 max-w-44 shrink-0 items-center rounded-kit text-body text-fg-subtle transition-colors duration-fast hover:bg-fill hover:text-fg aria-[current=page]:bg-surface aria-[current=page]:text-fg aria-[current=page]:shadow-[0_0_0_1px_var(--kit-line),0_1px_2px_rgb(0_0_0/0.04)] pointer-coarse:h-10"
					>
						<a
							href={tab.href}
							class="focus-ring flex min-w-0 flex-1 items-center gap-1.5 rounded-kit py-1 pr-1 pl-2.5"
						>
							<Show when={tab.icon}>
								<span class="grid size-3.5 shrink-0 place-items-center">{tab.icon}</span>
							</Show>
							<span class="truncate">{tab.label}</span>
						</a>
						<Show when={props.onClose}>
							<button
								type="button"
								aria-label={`Close ${tab.label}`}
								onClick={() => props.onClose?.(tab.id)}
								class="focus-ring mr-1 grid size-4.5 shrink-0 place-items-center rounded-[5px] text-fg-faint opacity-0 hover:bg-fill-strong hover:text-fg group-hover/tab:opacity-100 group-aria-[current=page]/tab:opacity-100 pointer-coarse:opacity-100"
							>
								<CloseIcon class="size-3" />
							</button>
						</Show>
					</div>
				)}
			</For>
			<Show when={props.newHref}>
				<a
					href={props.newHref}
					aria-label={props.newLabel ?? "New tab"}
					title={props.newLabel ?? "New tab"}
					class="focus-ring grid size-7 shrink-0 place-items-center rounded-kit text-fg-subtle hover:bg-fill hover:text-fg pointer-coarse:size-10"
				>
					<PlusIcon class="size-3.5" />
				</a>
			</Show>
		</div>
	);
}
