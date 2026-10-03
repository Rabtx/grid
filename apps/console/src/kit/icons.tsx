import Add01Icon from "@hugeicons/core-free-icons/Add01Icon";
import AtGlyph from "@hugeicons/core-free-icons/AtIcon";
import CheckmarkSquare02Glyph from "@hugeicons/core-free-icons/CheckmarkSquare02Icon";
import LeftToRightListBulletGlyph from "@hugeicons/core-free-icons/LeftToRightListBulletIcon";
import SparklesGlyph from "@hugeicons/core-free-icons/SparklesIcon";
import ViewGlyph from "@hugeicons/core-free-icons/ViewIcon";
import ViewOffGlyph from "@hugeicons/core-free-icons/ViewOffIcon";
import StarGlyph from "@hugeicons/core-free-icons/StarIcon";
import AlertCircleIcon from "@hugeicons/core-free-icons/AlertCircleIcon";
import Archive01Icon from "@hugeicons/core-free-icons/Archive01Icon";
import ArrowDown01Icon from "@hugeicons/core-free-icons/ArrowDown01Icon";
import ArrowLeft01Icon from "@hugeicons/core-free-icons/ArrowLeft01Icon";
import ArrowRight01Glyph from "@hugeicons/core-free-icons/ArrowRight01Icon";
import ArrowUp02Icon from "@hugeicons/core-free-icons/ArrowUp02Icon";
import ArrowUpRight01Glyph from "@hugeicons/core-free-icons/ArrowUpRight01Icon";
import Attachment01Glyph from "@hugeicons/core-free-icons/Attachment01Icon";
import BubbleChatIcon from "@hugeicons/core-free-icons/BubbleChatIcon";
import Calendar03Glyph from "@hugeicons/core-free-icons/Calendar03Icon";
import Camera01Glyph from "@hugeicons/core-free-icons/Camera01Icon";
import Cancel01Icon from "@hugeicons/core-free-icons/Cancel01Icon";
import CheckmarkCircle02Glyph from "@hugeicons/core-free-icons/CheckmarkCircle02Icon";
import Clock01Glyph from "@hugeicons/core-free-icons/Clock01Icon";
import CodeGlyph from "@hugeicons/core-free-icons/CodeIcon";
import ComputerGlyph from "@hugeicons/core-free-icons/ComputerIcon";
import ComputerTerminal01Icon from "@hugeicons/core-free-icons/ComputerTerminal01Icon";
import Copy01Icon from "@hugeicons/core-free-icons/Copy01Icon";
import Delete02Icon from "@hugeicons/core-free-icons/Delete02Icon";
import File01Icon from "@hugeicons/core-free-icons/File01Icon";
import FilterHorizontalGlyph from "@hugeicons/core-free-icons/FilterHorizontalIcon";
import Flag02Glyph from "@hugeicons/core-free-icons/Flag02Icon";
import FlashIcon from "@hugeicons/core-free-icons/FlashIcon";
import KanbanGlyph from "@hugeicons/core-free-icons/KanbanIcon";
import Shield01Glyph from "@hugeicons/core-free-icons/Shield01Icon";
import LaptopGlyph from "@hugeicons/core-free-icons/LaptopIcon";
import AsteriskGlyph from "@hugeicons/core-free-icons/AsteriskIcon";
import PaintBoardGlyph from "@hugeicons/core-free-icons/PaintBoardIcon";
import Plug01Glyph from "@hugeicons/core-free-icons/Plug01Icon";
import Folder01Icon from "@hugeicons/core-free-icons/Folder01Icon";
import GitBranchIcon from "@hugeicons/core-free-icons/GitBranchIcon";
import GitPullRequestGlyph from "@hugeicons/core-free-icons/GitPullRequestIcon";
import Globe02Icon from "@hugeicons/core-free-icons/Globe02Icon";
import GridViewGlyph from "@hugeicons/core-free-icons/GridViewIcon";
import Home01Glyph from "@hugeicons/core-free-icons/Home01Icon";
import Idea01Icon from "@hugeicons/core-free-icons/Idea01Icon";
import Image01Glyph from "@hugeicons/core-free-icons/Image01Icon";
import InboxGlyph from "@hugeicons/core-free-icons/InboxIcon";
import InformationCircleGlyph from "@hugeicons/core-free-icons/InformationCircleIcon";
import Key01Glyph from "@hugeicons/core-free-icons/Key01Icon";
import Link01Glyph from "@hugeicons/core-free-icons/Link01Icon";
import Loading03Icon from "@hugeicons/core-free-icons/Loading03Icon";
import Logout01Icon from "@hugeicons/core-free-icons/Logout01Icon";
import Menu01Icon from "@hugeicons/core-free-icons/Menu01Icon";
import Mic01Icon from "@hugeicons/core-free-icons/Mic01Icon";
import Moon02Icon from "@hugeicons/core-free-icons/Moon02Icon";
import MoreHorizontalIcon from "@hugeicons/core-free-icons/MoreHorizontalIcon";
import Note01Icon from "@hugeicons/core-free-icons/Note01Icon";
import NoteAddGlyph from "@hugeicons/core-free-icons/NoteAddIcon";
import Notification01Glyph from "@hugeicons/core-free-icons/Notification01Icon";
import PencilEdit01Icon from "@hugeicons/core-free-icons/PencilEdit01Icon";
import Rocket01Glyph from "@hugeicons/core-free-icons/Rocket01Icon";
import RotateCcwIcon from "@hugeicons/core-free-icons/RotateCcwIcon";
import Search01Icon from "@hugeicons/core-free-icons/Search01Icon";
import Settings01Icon from "@hugeicons/core-free-icons/Settings01Icon";
import SidebarLeftIcon from "@hugeicons/core-free-icons/SidebarLeftIcon";
import Sorting05Glyph from "@hugeicons/core-free-icons/Sorting05Icon";
import StopIcon from "@hugeicons/core-free-icons/StopIcon";
import Sun03Icon from "@hugeicons/core-free-icons/Sun03Icon";
import Tag01Glyph from "@hugeicons/core-free-icons/Tag01Icon";
import Tick02Icon from "@hugeicons/core-free-icons/Tick02Icon";
import UnfoldMoreIcon from "@hugeicons/core-free-icons/UnfoldMoreIcon";
import Upload04Glyph from "@hugeicons/core-free-icons/Upload04Icon";
import UserAdd01Glyph from "@hugeicons/core-free-icons/UserAdd01Icon";
import UserGlyph from "@hugeicons/core-free-icons/UserIcon";
import Wrench01Icon from "@hugeicons/core-free-icons/Wrench01Icon";
import type { JSX } from "@solidjs/web";

/** An icon from `@hugeicons/core-free-icons`: a list of `[tag, attributes]` SVG children. */
export type IconData = readonly (readonly [string, { readonly [key: string]: string | number }])[];

// The console draws every glyph at one light stroke weight, like the rest of the product chrome.
const STROKE_WIDTH = 1.5;

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
/** Icon sizes: 12, 14, 16 (the default, beside body text) and 20 (phone bars). */
const SIZE = { xs: "size-3", sm: "size-3.5", md: "size-4", lg: "size-5" } as const;
export type IconSize = keyof typeof SIZE;

export function Icon(props: {
	icon: IconData;
	size?: IconSize;
	class?: string;
	strokeWidth?: number;
}): JSX.Element {
	return (
		<svg
			// A class that sets its own size wins; otherwise the size scale applies and the class adds to it.
			class={`shrink-0 ${props.class?.includes("size-") ? "" : SIZE[props.size ?? "md"]} ${props.class ?? ""}`}
			viewBox="0 0 24 24"
			fill="none"
			aria-hidden="true"
			innerHTML={markup(props.icon, props.strokeWidth ?? STROKE_WIDTH)}
		/>
	);
}

/** Every named icon takes a size from the scale; `class` is for the rare layout need. */
type IconProps = { size?: IconSize; class?: string };

export function MenuIcon(props: IconProps): JSX.Element {
	return <Icon icon={Menu01Icon} size={props.size} class={props.class} />;
}

export function CloseIcon(props: IconProps): JSX.Element {
	return <Icon icon={Cancel01Icon} size={props.size} class={props.class} />;
}

export function PlusIcon(props: IconProps): JSX.Element {
	return <Icon icon={Add01Icon} size={props.size} class={props.class} />;
}

export function SearchIcon(props: IconProps): JSX.Element {
	return <Icon icon={Search01Icon} size={props.size} class={props.class} />;
}

export function ChevronDownIcon(props: IconProps): JSX.Element {
	return <Icon icon={ArrowDown01Icon} size={props.size} class={props.class} />;
}

export function CheckIcon(props: IconProps): JSX.Element {
	return <Icon icon={Tick02Icon} size={props.size} class={props.class} />;
}

export function AlertIcon(props: IconProps): JSX.Element {
	return <Icon icon={AlertCircleIcon} size={props.size} class={props.class} />;
}

/** The board: a kanban, as the Figma rail draws it. */
export function BoardIcon(props: IconProps): JSX.Element {
	return <Icon icon={KanbanGlyph} size={props.size} class={props.class} />;
}

/** Automations: a bolt. */
export function BoltIcon(props: IconProps): JSX.Element {
	return <Icon icon={FlashIcon} size={props.size} class={props.class} />;
}

/** A machine that runs Grid. */
export function LaptopIcon(props: IconProps): JSX.Element {
	return <Icon icon={LaptopGlyph} size={props.size} class={props.class} />;
}

/** Agents. */
export function AsteriskIcon(props: IconProps): JSX.Element {
	return <Icon icon={AsteriskGlyph} size={props.size} class={props.class} />;
}

/** How the app looks: Appearance. */
export function PaletteIcon(props: IconProps): JSX.Element {
	return <Icon icon={PaintBoardGlyph} size={props.size} class={props.class} />;
}

/** A service plugged in: Connectors. */
export function PlugIcon(props: IconProps): JSX.Element {
	return <Icon icon={Plug01Glyph} size={props.size} class={props.class} />;
}

export function SignOutIcon(props: IconProps): JSX.Element {
	return <Icon icon={Logout01Icon} size={props.size} class={props.class} />;
}

export function TrashIcon(props: IconProps): JSX.Element {
	return <Icon icon={Delete02Icon} size={props.size} class={props.class} />;
}

export function MoreIcon(props: IconProps): JSX.Element {
	return <Icon icon={MoreHorizontalIcon} size={props.size} class={props.class} />;
}

export function SettingsIcon(props: IconProps): JSX.Element {
	return <Icon icon={Settings01Icon} size={props.size} class={props.class} />;
}

export function RestoreIcon(props: IconProps): JSX.Element {
	return <Icon icon={RotateCcwIcon} size={props.size} class={props.class} />;
}

export function TerminalIcon(props: IconProps): JSX.Element {
	return <Icon icon={ComputerTerminal01Icon} size={props.size} class={props.class} />;
}

export function MicIcon(props: IconProps): JSX.Element {
	return <Icon icon={Mic01Icon} size={props.size} class={props.class} />;
}

export function ChatIcon(props: IconProps): JSX.Element {
	return <Icon icon={BubbleChatIcon} size={props.size} class={props.class} />;
}

export function SendIcon(props: IconProps): JSX.Element {
	return <Icon icon={ArrowUp02Icon} size={props.size} class={props.class} />;
}

export function BackIcon(props: IconProps): JSX.Element {
	return <Icon icon={ArrowLeft01Icon} size={props.size} class={props.class} />;
}

export function StopSquareIcon(props: IconProps): JSX.Element {
	return <Icon icon={StopIcon} size={props.size} class={props.class} />;
}

export function FileIcon(props: IconProps): JSX.Element {
	return <Icon icon={File01Icon} size={props.size} class={props.class} />;
}

export function EditIcon(props: IconProps): JSX.Element {
	return <Icon icon={PencilEdit01Icon} size={props.size} class={props.class} />;
}

export function GlobeIcon(props: IconProps): JSX.Element {
	return <Icon icon={Globe02Icon} size={props.size} class={props.class} />;
}

export function IdeaIcon(props: IconProps): JSX.Element {
	return <Icon icon={Idea01Icon} size={props.size} class={props.class} />;
}

export function ToolIcon(props: IconProps): JSX.Element {
	return <Icon icon={Wrench01Icon} size={props.size} class={props.class} />;
}

export function FolderIcon(props: IconProps): JSX.Element {
	return <Icon icon={Folder01Icon} size={props.size} class={props.class} />;
}

export function SidebarIcon(props: IconProps): JSX.Element {
	return <Icon icon={SidebarLeftIcon} size={props.size} class={props.class} />;
}

export function BranchIcon(props: IconProps): JSX.Element {
	return <Icon icon={GitBranchIcon} size={props.size} class={props.class} />;
}

export function ArchiveIcon(props: IconProps): JSX.Element {
	return <Icon icon={Archive01Icon} size={props.size} class={props.class} />;
}

export function NoteIcon(props: IconProps): JSX.Element {
	return <Icon icon={Note01Icon} size={props.size} class={props.class} />;
}

export function NoteAddIcon(props: IconProps): JSX.Element {
	return <Icon icon={NoteAddGlyph} size={props.size} class={props.class} />;
}

export function CopyIcon(props: IconProps): JSX.Element {
	return <Icon icon={Copy01Icon} size={props.size} class={props.class} />;
}

/** A spinning ring for work in progress; still under reduced motion. */
export function SpinnerIcon(props: IconProps): JSX.Element {
	return (
		<Icon icon={Loading03Icon} class={`motion-safe:animate-spin ${props.class ?? "size-4"}`} />
	);
}

/** Up-and-down chevrons: a control that opens a list to pick from. */
export function UnfoldIcon(props: IconProps): JSX.Element {
	return <Icon icon={UnfoldMoreIcon} size={props.size} class={props.class} />;
}

export function SunIcon(props: IconProps): JSX.Element {
	return <Icon icon={Sun03Icon} size={props.size} class={props.class} />;
}

export function MoonIcon(props: IconProps): JSX.Element {
	return <Icon icon={Moon02Icon} size={props.size} class={props.class} />;
}

export function ComputerIcon(props: IconProps): JSX.Element {
	return <Icon icon={ComputerGlyph} size={props.size} class={props.class} />;
}

export function ExternalIcon(props: IconProps): JSX.Element {
	return <Icon icon={ArrowUpRight01Glyph} size={props.size} class={props.class} />;
}

export function AttachIcon(props: IconProps): JSX.Element {
	return <Icon icon={Attachment01Glyph} size={props.size} class={props.class} />;
}

export function ClockIcon(props: IconProps): JSX.Element {
	return <Icon icon={Clock01Glyph} size={props.size} class={props.class} />;
}

export function AppsIcon(props: IconProps): JSX.Element {
	return <Icon icon={GridViewGlyph} size={props.size} class={props.class} />;
}

export function HomeIcon(props: IconProps): JSX.Element {
	return <Icon icon={Home01Glyph} size={props.size} class={props.class} />;
}

export function InboxIcon(props: IconProps): JSX.Element {
	return <Icon icon={InboxGlyph} size={props.size} class={props.class} />;
}

export function BellIcon(props: IconProps): JSX.Element {
	return <Icon icon={Notification01Glyph} size={props.size} class={props.class} />;
}

export function RocketIcon(props: IconProps): JSX.Element {
	return <Icon icon={Rocket01Glyph} size={props.size} class={props.class} />;
}

export function UserAddIcon(props: IconProps): JSX.Element {
	return <Icon icon={UserAdd01Glyph} size={props.size} class={props.class} />;
}

export function FilterIcon(props: IconProps): JSX.Element {
	return <Icon icon={FilterHorizontalGlyph} size={props.size} class={props.class} />;
}

export function SortIcon(props: IconProps): JSX.Element {
	return <Icon icon={Sorting05Glyph} size={props.size} class={props.class} />;
}

export function ChevronRightIcon(props: IconProps): JSX.Element {
	return <Icon icon={ArrowRight01Glyph} size={props.size} class={props.class} />;
}

export function UploadIcon(props: IconProps): JSX.Element {
	return <Icon icon={Upload04Glyph} size={props.size} class={props.class} />;
}

export function InfoIcon(props: IconProps): JSX.Element {
	return <Icon icon={InformationCircleGlyph} size={props.size} class={props.class} />;
}

export function LinkIcon(props: IconProps): JSX.Element {
	return <Icon icon={Link01Glyph} size={props.size} class={props.class} />;
}

export function UserIcon(props: IconProps): JSX.Element {
	return <Icon icon={UserGlyph} size={props.size} class={props.class} />;
}

export function PullRequestIcon(props: IconProps): JSX.Element {
	return <Icon icon={GitPullRequestGlyph} size={props.size} class={props.class} />;
}

export function CodeIcon(props: IconProps): JSX.Element {
	return <Icon icon={CodeGlyph} size={props.size} class={props.class} />;
}

export function ImageIcon(props: IconProps): JSX.Element {
	return <Icon icon={Image01Glyph} size={props.size} class={props.class} />;
}

export function CalendarIcon(props: IconProps): JSX.Element {
	return <Icon icon={Calendar03Glyph} size={props.size} class={props.class} />;
}

export function TagIcon(props: IconProps): JSX.Element {
	return <Icon icon={Tag01Glyph} size={props.size} class={props.class} />;
}

export function FlagIcon(props: IconProps): JSX.Element {
	return <Icon icon={Flag02Glyph} size={props.size} class={props.class} />;
}

export function CheckCircleIcon(props: IconProps): JSX.Element {
	return <Icon icon={CheckmarkCircle02Glyph} size={props.size} class={props.class} />;
}

export function KeyIcon(props: IconProps): JSX.Element {
	return <Icon icon={Key01Glyph} size={props.size} class={props.class} />;
}

export function StarIcon(props: IconProps): JSX.Element {
	return <Icon icon={StarGlyph} size={props.size} class={props.class} />;
}

export function SparklesIcon(props: IconProps): JSX.Element {
	return <Icon icon={SparklesGlyph} size={props.size} class={props.class} />;
}

export function EyeIcon(props: IconProps): JSX.Element {
	return <Icon icon={ViewGlyph} size={props.size} class={props.class} />;
}

export function EyeOffIcon(props: IconProps): JSX.Element {
	return <Icon icon={ViewOffGlyph} size={props.size} class={props.class} />;
}

export function CameraIcon(props: IconProps): JSX.Element {
	return <Icon icon={Camera01Glyph} size={props.size} class={props.class} />;
}

/** Something asking permission: an approval. */
export function ShieldIcon(props: IconProps): JSX.Element {
	return <Icon icon={Shield01Glyph} size={props.size} class={props.class} />;
}

/** A bulleted list (the note's format bar). */
export function ListIcon(props: IconProps): JSX.Element {
	return <Icon icon={LeftToRightListBulletGlyph} size={props.size} class={props.class} />;
}

/** A checklist: a ticked box (the note's format bar). */
export function ChecklistIcon(props: IconProps): JSX.Element {
	return <Icon icon={CheckmarkSquare02Glyph} size={props.size} class={props.class} />;
}

/** Name something: a file in a note. */
export function AtIcon(props: IconProps): JSX.Element {
	return <Icon icon={AtGlyph} size={props.size} class={props.class} />;
}
