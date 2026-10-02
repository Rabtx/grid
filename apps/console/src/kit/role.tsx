import BookOpen01Icon from "@hugeicons/core-free-icons/BookOpen01Icon";
import Bug01Icon from "@hugeicons/core-free-icons/Bug01Icon";
import Note01Icon from "@hugeicons/core-free-icons/Note01Icon";
import PaintBoardIcon from "@hugeicons/core-free-icons/PaintBoardIcon";
import Rocket01Icon from "@hugeicons/core-free-icons/Rocket01Icon";
import SourceCodeIcon from "@hugeicons/core-free-icons/SourceCodeIcon";
import TestTube01Icon from "@hugeicons/core-free-icons/TestTube01Icon";
import ViewIcon from "@hugeicons/core-free-icons/ViewIcon";
import type { JSX } from "@solidjs/web";
import { For, Show } from "solid-js";

import { tap } from "./haptics";
import { CheckIcon, Icon, type IconData, UserIcon } from "./icons";

/** The glyphs a role can wear, each with its own tint (Figma 11 · Agent roles). */
export const ROLE_ICONS = [
	"code",
	"review",
	"design",
	"docs",
	"test",
	"ship",
	"research",
	"bug",
] as const;

export type RoleIcon = (typeof ROLE_ICONS)[number];

const GLYPH: Record<RoleIcon, { icon: IconData; tint: string; label: string }> = {
	code: { icon: SourceCodeIcon, tint: "tint-accent", label: "Code" },
	review: { icon: ViewIcon, tint: "tint-violet", label: "Review" },
	design: { icon: PaintBoardIcon, tint: "tint-warning", label: "Design" },
	docs: { icon: Note01Icon, tint: "tint-success", label: "Docs" },
	test: { icon: TestTube01Icon, tint: "tint-accent", label: "Tests" },
	ship: { icon: Rocket01Icon, tint: "tint-danger", label: "Ship" },
	research: { icon: BookOpen01Icon, tint: "tint-violet", label: "Research" },
	bug: { icon: Bug01Icon, tint: "tint-danger", label: "Bugs" },
};

const glyph = (icon: string) => GLYPH[icon as RoleIcon] ?? GLYPH.code;

/** A role's glyph on its tinted tile: `sm` in the composer's chip, `md` in lists, `lg` on phones. */
export function RoleMark(props: { icon: string; size?: "sm" | "md" | "lg" }): JSX.Element {
	const size = () =>
		props.size === "sm"
			? "size-5 rounded-kit-sm [&_svg]:size-3.5"
			: props.size === "lg"
				? "size-11 rounded-kit-lg [&_svg]:size-5"
				: "size-8 rounded-kit-md [&_svg]:size-4";
	return (
		<span
			aria-hidden="true"
			class={`grid shrink-0 place-items-center ${glyph(props.icon).tint} ${size()}`}
		>
			<Icon icon={glyph(props.icon).icon} size="sm" />
		</span>
	);
}

/** Pick a role's glyph: its tiles in a row, the chosen one ringed. */
export function RoleIconChoices(props: {
	label: string;
	value: string;
	onChange: (icon: RoleIcon) => void;
}): JSX.Element {
	return (
		<fieldset class="flex min-w-0 flex-wrap gap-1.5 border-0 p-0">
			<legend class="sr-only">{props.label}</legend>
			<For each={ROLE_ICONS}>
				{(icon) => (
					<button
						type="button"
						aria-label={GLYPH[icon].label}
						title={GLYPH[icon].label}
						aria-pressed={props.value === icon ? "true" : "false"}
						onClick={() => {
							tap();
							props.onChange(icon);
						}}
						class="focus-ring rounded-kit-lg p-0.5 opacity-60 transition-opacity duration-fast hover:opacity-100 aria-pressed:opacity-100 aria-pressed:ring-2 aria-pressed:ring-accent"
					>
						<RoleMark icon={icon} />
					</button>
				)}
			</For>
		</fieldset>
	);
}

/**
 * A role in the team list (Figma 11 · Agent roles, Role menu): its tile, its name, and under it
 * the agent's logo with the agent, model and effort it runs. The chosen one is lit — checked from
 * md, a filled radio on phones.
 */
export function TeamRow(props: {
	icon: string;
	name: string;
	/** The line under the name: the agent's logo, then agent · model · effort. */
	detail: JSX.Element;
	selected: boolean;
	/** Cannot be picked here (its agent is not on this machine). */
	disabled?: boolean;
	onPick: () => void;
}): JSX.Element {
	return (
		<button
			type="button"
			// oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- a radio input cannot hold a tile and two lines
			role="radio"
			disabled={props.disabled}
			aria-checked={props.selected ? "true" : "false"}
			onClick={() => props.onPick()}
			class="focus-ring flex min-h-14 w-full min-w-0 items-center gap-3 rounded-kit-lg px-2 py-2 text-left transition-colors duration-fast hover:bg-fill aria-checked:bg-fill disabled:pointer-events-none disabled:opacity-50 pointer-coarse:min-h-16"
		>
			<RoleMark icon={props.icon} size="md" />
			<span class="flex min-w-0 flex-1 flex-col gap-0.5">
				<span class="truncate text-body-lg text-fg">{props.name}</span>
				<span class="flex min-w-0 items-center gap-1.5 text-caption text-fg-subtle">
					{props.detail}
				</span>
			</span>
			<Show when={props.selected}>
				<CheckIcon size="sm" class="hidden shrink-0 text-fg md:block" />
			</Show>
			<span
				aria-hidden="true"
				class={`grid size-5 shrink-0 place-items-center rounded-full md:hidden ${props.selected ? "bg-accent" : "ring-line-strong"}`}
			>
				<Show when={props.selected}>
					<span class="size-2 rounded-full bg-white" />
				</Show>
			</span>
		</button>
	);
}

/**
 * The composer's role control: the role's chip and, joined to it, a button for its settings
 * (Figma 11 · Agent roles, Composer). Both are triggers the caller supplies.
 */
export function RoleChipGroup(props: { children: JSX.Element }): JSX.Element {
	return (
		<span class="surface-outline flex h-7 shrink-0 items-center rounded-full pointer-coarse:h-10">
			{props.children}
		</span>
	);
}

/** A half of the role chip group: the role (with its name), or its settings (an icon). */
export const ROLE_CHIP =
	"focus-ring flex h-full min-w-0 max-w-48 items-center gap-1.5 rounded-l-full pr-1.5 pl-1 text-body text-fg transition-colors duration-fast hover:bg-fill aria-expanded:bg-fill-strong pointer-coarse:pl-1.5";
export const ROLE_CHIP_ICON =
	"focus-ring grid h-full shrink-0 place-items-center rounded-r-full border-line border-l px-2 text-fg-muted transition-colors duration-fast hover:bg-fill hover:text-fg aria-expanded:bg-fill-strong pointer-coarse:px-3 [&_svg]:size-3.5";

/** Where the role's tile would be when there is none: a quiet person glyph. */
export function NoRoleMark(props: { size?: "sm" | "md" }): JSX.Element {
	return (
		<span
			aria-hidden="true"
			class={`grid shrink-0 place-items-center rounded-full text-fg-subtle ${props.size === "sm" ? "size-5 [&_svg]:size-3.5" : "size-8 [&_svg]:size-4"}`}
		>
			<UserIcon />
		</span>
	);
}

/** Working without a role, at the end of the team list. */
export function NoRoleRow(props: { label: string; onPick: () => void }): JSX.Element {
	return (
		<button
			type="button"
			onClick={() => props.onPick()}
			class="focus-ring flex h-10 items-center gap-3 rounded-kit-lg px-2 text-left text-body text-fg-muted transition-colors duration-fast hover:bg-fill hover:text-fg pointer-coarse:h-12"
		>
			<NoRoleMark />
			{props.label}
		</button>
	);
}

/**
 * The buttons along the bottom of a role panel: two full buttons side by side on phones (Figma's
 * sheets), compact ones on the right from md. `quiet` is the secondary one.
 */
export const PANEL_ACTION = {
	quiet: "flex-1 md:h-8 md:flex-none md:px-2.5 md:text-caption md:shadow-none",
	main: "flex-1 md:h-8 md:flex-none md:px-3",
	/** A primary on phones that is a plain row button from md ("New role"). */
	add: "flex-1 md:h-8 md:flex-none md:bg-transparent md:px-2.5 md:text-fg md:shadow-none md:hover:bg-fill",
} as const;
