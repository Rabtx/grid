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
import { Match, Show, Switch } from "solid-js";

import { Icon, type IconData } from "@/ui";

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
		<svg
			viewBox="0 0 8 8"
			aria-hidden="true"
			shape-rendering="crispEdges"
			class={`${props.busy ? "mascot-busy" : ""} ${props.class ?? "size-4"}`}
			fill="currentColor"
		>
			<path class="mascot-rest" d={mascotPath(frames().rest)} />
			<path class="mascot-alt" d={mascotPath(frames().busy)} />
		</svg>
	);
}

/**
 * A project's mark in its colour: a folder by default, or the letter, symbol or mascot chosen
 * for it. `running` animates it while one of its threads is working: mascots move, anything else
 * breathes, with a live dot.
 */
export function ProjectIcon(props: {
	project: { slug: string; name: string; icon?: string | null; color?: string | null };
	running?: boolean;
	class?: string;
}): JSX.Element {
	const choice = () => parseProjectIcon(props.project.icon);
	const size = () => props.class ?? "size-4";

	return (
		<span
			class={`relative inline-grid shrink-0 place-items-center ${size()}`}
			style={{ color: projectColor(props.project) }}
			aria-hidden="true"
		>
			<Switch>
				<Match when={choice().kind === "mascot"}>
					<Mascot id={(choice() as { id: string }).id} busy={props.running} class="size-[88%]" />
				</Match>
				<Match when={choice().kind === "letter"}>
					<span
						class={`grid size-full place-items-center rounded-[0.3rem] font-semibold text-ui-caption uppercase leading-none ${props.running ? "project-breathe" : ""}`}
						style={{ background: "currentColor" }}
					>
						<span class="text-canvas">{props.project.name.slice(0, 1)}</span>
					</span>
				</Match>
				<Match when={choice().kind === "symbol"}>
					<Icon
						icon={SYMBOL_ICONS[(choice() as { id: ProjectSymbol }).id]}
						class={`size-full ${props.running ? "project-breathe" : ""}`}
					/>
				</Match>
				<Match when={choice().kind === "folder"}>
					<Icon icon={Folder01Icon} class={`size-full ${props.running ? "project-breathe" : ""}`} />
				</Match>
			</Switch>
			<Show when={props.running && choice().kind !== "mascot"}>
				<span class="-top-0.5 -right-0.5 absolute size-1.5 rounded-full bg-current ring-2 ring-canvas motion-safe:animate-pulse" />
			</Show>
		</span>
	);
}
