import Add01Icon from "@hugeicons/core-free-icons/Add01Icon";
import AlertCircleIcon from "@hugeicons/core-free-icons/AlertCircleIcon";
import ArrowDown01Icon from "@hugeicons/core-free-icons/ArrowDown01Icon";
import Archive01Icon from "@hugeicons/core-free-icons/Archive01Icon";
import ArrowLeft01Icon from "@hugeicons/core-free-icons/ArrowLeft01Icon";
import ArrowRight01Icon from "@hugeicons/core-free-icons/ArrowRight01Icon";
import ArrowUp02Icon from "@hugeicons/core-free-icons/ArrowUp02Icon";
import BubbleChatIcon from "@hugeicons/core-free-icons/BubbleChatIcon";
import Cancel01Icon from "@hugeicons/core-free-icons/Cancel01Icon";
import ComputerTerminal01Icon from "@hugeicons/core-free-icons/ComputerTerminal01Icon";
import Delete02Icon from "@hugeicons/core-free-icons/Delete02Icon";
import File01Icon from "@hugeicons/core-free-icons/File01Icon";
import FlashIcon from "@hugeicons/core-free-icons/FlashIcon";
import Folder01Icon from "@hugeicons/core-free-icons/Folder01Icon";
import GitBranchIcon from "@hugeicons/core-free-icons/GitBranchIcon";
import Globe02Icon from "@hugeicons/core-free-icons/Globe02Icon";
import Idea01Icon from "@hugeicons/core-free-icons/Idea01Icon";
import Loading03Icon from "@hugeicons/core-free-icons/Loading03Icon";
import Logout01Icon from "@hugeicons/core-free-icons/Logout01Icon";
import Menu01Icon from "@hugeicons/core-free-icons/Menu01Icon";
import Mic01Icon from "@hugeicons/core-free-icons/Mic01Icon";
import MoreHorizontalIcon from "@hugeicons/core-free-icons/MoreHorizontalIcon";
import PencilEdit01Icon from "@hugeicons/core-free-icons/PencilEdit01Icon";
import RotateCcwIcon from "@hugeicons/core-free-icons/RotateCcwIcon";
import Search01Icon from "@hugeicons/core-free-icons/Search01Icon";
import Settings01Icon from "@hugeicons/core-free-icons/Settings01Icon";
import SidebarLeftIcon from "@hugeicons/core-free-icons/SidebarLeftIcon";
import StopIcon from "@hugeicons/core-free-icons/StopIcon";
import Tick02Icon from "@hugeicons/core-free-icons/Tick02Icon";
import Wrench01Icon from "@hugeicons/core-free-icons/Wrench01Icon";
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

export function SettingsIcon(props: IconProps): JSX.Element {
	return <Icon icon={Settings01Icon} class={props.class} />;
}

export function RestoreIcon(props: IconProps): JSX.Element {
	return <Icon icon={RotateCcwIcon} class={props.class} />;
}

export function TerminalIcon(props: IconProps): JSX.Element {
	return <Icon icon={ComputerTerminal01Icon} class={props.class} />;
}

export function MicIcon(props: IconProps): JSX.Element {
	return <Icon icon={Mic01Icon} class={props.class} />;
}

export function ChatIcon(props: IconProps): JSX.Element {
	return <Icon icon={BubbleChatIcon} class={props.class} />;
}

export function SendIcon(props: IconProps): JSX.Element {
	return <Icon icon={ArrowUp02Icon} class={props.class} />;
}

export function BackIcon(props: IconProps): JSX.Element {
	return <Icon icon={ArrowLeft01Icon} class={props.class} />;
}

export function StopSquareIcon(props: IconProps): JSX.Element {
	return <Icon icon={StopIcon} class={props.class} />;
}

export function FileIcon(props: IconProps): JSX.Element {
	return <Icon icon={File01Icon} class={props.class} />;
}

export function EditIcon(props: IconProps): JSX.Element {
	return <Icon icon={PencilEdit01Icon} class={props.class} />;
}

export function GlobeIcon(props: IconProps): JSX.Element {
	return <Icon icon={Globe02Icon} class={props.class} />;
}

export function IdeaIcon(props: IconProps): JSX.Element {
	return <Icon icon={Idea01Icon} class={props.class} />;
}

export function ToolIcon(props: IconProps): JSX.Element {
	return <Icon icon={Wrench01Icon} class={props.class} />;
}

export function FolderIcon(props: IconProps): JSX.Element {
	return <Icon icon={Folder01Icon} class={props.class} />;
}

export function ForwardIcon(props: IconProps): JSX.Element {
	return <Icon icon={ArrowRight01Icon} class={props.class} />;
}

export function SidebarIcon(props: IconProps): JSX.Element {
	return <Icon icon={SidebarLeftIcon} class={props.class} />;
}

export function BranchIcon(props: IconProps): JSX.Element {
	return <Icon icon={GitBranchIcon} class={props.class} />;
}

export function ArchiveIcon(props: IconProps): JSX.Element {
	return <Icon icon={Archive01Icon} class={props.class} />;
}

/** A spinning ring for work in progress; still under reduced motion. */
export function SpinnerIcon(props: IconProps): JSX.Element {
	return (
		<Icon icon={Loading03Icon} class={`motion-safe:animate-spin ${props.class ?? "size-4"}`} />
	);
}
