import type { JSX } from "@solidjs/web";
import { Match, Show, Switch } from "solid-js";

import { Icon, type IconData } from "./icons";

/** What a project's mark shows: its initial on a tile, a symbol, or a two-frame pixel sprite. */
export type ProjectMarkShape =
	| { kind: "letter"; letter: string }
	| { kind: "icon"; icon: IconData }
	| { kind: "pixels"; rest: string; busy: string };

/**
 * A pixel sprite on an 8×8 grid in the current colour: while busy its two frames alternate, like
 * a sprite at work. The frames are SVG path data.
 */
export function PixelMark(props: {
	rest: string;
	busy: string;
	animate?: boolean;
	/** Layout only: its size. */
	class?: string;
}): JSX.Element {
	return (
		<svg
			viewBox="0 0 8 8"
			aria-hidden="true"
			shape-rendering="crispEdges"
			class={`${props.animate ? "mascot-busy" : ""} ${props.class ?? "size-4"}`}
			fill="currentColor"
		>
			<path class="mascot-rest" d={props.rest} />
			<path class="mascot-alt" d={props.busy} />
		</svg>
	);
}

/**
 * A project's mark in its own colour. `running` animates it while the project has work under way:
 * a sprite moves, anything else breathes, with a live dot.
 */
export function ProjectMark(props: {
	color: string;
	shape: ProjectMarkShape;
	running?: boolean;
	/** Layout only: its size, `size-4` by default. */
	class?: string;
}): JSX.Element {
	const breathe = () => (props.running ? "project-breathe" : "");
	return (
		<span
			class={`relative inline-grid shrink-0 place-items-center ${props.class ?? "size-4"}`}
			style={{ color: props.color }}
			aria-hidden="true"
		>
			<Switch>
				<Match when={props.shape.kind === "pixels" && props.shape}>
					{(shape) => (
						<PixelMark
							rest={shape().rest}
							busy={shape().busy}
							animate={props.running}
							class="size-[88%]"
						/>
					)}
				</Match>
				<Match when={props.shape.kind === "letter" && props.shape}>
					{(shape) => (
						<span
							class={`grid size-full place-items-center rounded-[0.3rem] bg-current font-medium text-micro uppercase leading-none ${breathe()}`}
						>
							<span class="text-surface">{shape().letter}</span>
						</span>
					)}
				</Match>
				<Match when={props.shape.kind === "icon" && props.shape}>
					{(shape) => <Icon icon={shape().icon} class={`size-full ${breathe()}`} />}
				</Match>
			</Switch>
			<Show when={props.running && props.shape.kind !== "pixels"}>
				<span class="-top-0.5 -right-0.5 absolute size-1.5 rounded-full bg-current ring-2 ring-surface motion-safe:animate-pulse" />
			</Show>
		</span>
	);
}
