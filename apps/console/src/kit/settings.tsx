import type { JSX } from "@solidjs/web";
import { createSignal, For, omit, Show } from "solid-js";

import { type FeedTone, ToneTile } from "./feed";
import { CheckIcon, ChevronRightIcon, CopyIcon } from "./icons";

/** A titled block of settings: a heading and description, then its rows in one card. */
export function SettingsGroup(props: {
	title: string;
	description?: string;
	action?: JSX.Element;
	/** Its content as it is, not in one card (a grid of cards). */
	plain?: boolean;
	children: JSX.Element;
}): JSX.Element {
	return (
		<section class="flex flex-col gap-2 md:gap-3">
			<div class="flex items-end justify-between gap-3">
				<div class="min-w-0">
					<h2 class="font-medium text-body-lg text-fg max-md:px-1 max-md:font-normal max-md:text-caption max-md:text-fg-subtle">
						{props.title}
					</h2>
					<Show when={props.description}>
						<p class="text-caption text-fg-subtle max-md:hidden">{props.description}</p>
					</Show>
				</div>
				{props.action}
			</div>
			<Show
				when={props.plain}
				fallback={
					<div class="divide-y divide-line rounded-kit-lg bg-surface ring-line">
						{props.children}
					</div>
				}
			>
				{props.children}
			</Show>
		</section>
	);
}

/**
 * One setting: what it is and what it does on the left, its control on the right (under it on
 * phones). A leading glyph or mark goes before the words (a session's device, an event's icon).
 */
export function SettingsRow(props: {
	label: JSX.Element;
	description?: JSX.Element;
	children?: JSX.Element;
	/** Keep the control beside the text even on phones (a switch). */
	inline?: boolean;
	leading?: JSX.Element;
	/** Before the words as it is, without a tile (a person's avatar, an agent's logo). */
	mark?: JSX.Element;
	/** The label in the danger colour (Delete workspace). */
	danger?: boolean;
	/** The row opens a page; its control (a switch) still works on its own. */
	href?: string;
}): JSX.Element {
	return (
		<div
			class={`relative flex min-h-12 gap-3 px-4 py-2.5 md:min-h-16 md:py-3 ${props.inline ? "items-center" : "flex-col md:flex-row md:items-center"} ${props.href ? "transition-colors duration-fast hover:bg-fill/40" : ""}`}
		>
			<div class="flex min-w-0 flex-1 items-center gap-3">
				<Show when={props.mark}>
					<span class="grid size-8 shrink-0 place-items-center [&_img]:size-5 [&_svg]:size-5">
						{props.mark}
					</span>
				</Show>
				<Show when={props.leading}>
					<span class="grid size-8 shrink-0 place-items-center rounded-kit bg-fill text-fg-muted [&_svg]:size-4">
						{props.leading}
					</span>
				</Show>
				<div class="min-w-0 flex-1">
					<p class={`text-body-lg md:text-body ${props.danger ? "text-danger" : "text-fg"}`}>
						<Show when={props.href} fallback={props.label}>
							{(href) => (
								<a
									href={href()}
									class="focus-ring rounded-kit-xs after:absolute after:inset-0 after:content-['']"
								>
									{props.label}
								</a>
							)}
						</Show>
					</p>
					<Show when={props.description}>
						<p class="text-caption text-fg-subtle">{props.description}</p>
					</Show>
				</div>
			</div>
			<Show when={props.children}>
				<div class="relative z-10 flex shrink-0 items-center gap-2">{props.children}</div>
			</Show>
		</div>
	);
}

/**
 * A setting that opens somewhere (phones): its name and a line, what it is set to, and a chevron.
 * A leading glyph goes first (an event's icon).
 */
export function SettingsLinkRow(props: {
	label: string;
	description?: string;
	value?: JSX.Element;
	leading?: JSX.Element;
	/** Before the words as it is, without a tile (a service's own tile). */
	mark?: JSX.Element;
	onClick: () => void;
}): JSX.Element {
	return (
		<button
			type="button"
			onClick={() => props.onClick()}
			class="focus-ring flex min-h-12 w-full min-w-0 items-center gap-3 px-4 py-2.5 text-left active:bg-fill"
		>
			<Show when={props.leading}>
				<span class="grid size-8 shrink-0 place-items-center rounded-kit bg-fill text-fg-muted [&_svg]:size-4">
					{props.leading}
				</span>
			</Show>
			<Show when={props.mark}>
				<span class="grid size-8 shrink-0 place-items-center">{props.mark}</span>
			</Show>
			<span class="min-w-0 flex-1">
				<span class="block truncate text-body-lg text-fg">{props.label}</span>
				<Show when={props.description}>
					<span class="block truncate text-caption text-fg-subtle">{props.description}</span>
				</Show>
			</span>
			<Show when={props.value}>
				<span class="min-w-0 max-w-1/2 shrink-0 truncate text-body text-fg-subtle">
					{props.value}
				</span>
			</Show>
			<ChevronRightIcon class="size-4 shrink-0 text-fg-faint" />
		</button>
	);
}

/**
 * Inviting people (Figma Members): who (emails), as what, and send; a line under it with how many
 * there are and another way in. Side by side on desktop, stacked on phones.
 */
export function InviteCard(props: {
	field: JSX.Element;
	role: JSX.Element;
	action: JSX.Element;
	footer?: JSX.Element;
}): JSX.Element {
	return (
		<section aria-label="Invite people" class="overflow-hidden rounded-kit-lg bg-surface ring-line">
			<div class="flex flex-col gap-2 p-3 md:flex-row md:items-center">
				<div class="min-w-0 flex-1 [&_label]:md:w-full">{props.field}</div>
				<div class="flex items-center gap-2 [&>*:last-child]:max-md:flex-1">
					{props.role}
					{props.action}
				</div>
			</div>
			<Show when={props.footer}>
				<div class="flex items-center justify-between gap-3 border-line border-t px-4 py-2.5 text-caption text-fg-subtle max-md:hidden">
					{props.footer}
				</div>
			</Show>
		</section>
	);
}

/** A settings page's column (720px on desktop) with its title and what it covers. */
export function SettingsColumn(props: {
	title: string;
	description?: string;
	children: JSX.Element;
}): JSX.Element {
	return (
		<div class="relative min-h-0 flex-1 overflow-y-auto overscroll-contain">
			<div class="mx-auto flex w-full max-w-180 flex-col gap-4 px-4 pt-2 pb-12 md:gap-8 md:pt-12">
				<header class="flex flex-col gap-1 max-md:hidden">
					<h1 class="font-medium text-title text-fg">{props.title}</h1>
					<Show when={props.description}>
						<p class="text-body text-fg-muted">{props.description}</p>
					</Show>
				</header>
				{props.children}
			</div>
		</div>
	);
}

/** Who someone is at the top of their profile: their mark, name and a line, and an action. */
export function IdentityCard(props: {
	mark: JSX.Element;
	name: string;
	meta: string;
	action?: JSX.Element;
}): JSX.Element {
	return (
		<div class="flex min-w-0 items-center gap-3 rounded-kit-lg bg-surface p-3.5 ring-line md:p-4">
			<span class="shrink-0">{props.mark}</span>
			<div class="min-w-0 flex-1">
				<p class="truncate text-body-lg text-fg">{props.name}</p>
				<p class="truncate text-caption text-fg-subtle">{props.meta}</p>
			</div>
			<Show when={props.action}>
				<span class="shrink-0">{props.action}</span>
			</Show>
		</div>
	);
}

/** A text field drawn as a filled pill with a glyph, for a settings row's value. */
export function PillInput(
	props: Omit<JSX.InputHTMLAttributes<HTMLInputElement>, "class"> & { icon?: JSX.Element },
): JSX.Element {
	const rest = omit(props, "icon");
	return (
		<label class="flex h-kit-control w-full min-w-0 items-center gap-2 rounded-full bg-fill px-3.5 text-fg-subtle focus-within:ring-2 focus-within:ring-accent/40 md:w-75 [&_svg]:size-3.5 [&_svg]:shrink-0">
			{props.icon}
			<input
				{...rest}
				class="h-full min-w-0 flex-1 bg-transparent text-body text-fg outline-none placeholder:text-fg-faint"
			/>
		</label>
	);
}

/** A value shown in the code face (Commit as, an address). */
export function MonoValue(props: { children: JSX.Element }): JSX.Element {
	return (
		<span class="min-w-0 truncate font-mono text-caption text-fg-muted">{props.children}</span>
	);
}

/** Which way each kind of update reaches someone: a table of switches, a row per kind. */
export function ChannelTable(props: {
	columns: readonly string[];
	children: JSX.Element;
}): JSX.Element {
	return (
		<div class="overflow-hidden rounded-kit-lg bg-surface ring-line">
			<div class="flex items-center gap-3 border-line border-b px-4 py-2.5 text-caption text-fg-subtle">
				<span class="flex-1">Event</span>
				<For each={props.columns}>
					{(column) => <span class="w-12 text-center md:w-16">{column}</span>}
				</For>
			</div>
			<div class="divide-y divide-line">{props.children}</div>
		</div>
	);
}

/** One kind of update in the table: its glyph and words, then a switch per channel. */
export function ChannelRow(props: {
	icon: JSX.Element;
	label: string;
	description: string;
	children: JSX.Element;
}): JSX.Element {
	return (
		<div class="flex min-h-16 items-center gap-3 px-4 py-3">
			<span class="grid size-8 shrink-0 place-items-center rounded-kit bg-fill text-fg-muted [&_svg]:size-4">
				{props.icon}
			</span>
			<div class="min-w-0 flex-1">
				<p class="text-body text-fg">{props.label}</p>
				<p class="text-caption text-fg-subtle max-md:hidden">{props.description}</p>
			</div>
			{props.children}
		</div>
	);
}

/** A cell of the table: its switch, centred under its column. */
export function ChannelCell(props: { children: JSX.Element }): JSX.Element {
	return <span class="grid w-12 shrink-0 place-items-center md:w-16">{props.children}</span>;
}

/**
 * What each role may do (Figma 24 · Roles): a permission per row, a role per column, a tick or a
 * dash in each cell. Wide on desktop; scrolls sideways when there are more roles than room.
 */
export function PermissionMatrix(props: {
	columns: readonly string[];
	children: JSX.Element;
}): JSX.Element {
	return (
		<div class="overflow-x-auto rounded-kit-lg bg-surface ring-line">
			<div class="min-w-max">
				<div class="flex h-9 items-center border-line border-b px-4 text-caption text-fg-subtle">
					<span class="min-w-40 flex-1">Permission</span>
					<For each={props.columns}>
						{(column) => <span class="w-23 shrink-0 truncate px-1 text-center">{column}</span>}
					</For>
				</div>
				<div class="divide-y divide-line">{props.children}</div>
			</div>
		</div>
	);
}

/** One permission across the roles. */
export function PermissionRow(props: { label: string; children: JSX.Element }): JSX.Element {
	return (
		<div class="flex h-12 items-center px-4">
			<span class="min-w-40 flex-1 truncate text-body text-fg">{props.label}</span>
			{props.children}
		</div>
	);
}

/** Whether a role may: a tick or a dash, a button when it can be changed. */
export function PermissionCell(props: {
	on: boolean;
	/** "Member: Merge pull requests", for screen readers and the tooltip. */
	label: string;
	onToggle?: () => void;
}): JSX.Element {
	const mark = () =>
		props.on ? (
			<CheckIcon class="size-3.5 text-success" />
		) : (
			<span class="h-px w-2.5 bg-line-strong" />
		);
	return (
		<span class="grid w-23 shrink-0 place-items-center">
			<Show
				when={props.onToggle}
				fallback={
					<span class="grid size-7 place-items-center">
						<span aria-hidden="true" class="grid place-items-center">
							{mark()}
						</span>
						<span class="sr-only">{`${props.label}: ${props.on ? "yes" : "no"}`}</span>
					</span>
				}
			>
				<button
					type="button"
					role="switch"
					aria-checked={props.on ? "true" : "false"}
					aria-label={props.label}
					data-tooltip={props.label}
					onClick={() => props.onToggle?.()}
					class="focus-ring grid size-7 place-items-center rounded-kit transition-colors duration-fast hover:bg-fill-strong"
				>
					{mark()}
				</button>
			</Show>
		</span>
	);
}

/** The theme as three pictures of the app: light, dark, and the two split for System. */
export function ThemeCards<T extends string>(props: {
	label: string;
	value: T;
	onChange: (value: T) => void;
	options: readonly { value: T; label: string; look: "light" | "dark" | "split" }[];
}): JSX.Element {
	return (
		<fieldset class="grid grid-cols-3 gap-2 rounded-kit-lg border-0 bg-surface p-3 ring-line md:gap-3 md:p-4">
			<legend class="sr-only">{props.label}</legend>
			<For each={props.options}>
				{(option) => (
					<button
						type="button"
						aria-pressed={props.value === option.value ? "true" : "false"}
						onClick={() => props.onChange(option.value)}
						class="group/theme focus-ring flex min-w-0 flex-col gap-2 rounded-kit-lg text-left"
					>
						<ThemePicture look={option.look} />
						<span class="flex items-center gap-2 px-0.5 text-body text-fg-muted group-aria-pressed/theme:text-fg">
							<span class="grid size-3.5 place-items-center rounded-full ring-line-strong group-aria-pressed/theme:bg-accent group-aria-pressed/theme:ring-0">
								<span class="size-1.5 rounded-full bg-white opacity-0 group-aria-pressed/theme:opacity-100" />
							</span>
							{option.label}
						</span>
					</button>
				)}
			</For>
		</fieldset>
	);
}

/** A small drawing of the app in a theme: a sidebar, a pane with lines, and a primary button. */
function ThemePicture(props: { look: "light" | "dark" | "split" }): JSX.Element {
	const pane = (dark: boolean) => (
		<span
			class={`flex h-full flex-1 gap-2 p-2 ${dark ? "bg-neutral-900" : "bg-white"} max-md:p-1.5`}
		>
			<span class="flex w-1/4 flex-col gap-1.5 pt-1">
				<span class={`h-1 rounded-full ${dark ? "bg-neutral-700" : "bg-neutral-200"}`} />
				<span class={`h-1 rounded-full ${dark ? "bg-neutral-600" : "bg-neutral-400"}`} />
				<span class={`h-1 rounded-full ${dark ? "bg-neutral-700" : "bg-neutral-200"}`} />
			</span>
			<span
				class={`relative flex flex-1 flex-col gap-1.5 rounded-kit-sm p-1.5 ${dark ? "bg-neutral-800 ring-1 ring-neutral-700" : "bg-white ring-1 ring-neutral-200"}`}
			>
				<span class={`h-1 w-1/2 rounded-full ${dark ? "bg-neutral-300" : "bg-neutral-800"}`} />
				<span class={`h-1 w-4/5 rounded-full ${dark ? "bg-neutral-700" : "bg-neutral-200"}`} />
				<span class={`h-1 w-3/5 rounded-full ${dark ? "bg-neutral-700" : "bg-neutral-200"}`} />
				<span class="absolute right-1.5 bottom-1.5 h-2 w-1/3 rounded-full bg-accent" />
			</span>
		</span>
	);
	return (
		<span class="flex aspect-[16/10] w-full overflow-hidden rounded-kit-lg ring-line group-aria-pressed/theme:ring-2 group-aria-pressed/theme:ring-accent">
			<Show when={props.look === "split"} fallback={pane(props.look === "dark")}>
				<span class="relative flex h-full w-full">
					<span class="absolute inset-0 flex [clip-path:inset(0_50%_0_0)]">{pane(false)}</span>
					<span class="absolute inset-0 flex [clip-path:inset(0_0_0_50%)]">{pane(true)}</span>
				</span>
			</Show>
		</span>
	);
}

/** On phones, who is signed in at the top of the settings list. */
export function SettingsProfileLink(props: {
	href: string;
	mark: JSX.Element;
	name: string;
	meta: string;
}): JSX.Element {
	return (
		<a
			href={props.href}
			class="focus-ring flex min-w-0 items-center gap-3 rounded-kit-lg bg-surface p-3.5 ring-line"
		>
			<span class="shrink-0">{props.mark}</span>
			<span class="flex min-w-0 flex-1 flex-col">
				<span class="truncate text-body-lg text-fg">{props.name}</span>
				<span class="truncate text-caption text-fg-subtle">{props.meta}</span>
			</span>
			<ChevronRightIcon class="size-4 shrink-0 text-fg-faint" />
		</a>
	);
}

/** A group of pages on the phone's settings list, under its caption. */
export function SettingsLinkGroup(props: { label: string; children: JSX.Element }): JSX.Element {
	return (
		<section class="flex flex-col gap-2">
			<h2 class="px-1 font-normal text-caption text-fg-subtle">{props.label}</h2>
			<div class="divide-y divide-line overflow-hidden rounded-kit-lg bg-surface ring-line">
				{props.children}
			</div>
		</section>
	);
}

/** One settings page on the phone's list: its tinted glyph, name, what it says now, and a chevron. */
export function SettingsLink(props: {
	href: string;
	icon: JSX.Element;
	tone: FeedTone;
	label: string;
	trailing?: JSX.Element;
}): JSX.Element {
	return (
		<a
			href={props.href}
			class="focus-ring flex min-h-13 min-w-0 items-center gap-3 px-3.5 py-2.5 active:bg-fill"
		>
			<ToneTile tone={props.tone}>{props.icon}</ToneTile>
			<span class="min-w-0 flex-1 truncate text-body-lg text-fg">{props.label}</span>
			<Show when={props.trailing}>
				<span class="flex shrink-0 items-center gap-1 text-body text-fg-subtle [&_img]:size-3.5 [&_svg]:size-3.5">
					{props.trailing}
				</span>
			</Show>
			<ChevronRightIcon class="size-4 shrink-0 text-fg-faint" />
		</a>
	);
}

/** A value to hand on (an invite link, a key): shown read-only with a copy button. */
export function CopyField(props: {
	value: string;
	label: string;
	icon?: JSX.Element;
	mono?: boolean;
}): JSX.Element {
	const [copied, setCopied] = createSignal(false);
	return (
		<div class="flex h-kit-control min-w-0 items-center gap-2 rounded-kit bg-fill pr-1 pl-3 ring-line">
			<Show when={props.icon}>
				<span class="shrink-0 text-fg-subtle">{props.icon}</span>
			</Show>
			<input
				readonly
				aria-label={props.label}
				value={props.value}
				onFocus={(event) => event.currentTarget.select()}
				class={`min-w-0 flex-1 bg-transparent text-body text-fg-muted outline-none ${props.mono ? "font-mono text-caption" : ""}`}
			/>
			<button
				type="button"
				aria-label={copied() ? "Copied" : `Copy ${props.label}`}
				onClick={() => {
					void navigator.clipboard?.writeText(props.value);
					setCopied(true);
					setTimeout(() => setCopied(false), 1400);
				}}
				class="focus-ring grid size-kit-control-sm shrink-0 place-items-center rounded-kit-sm text-fg-subtle hover:bg-fill-strong hover:text-fg"
			>
				<Show when={copied()} fallback={<CopyIcon class="size-4" />}>
					<CheckIcon class="size-4 text-success" />
				</Show>
			</button>
		</div>
	);
}

/** A property of a record: its name on the left (above on phones), its control on the right. */
export function PropertyRow(props: { label: string; children: JSX.Element }): JSX.Element {
	return (
		<div class="flex min-h-9 items-center gap-3">
			<span class="w-24 shrink-0 text-body text-fg-subtle">{props.label}</span>
			<div class="flex min-w-0 flex-1 items-center gap-2">{props.children}</div>
		</div>
	);
}

/** A row of colours to pick one from (Figma Accent color): plain circles, the chosen one ringed. */
export function SwatchRow(props: {
	label: string;
	options: readonly { id: string; swatch: string }[];
	value: string;
	onChange: (id: string) => void;
	/** Spread across the row (a phone's card of swatches). */
	spread?: boolean;
}): JSX.Element {
	return (
		<fieldset
			class={`flex items-center gap-2 border-0 p-0 ${props.spread ? "w-full justify-between px-2 py-1" : ""}`}
		>
			<legend class="sr-only">{props.label}</legend>
			<For each={props.options}>
				{(option) => (
					<button
						type="button"
						aria-label={option.id}
						title={option.id}
						aria-pressed={props.value === option.id ? "true" : "false"}
						onClick={() => props.onChange(option.id)}
						class="focus-ring size-6 rounded-full ring-offset-2 ring-offset-surface aria-pressed:ring-2 aria-pressed:ring-accent pointer-coarse:size-8"
						style={{ background: option.swatch }}
					/>
				)}
			</For>
		</fieldset>
	);
}
