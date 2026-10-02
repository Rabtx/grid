import type { JSX } from "@solidjs/web";
import { createEffect, For, Show } from "solid-js";

import { SearchIcon, SpinnerIcon } from "./icons";

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
	/** Take the keyboard when shown. */
	autofocus?: boolean;
	/** Shown when nothing matches. */
	empty?: string;
}): JSX.Element {
	return (
		<div class="flex max-h-[70dvh] flex-col">
			<div class="flex h-12 shrink-0 items-center gap-2.5 px-4">
				<SearchIcon class="size-4 shrink-0 text-fg-subtle" />
				<input
					ref={(el) => {
						if (props.autofocus) queueMicrotask(() => el.focus());
					}}
					type="search"
					aria-label="Search"
					autocomplete="off"
					spellcheck={false}
					onKeyDown={(event) => {
						// Arrows move through the results, Enter opens the highlighted one.
						const ids = props.items.map((item) => item.id);
						if (ids.length === 0) return;
						const at = Math.max(0, ids.indexOf(props.active ?? ""));
						if (event.key === "ArrowDown") props.onActive(ids[(at + 1) % ids.length]);
						else if (event.key === "ArrowUp")
							props.onActive(ids[(at - 1 + ids.length) % ids.length]);
						else if (event.key === "Enter") props.onPick(props.active ?? ids[0]);
						else return;
						event.preventDefault();
					}}
					placeholder={props.placeholder ?? "Search anything…"}
					value={props.query}
					onInput={(event) => props.onQuery(event.currentTarget.value)}
					class="min-w-0 flex-1 bg-transparent text-field text-fg outline-none placeholder:text-fg-faint"
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
					<Show when={props.items.length === 0}>
						<p class="px-3 py-6 text-center text-body text-fg-subtle">
							{props.empty ?? "Nothing matches."}
						</p>
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

export type AutocompleteItem = {
	id: string;
	icon?: JSX.Element;
	label: string;
	/** Beside the label, quieter: a command's argument and what it does. */
	hint?: string;
	/** Under the label: the folder a file is in. */
	detail?: string;
	/** A heading drawn before the first item of each run, e.g. who offers the command. */
	group?: string;
};

/**
 * Suggestions floating above a text field while you type: @-mentions, / commands. A raised card
 * (Figma 10 · Composer, Mention files): a caption over each run, rows with a tile and a second
 * line, and an ↵ on the one Enter would pick. The field keeps the keyboard (arrows and Enter are
 * the caller's); a pointer picks without blurring the field.
 */
export function AutocompleteList(props: {
	/** The list's id; each item's is `<id>-<index>`, for the field's `aria-activedescendant`. */
	id: string;
	label: string;
	/** The caption over the list when its items carry no group of their own. */
	heading?: string;
	items: readonly AutocompleteItem[];
	active: number;
	onPick: (id: string) => void;
	loading?: boolean;
	empty?: string;
}): JSX.Element {
	let list: HTMLUListElement | undefined;
	createEffect(
		() => props.active,
		(index) => {
			// Groups add heading rows, so match the item by its index rather than its position.
			list?.querySelector(`[data-index="${index}"]`)?.scrollIntoView({ block: "nearest" });
		},
	);
	const heading = (index: number): string | undefined => {
		const item = props.items[index];
		if (!item) return undefined;
		if (item.group) return props.items[index - 1]?.group !== item.group ? item.group : undefined;
		return index === 0 ? props.heading : undefined;
	};
	return (
		<div
			aria-label={props.label}
			class="surface-card absolute right-0 bottom-full left-0 z-30 mb-2 flex max-h-72 flex-col overflow-hidden rounded-kit-2xl md:right-auto md:left-14 md:w-80"
		>
			<Show when={props.loading && props.items.length > 0}>
				<SpinnerIcon size="xs" class="absolute top-3 right-3 animate-spin text-fg-subtle" />
			</Show>
			<Show
				when={props.items.length > 0}
				fallback={
					<p class="flex items-center justify-center gap-2 p-4 text-caption text-fg-subtle">
						<Show when={props.loading} fallback={props.empty ?? "Nothing matches"}>
							<SpinnerIcon size="sm" class="animate-spin" />
							Searching…
						</Show>
					</p>
				}
			>
				<ul
					ref={(el) => {
						list = el;
					}}
					id={props.id}
					// oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- a native select cannot float suggestions while the field keeps the keyboard
					role="listbox"
					aria-label={props.label}
					class="flex min-h-0 flex-1 flex-col overflow-y-auto p-1.5"
				>
					<For each={props.items}>
						{(item, index) => (
							<>
								<Show when={heading(index())}>
									{(text) => (
										<li role="presentation" class="px-2 pt-1.5 pb-1 text-caption text-fg-subtle">
											{text()}
										</li>
									)}
								</Show>
								{/* The field keeps the keyboard, so an option is picked by pointer only. */}
								<li
									data-index={index()}
									id={`${props.id}-${index()}`}
									// oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- an option of the listbox above; a native option cannot hold icons and hints
									role="option"
									aria-label={[item.label, item.hint, item.detail].filter(Boolean).join(", ")}
									aria-selected={index() === props.active ? "true" : "false"}
									onMouseDown={(event) => {
										// Keep the field focused while the pick applies.
										event.preventDefault();
										props.onPick(item.id);
									}}
									class="group/option flex min-h-kit-row w-full cursor-pointer items-center gap-2.5 rounded-kit-lg px-2 py-1.5 text-left text-body text-fg transition-colors duration-fast hover:bg-fill aria-selected:bg-fill pointer-coarse:min-h-12"
								>
									<Show when={item.icon}>
										<span class="grid size-5 shrink-0 place-items-center text-fg-subtle">
											{item.icon}
										</span>
									</Show>
									<span class="flex min-w-0 flex-1 flex-col">
										<span class="flex min-w-0 items-baseline gap-2">
											<span class="truncate">{item.label}</span>
											<Show when={item.hint}>
												<span class="truncate text-caption text-fg-subtle">{item.hint}</span>
											</Show>
										</span>
										<Show when={item.detail}>
											<span class="truncate text-caption text-fg-subtle">{item.detail}</span>
										</Show>
									</span>
									<span
										aria-hidden="true"
										class="hidden shrink-0 group-aria-selected/option:inline-grid pointer-coarse:hidden"
									>
										<Kbd>↵</Kbd>
									</span>
								</li>
							</>
						)}
					</For>
				</ul>
			</Show>
		</div>
	);
}
