import type { JSX } from "@solidjs/web";
import { For, Show } from "solid-js";

import { SearchIcon } from "./icons";

import { Kbd } from "./badge";
import { type TabOption, Tabs } from "./tabs";

export type PaletteItem = { id: string; icon?: JSX.Element; label: string; hint?: string };

/**
 * The command palette's face: a search field, optional tabs, results on the left and the
 * highlighted one's detail on the right (desktop), and key hints along the bottom. The shell
 * owns the query, the results and the dialog around it.
 */
export function Palette<T extends string>(props: {
	query: string;
	onQuery: (query: string) => void;
	placeholder?: string;
	tabs?: readonly TabOption<T>[];
	tab?: T;
	onTab?: (tab: T) => void;
	groupLabel?: string;
	items: readonly PaletteItem[];
	active: string | null;
	onActive: (id: string) => void;
	onPick: (id: string) => void;
	detail?: JSX.Element;
	footer?: JSX.Element;
}): JSX.Element {
	return (
		<div class="flex max-h-[70dvh] flex-col">
			<div class="flex h-12 shrink-0 items-center gap-2.5 px-4">
				<SearchIcon class="size-4 shrink-0 text-fg-subtle" />
				<input
					type="search"
					aria-label="Search"
					placeholder={props.placeholder ?? "Search anything…"}
					value={props.query}
					onInput={(event) => props.onQuery(event.currentTarget.value)}
					class="min-w-0 flex-1 bg-transparent text-body-lg text-fg outline-none placeholder:text-fg-faint"
				/>
			</div>
			<Show when={props.tabs && props.tab && props.onTab}>
				<div class="border-line border-b px-4">
					<Tabs
						label="Search in"
						options={props.tabs ?? []}
						value={props.tab as T}
						onChange={(value) => props.onTab?.(value)}
					/>
				</div>
			</Show>
			<div class="flex min-h-0 flex-1 border-line border-t">
				<div class="min-h-0 flex-1 overflow-y-auto p-1.5 md:max-w-[50%] md:border-line md:border-r">
					<Show when={props.groupLabel}>
						<p class="px-2 pt-1 pb-1.5 text-caption text-fg-subtle">{props.groupLabel}</p>
					</Show>
					<For each={props.items}>
						{(item) => (
							<button
								type="button"
								aria-current={props.active === item.id ? "true" : undefined}
								onMouseEnter={() => props.onActive(item.id)}
								onClick={() => props.onPick(item.id)}
								class="flex h-kit-row w-full items-center gap-2.5 rounded-kit px-2 text-left text-body text-fg aria-[current=true]:bg-fill-strong pointer-coarse:h-12"
							>
								<Show when={item.icon}>
									<span class="grid size-4 shrink-0 place-items-center text-fg-subtle">
										{item.icon}
									</span>
								</Show>
								<span class="truncate">{item.label}</span>
								<Show when={item.hint}>
									<span class="truncate text-caption text-fg-faint">{item.hint}</span>
								</Show>
							</button>
						)}
					</For>
				</div>
				<Show when={props.detail}>
					<div class="hidden min-h-0 flex-1 overflow-y-auto p-4 md:block">{props.detail}</div>
				</Show>
			</div>
			<div class="flex h-11 shrink-0 items-center gap-2 border-line border-t bg-surface-sunken px-3 text-caption text-fg-subtle pointer-coarse:hidden">
				<Kbd>↑</Kbd>
				<Kbd>↓</Kbd>
				<span>Navigate</span>
				<Kbd>↵</Kbd>
				<span>Open</span>
				<span class="flex-1" />
				{props.footer}
			</div>
		</div>
	);
}
