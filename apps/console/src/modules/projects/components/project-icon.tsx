import Atom01Icon from "@hugeicons/core-free-icons/Atom01Icon";
import Book02Icon from "@hugeicons/core-free-icons/Book02Icon";
import Briefcase01Icon from "@hugeicons/core-free-icons/Briefcase01Icon";
import BrowserIcon from "@hugeicons/core-free-icons/BrowserIcon";
import Camera01Icon from "@hugeicons/core-free-icons/Camera01Icon";
import Chart01Icon from "@hugeicons/core-free-icons/Chart01Icon";
import CloudIcon from "@hugeicons/core-free-icons/CloudIcon";
import CodeIcon from "@hugeicons/core-free-icons/CodeIcon";
import Coffee01Icon from "@hugeicons/core-free-icons/Coffee01Icon";
import CommandLineIcon from "@hugeicons/core-free-icons/CommandLineIcon";
import CpuIcon from "@hugeicons/core-free-icons/CpuIcon";
import Database01Icon from "@hugeicons/core-free-icons/Database01Icon";
import DiamondIcon from "@hugeicons/core-free-icons/DiamondIcon";
import FavouriteIcon from "@hugeicons/core-free-icons/FavouriteIcon";
import Fire02Icon from "@hugeicons/core-free-icons/Fire02Icon";
import Flag01Icon from "@hugeicons/core-free-icons/Flag01Icon";
import FlashIcon from "@hugeicons/core-free-icons/FlashIcon";
import Folder01Icon from "@hugeicons/core-free-icons/Folder01Icon";
import GameController01Icon from "@hugeicons/core-free-icons/GameController01Icon";
import Globe02Icon from "@hugeicons/core-free-icons/Globe02Icon";
import Home01Icon from "@hugeicons/core-free-icons/Home01Icon";
import Idea01Icon from "@hugeicons/core-free-icons/Idea01Icon";
import Layers01Icon from "@hugeicons/core-free-icons/Layers01Icon";
import Leaf01Icon from "@hugeicons/core-free-icons/Leaf01Icon";
import Mail01Icon from "@hugeicons/core-free-icons/Mail01Icon";
import Moon02Icon from "@hugeicons/core-free-icons/Moon02Icon";
import MusicNote01Icon from "@hugeicons/core-free-icons/MusicNote01Icon";
import Package01Icon from "@hugeicons/core-free-icons/Package01Icon";
import PaintBoardIcon from "@hugeicons/core-free-icons/PaintBoardIcon";
import PuzzleIcon from "@hugeicons/core-free-icons/PuzzleIcon";
import Robot01Icon from "@hugeicons/core-free-icons/Robot01Icon";
import Rocket01Icon from "@hugeicons/core-free-icons/Rocket01Icon";
import Shield01Icon from "@hugeicons/core-free-icons/Shield01Icon";
import ShoppingBag01Icon from "@hugeicons/core-free-icons/ShoppingBag01Icon";
import SmartPhone01Icon from "@hugeicons/core-free-icons/SmartPhone01Icon";
import StarIcon from "@hugeicons/core-free-icons/StarIcon";
import Sun01Icon from "@hugeicons/core-free-icons/Sun01Icon";
import Target01Icon from "@hugeicons/core-free-icons/Target01Icon";
import type { JSX } from "@solidjs/web";

import { type IconData, PixelMark, ProjectMark, type ProjectMarkShape } from "@/kit";

import {
	mascotPath,
	PROJECT_MASCOTS,
	parseProjectIcon,
	projectColor,
	type ProjectSymbol,
} from "../lib/project-look";

export const SYMBOL_ICONS: Record<ProjectSymbol, IconData> = {
	rocket: Rocket01Icon,
	code: CodeIcon,
	terminal: CommandLineIcon,
	globe: Globe02Icon,
	browser: BrowserIcon,
	phone: SmartPhone01Icon,
	database: Database01Icon,
	cloud: CloudIcon,
	cpu: CpuIcon,
	layers: Layers01Icon,
	package: Package01Icon,
	puzzle: PuzzleIcon,
	robot: Robot01Icon,
	atom: Atom01Icon,
	flash: FlashIcon,
	fire: Fire02Icon,
	leaf: Leaf01Icon,
	sun: Sun01Icon,
	moon: Moon02Icon,
	star: StarIcon,
	heart: FavouriteIcon,
	diamond: DiamondIcon,
	target: Target01Icon,
	flag: Flag01Icon,
	idea: Idea01Icon,
	shield: Shield01Icon,
	chart: Chart01Icon,
	briefcase: Briefcase01Icon,
	bag: ShoppingBag01Icon,
	game: GameController01Icon,
	music: MusicNote01Icon,
	camera: Camera01Icon,
	book: Book02Icon,
	paint: PaintBoardIcon,
	mail: Mail01Icon,
	coffee: Coffee01Icon,
	home: Home01Icon,
};

/** A pixel mascot: while busy its two frames alternate, like a sprite at work. */
export function Mascot(props: { id: string; busy?: boolean; class?: string }): JSX.Element {
	const frames = () => PROJECT_MASCOTS[props.id] ?? PROJECT_MASCOTS.robot;
	return (
		<PixelMark
			rest={mascotPath(frames().rest)}
			busy={mascotPath(frames().busy)}
			animate={props.busy}
			class={props.class}
		/>
	);
}

/**
 * A project's mark in its colour: a folder by default, or the letter, symbol or mascot chosen
 * for it. `running` animates it while one of its threads is working.
 */
export function ProjectIcon(props: {
	project: { slug: string; name: string; icon?: string | null; color?: string | null };
	running?: boolean;
	class?: string;
}): JSX.Element {
	const shape = (): ProjectMarkShape => {
		const choice = parseProjectIcon(props.project.icon);
		if (choice.kind === "mascot") {
			const frames = PROJECT_MASCOTS[choice.id] ?? PROJECT_MASCOTS.robot;
			return { kind: "pixels", rest: mascotPath(frames.rest), busy: mascotPath(frames.busy) };
		}
		if (choice.kind === "letter") return { kind: "letter", letter: props.project.name.slice(0, 1) };
		if (choice.kind === "symbol") return { kind: "icon", icon: SYMBOL_ICONS[choice.id] };
		return { kind: "icon", icon: Folder01Icon };
	};
	return (
		<ProjectMark
			color={projectColor(props.project)}
			shape={shape()}
			running={props.running}
			class={props.class}
		/>
	);
}
