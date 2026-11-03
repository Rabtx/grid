import type { JSX } from "@solidjs/web";
import { createUniqueId, Show } from "solid-js";

/**
 * A thread's details as one card, after T3 Code's thread details card (MIT, © T3 Tools Inc.):
 * small labelled sections divided by hairlines, each a few quiet 32px rows — an icon, what it is,
 * and its value on the right — that fill only under the pointer. Beside the thread when there is
 * room, in a popover (a sheet on phones) when there is not.
 */
export function ThreadDetailsCard(props: {
	/** Inside a popover, which brings its own surface. */
	bare?: boolean;
	children: JSX.Element;
}): JSX.Element {
	return (
		<div
			data-thread-details-card
			class={`flex min-w-0 flex-col ${props.bare ? "" : "max-h-full overflow-y-auto overscroll-contain rounded-kit-2xl border border-line-strong bg-surface-raised shadow-float"}`}
		>
			{props.children}
		</div>
	);
}

/** One section: its heading in small quiet text, actions beside it, then its rows. */
export function ThreadDetailsSection(props: {
	title: string;
	actions?: JSX.Element;
	children: JSX.Element;
}): JSX.Element {
	const heading = `thread-details-${createUniqueId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
	return (
		<section
			aria-labelledby={heading}
			class="border-line border-t px-2 pt-2 pb-2.5 first:border-t-0"
		>
			<div class="mb-1 flex min-h-8 min-w-0 items-center justify-between gap-2 px-2.5">
				<h3
					id={heading}
					class="min-w-0 truncate font-medium text-caption text-fg-subtle select-none"
				>
					{props.title}
				</h3>
				<Show when={props.actions}>
					<div class="flex shrink-0 items-center gap-1">{props.actions}</div>
				</Show>
			</div>
			<div class="flex min-w-0 flex-col">{props.children}</div>
		</section>
	);
}

const ROW =
	"flex h-8 w-full min-w-0 items-center gap-2.5 rounded-control px-2.5 text-left text-body text-fg-muted pointer-coarse:h-10";

/**
 * A row: its icon, its label, and its value (a branch, a count, a diff) on the right. With `href`
 * it is a link and with `onClick` a button, filled under the pointer; otherwise it only reads.
 */
export function ThreadDetailsRow(props: {
	icon: JSX.Element;
	label: JSX.Element;
	value?: JSX.Element;
	/** The full text, when the label is cut short. */
	title?: string;
	href?: string;
	onClick?: () => void;
}): JSX.Element {
	const inner = () => (
		<>
			<span class="flex size-4 shrink-0 items-center justify-center text-fg-subtle [&_svg]:size-4">
				{props.icon}
			</span>
			<span class="min-w-0 flex-1 truncate font-medium">{props.label}</span>
			<Show when={props.value}>
				<span class="ml-auto flex min-w-0 shrink-0 items-center gap-1.5 truncate text-caption text-fg-subtle tabular-nums">
					{props.value}
				</span>
			</Show>
		</>
	);
	const interactive =
		"focus-ring transition-colors duration-fast hover:bg-fill-strong hover:text-fg";
	return (
		<Show
			when={props.href}
			fallback={
				<Show
					when={props.onClick}
					fallback={
						<div class={ROW} title={props.title}>
							{inner()}
						</div>
					}
				>
					<button
						type="button"
						class={`${ROW} ${interactive}`}
						title={props.title}
						onClick={() => props.onClick?.()}
					>
						{inner()}
					</button>
				</Show>
			}
		>
			<a href={props.href} class={`${ROW} ${interactive}`} title={props.title}>
				{inner()}
			</a>
		</Show>
	);
}
