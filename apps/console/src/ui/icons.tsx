import Add01Icon from "@hugeicons/core-free-icons/Add01Icon";
import AlertCircleIcon from "@hugeicons/core-free-icons/AlertCircleIcon";
import ArrowDown01Icon from "@hugeicons/core-free-icons/ArrowDown01Icon";
import Cancel01Icon from "@hugeicons/core-free-icons/Cancel01Icon";
import Delete02Icon from "@hugeicons/core-free-icons/Delete02Icon";
import FlashIcon from "@hugeicons/core-free-icons/FlashIcon";
import Logout01Icon from "@hugeicons/core-free-icons/Logout01Icon";
import Menu01Icon from "@hugeicons/core-free-icons/Menu01Icon";
import MoreHorizontalIcon from "@hugeicons/core-free-icons/MoreHorizontalIcon";
import Search01Icon from "@hugeicons/core-free-icons/Search01Icon";
import Tick02Icon from "@hugeicons/core-free-icons/Tick02Icon";
import type { JSX } from "@solidjs/web";

/** An icon from `@hugeicons/core-free-icons`: a list of `[tag, attributes]` SVG children. */
export type IconData = readonly (readonly [string, { readonly [key: string]: string | number }])[];

// The console draws every glyph at one stroke weight, like the rest of the product chrome.
const STROKE_WIDTH = 1.75;

function kebab(name: string): string {
	return name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

function escape(value: string): string {
	return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

/**
 * Serialise icon data to SVG markup. The data is static and comes from the icon package, never
 * from users, so writing it as markup is safe and avoids a per-node renderer.
 */
function markup(icon: IconData, strokeWidth: number): string {
	return icon
		.map(([tag, attrs]) => {
			const attributes = Object.entries(attrs)
				.filter(([name]) => name !== "key")
				.map(([name, value]) =>
					name === "strokeWidth"
						? `stroke-width="${strokeWidth}"`
						: `${kebab(name)}="${escape(String(value))}"`,
				)
				.join(" ");
			return `<${tag} ${attributes}/>`;
		})
		.join("");
}

/**
 * Renders a Hugeicons glyph in `currentColor`, so it takes its label's ink. Decorative: the
 * control carrying the icon owns the accessible name. Default size fits a 28px control.
 */
export function Icon(props: { icon: IconData; class?: string; strokeWidth?: number }): JSX.Element {
	return (
		<svg
			class={props.class ?? "size-4"}
			viewBox="0 0 24 24"
			fill="none"
			aria-hidden="true"
			innerHTML={markup(props.icon, props.strokeWidth ?? STROKE_WIDTH)}
		/>
	);
}

type IconProps = { class?: string };

export function MenuIcon(props: IconProps): JSX.Element {
	return <Icon icon={Menu01Icon} class={props.class} />;
}

export function CloseIcon(props: IconProps): JSX.Element {
	return <Icon icon={Cancel01Icon} class={props.class} />;
}

export function PlusIcon(props: IconProps): JSX.Element {
	return <Icon icon={Add01Icon} class={props.class} />;
}

export function SearchIcon(props: IconProps): JSX.Element {
	return <Icon icon={Search01Icon} class={props.class} />;
}

export function ChevronDownIcon(props: IconProps): JSX.Element {
	return <Icon icon={ArrowDown01Icon} class={props.class} />;
}

export function CheckIcon(props: IconProps): JSX.Element {
	return <Icon icon={Tick02Icon} class={props.class} />;
}

export function AlertIcon(props: IconProps): JSX.Element {
	return <Icon icon={AlertCircleIcon} class={props.class} />;
}

export function BoardIcon(props: IconProps): JSX.Element {
	return <Icon icon={FlashIcon} class={props.class} />;
}

export function SignOutIcon(props: IconProps): JSX.Element {
	return <Icon icon={Logout01Icon} class={props.class} />;
}

export function TrashIcon(props: IconProps): JSX.Element {
	return <Icon icon={Delete02Icon} class={props.class} />;
}

export function MoreIcon(props: IconProps): JSX.Element {
	return <Icon icon={MoreHorizontalIcon} class={props.class} />;
}
