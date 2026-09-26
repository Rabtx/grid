import type { JSX } from "@solidjs/web";
import { For, Show } from "solid-js";

import { CheckIcon, ChevronDownIcon } from "../ui/icons";

import { MENU_ITEM } from "./menu";
import { type Placement, Popover } from "./popover";

export type SelectOption<T extends string> = {
	value: T;
	label: string;
	icon?: JSX.Element;
	description?: string;
	/** A tag after the label: New, Auto, Pro. */
	tag?: JSX.Element;
	disabled?: boolean;
};

export type SelectGroup<T extends string> = { label?: string; options: readonly SelectOption<T>[] };

/**
 * Pick one from a list: a trigger showing the choice, a panel of options with a check on the
 * current one, grouped when there are many. A bottom sheet on phones.
 */
export function Select<T extends string>(props: {
	label: string;
	value: T;
	onChange: (value: T) => void;
	groups: readonly SelectGroup<T>[];
	placement?: Placement;
	width?: string;
	/** `field` looks like an input (forms); `chip` is a quiet toolbar pill (the composer). */
	look?: "field" | "chip";
	disabled?: boolean;
}): JSX.Element {
	const current = () =>
		props.groups.flatMap((group) => group.options).find((option) => option.value === props.value);
	const trigger = () =>
		props.look === "chip"
			? "focus-ring inline-flex h-7 max-w-60 shrink-0 items-center gap-1.5 rounded-kit px-2 text-body-lg text-fg-muted hover:bg-fill hover:text-fg aria-expanded:bg-fill-strong pointer-coarse:h-10"
			: "focus-ring flex h-kit-control w-full items-center gap-2 rounded-kit bg-surface px-3 text-left text-field text-fg shadow-[inset_0_0_0_1px_var(--kit-line-strong)] hover:shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--ink)_20%,transparent)] aria-expanded:shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--ink)_35%,transparent),0_0_0_3px_var(--kit-fill-strong)] disabled:opacity-50";

	return (
		<Popover
			label={props.label}
			placement={props.placement}
			width={props.width ?? "md:w-72"}
			disabled={props.disabled}
			triggerClass={trigger()}
			trigger={
				<>
					<Show when={current()?.icon}>
						<span class="grid size-4 shrink-0 place-items-center">{current()?.icon}</span>
					</Show>
					<span class="min-w-0 flex-1 truncate">{current()?.label ?? props.label}</span>
					<ChevronDownIcon class="size-3.5 shrink-0 text-fg-faint" />
				</>
			}
		>
			{(close) => (
				<div class="flex flex-col p-1.5 md:p-1">
					<For each={props.groups}>
						{(group, index) => (
							<>
								<Show when={index() > 0}>
									<div class="-mx-1.5 my-1 h-px bg-line md:-mx-1" />
								</Show>
								<Show when={group.label}>
									<p class="px-2 pt-1.5 pb-1 text-caption text-fg-subtle">{group.label}</p>
								</Show>
								<For each={group.options}>
									{(option) => (
										<button
											type="button"
											disabled={option.disabled}
											aria-current={option.value === props.value ? "true" : undefined}
											onClick={() => {
												close();
												props.onChange(option.value);
											}}
											class={`${MENU_ITEM} h-auto min-h-kit-row py-1.5 text-fg hover:bg-fill aria-[current=true]:bg-fill-strong`}
										>
											<Show when={option.icon}>
												<span class="grid size-4 shrink-0 place-items-center">{option.icon}</span>
											</Show>
											<span class="flex min-w-0 flex-1 flex-col">
												<span class="flex items-center gap-1.5 truncate">
													{option.label}
													{option.tag}
												</span>
												<Show when={option.description}>
													<span class="truncate text-caption text-fg-subtle">
														{option.description}
													</span>
												</Show>
											</span>
											<Show when={option.value === props.value}>
												<CheckIcon class="size-4 shrink-0" />
											</Show>
										</button>
									)}
								</For>
							</>
						)}
					</For>
				</div>
			)}
		</Popover>
	);
}
