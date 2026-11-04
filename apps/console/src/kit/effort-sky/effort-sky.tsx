// Adapted from Bruno Delorence's effort slider (https://brunodelorence.com/components/effort-slider).
// Copyright (c) 2026 Bruno Delorence. MIT License.
// The thumb is role="slider" on a span: a range input cannot hold the brain drawing.
/* oxlint-disable jsx-a11y/prefer-tag-over-role */
import type { JSX } from "@solidjs/web";
import {
	createEffect,
	createMemo,
	createSignal,
	createUniqueId,
	For,
	onSettled,
	Show,
	untrack,
} from "solid-js";

import { tap } from "../haptics";
import { Brain } from "./brain";
import styles from "./effort-sky.module.css";
import { Galaxy, TRACK_WIDTH } from "./galaxy";

export type SkyLevel = { id: string; name: string };

/** The thumb's ease: each frame closes the gap by 1 - e^(-dt / TAU). */
const TAU = 56;
/** The thumb is 16 px wide and stays inside the 196 px track: its middle runs 8 px to 188 px. */
const RAIL = TRACK_WIDTH - 16;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** The level's name, changed letter by letter: the old one rises and blurs away. */
function LevelName(props: { text: string; special: boolean }): JSX.Element {
	type Entry = { id: number; text: string; special: boolean; out: boolean };
	let next = 0;
	const [entries, setEntries] = createSignal<Entry[]>([
		{
			id: next++,
			text: untrack(() => props.text),
			special: untrack(() => props.special),
			out: false,
		},
	]);
	createEffect(
		() => [props.text, props.special] as const,
		([text, special]) => {
			const now = untrack(entries);
			const current = now.find((entry) => !entry.out);
			if (current && current.text === text && current.special === special) return;
			// Old names that are long gone (no animation ran to drop them) are let go too.
			const leaving = now
				.filter((entry) => !entry.out || now.indexOf(entry) >= now.length - 3)
				.map((entry) => ({ ...entry, out: true }));
			setEntries([...leaving, { id: next++, text, special, out: false }]);
		},
	);
	return (
		<span class={styles.level} aria-hidden="true">
			<For each={entries()} keyed={(entry) => entry.id}>
				{(entry) => (
					<span
						class={entry().out ? styles.levelOut : styles.levelIn}
						data-special={entry().special ? "" : undefined}
						onAnimationEnd={(event) => {
							if (!entry().out) return;
							if (event.target === event.currentTarget.lastElementChild)
								setEntries((now) => now.filter((item) => item.id !== entry().id));
						}}
					>
						<For each={[...entry().text]}>
							{(letter, index) => (
								<span class={styles.letter} style={{ "--i": String(index()) }}>
									{letter === " " ? "\u00a0" : letter}
								</span>
							)}
						</For>
					</span>
				)}
			</For>
		</span>
	);
}

/**
 * How hard a model thinks, as a stepped slider with a brain for its thumb (after Bruno Delorence's
 * effort slider). The track fills pink to violet behind the brain as it glides from step to step;
 * the step's name changes letter by letter. Reaching the last step, the brain grows blue-violet in
 * a flash, rays of specks shoot out, and the track becomes a twinkling night sky (`payoff`). One
 * step can be marked as recommended. A real slider: arrows, Page Up/Down, Home and End move it, and
 * a press or drag anywhere on the track does too. Under reduced motion it jumps and stays still.
 */
export function EffortSky(props: {
	levels: readonly SkyLevel[];
	value: string | null;
	onChange: (id: string) => void;
	label?: string;
	/** The step most people should keep: a taller tick and a word under it. */
	recommendedId?: string | null;
	recommendedLabel?: string;
	minLabel?: string;
	maxLabel?: string;
	/** What the help button explains; empty for no button. */
	help?: string;
	/** The last step is the night sky; false keeps it like the others. */
	payoff?: boolean;
}): JSX.Element {
	const id = createUniqueId();
	const count = () => Math.max(props.levels.length, 2);
	const last = () => count() - 1;
	const index = createMemo(() =>
		clamp(
			props.levels.findIndex((level) => level.id === props.value),
			0,
			last(),
		),
	);
	const sky = () => props.payoff !== false && props.levels.length > 1 && index() === last();
	const [arrivals, setArrivals] = createSignal(0);
	let wasSky = untrack(sky);
	createEffect(sky, (on) => {
		if (on && !wasSky) setArrivals((n) => n + 1);
		wasSky = on;
	});

	let card: HTMLDivElement | undefined;
	let track: HTMLDivElement | undefined;
	let thumb: HTMLSpanElement | undefined;
	let mosaic: HTMLCanvasElement | undefined;
	let burst: HTMLCanvasElement | undefined;
	let engine: Galaxy | null = null;

	const startPos = untrack(() => index() / last());
	let pos = startPos;
	let target = startPos;
	let frame = 0;
	let dragging = false;
	let picked = untrack(index);

	function glide(): void {
		if (frame || !card) return;
		const element = card;
		const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
		let before = performance.now();
		const step = (now: number) => {
			const gap = target - pos;
			const share = reduced ? 1 : 1 - Math.exp(-Math.min(64, Math.max(0, now - before)) / TAU);
			before = now;
			pos = Math.abs(gap) < 0.0004 ? target : pos + gap * share;
			element.style.setProperty("--pos", pos.toFixed(4));
			frame = pos === target ? 0 : requestAnimationFrame(step);
		};
		frame = requestAnimationFrame(step);
	}

	// A new step from a key or the parent: the thumb glides there (a drag leads it itself).
	createEffect(
		() => [index(), last()] as const,
		([at, end]) => {
			picked = at;
			if (dragging) return;
			target = at / end;
			glide();
		},
	);

	function pick(next: number): void {
		const step = clamp(next, 0, last());
		picked = step;
		const level = props.levels[step];
		if (!level || step === index()) return;
		props.onChange(level.id);
		tap();
	}

	/** The pointer's place along the rail, 0 to 1. */
	function along(clientX: number): number {
		if (!track) return pos;
		const rect = track.getBoundingClientRect();
		const unit = rect.width / TRACK_WIDTH || 1;
		return clamp((clientX - rect.left) / unit - 8, 0, RAIL) / RAIL;
	}

	onSettled(() => {
		if (!mosaic || !burst || !track) return;
		const instance = new Galaxy(mosaic, burst, track);
		engine = instance;
		instance.set(untrack(sky), false);
		return () => {
			cancelAnimationFrame(frame);
			instance.destroy();
			engine = null;
		};
	});
	createEffect(
		() => [sky(), arrivals()] as const,
		([on, count]) => {
			engine?.set(on, count > 0);
		},
	);

	// The help bubble: open on hover or focus, toggled by a tap, closed by Escape.
	const [tip, setTip] = createSignal(false);
	let tapped = false;
	createEffect(tip, (open) => {
		if (!open) return;
		const escape = (event: KeyboardEvent) => {
			if (event.key === "Escape") setTip(false);
		};
		document.addEventListener("keydown", escape);
		return () => document.removeEventListener("keydown", escape);
	});

	const recommended = () => {
		const at = props.levels.findIndex((level) => level.id === props.recommendedId);
		return at >= 0 ? at : -1;
	};
	const stop = (step: number) => ({ "--stop": String(step / last()) });
	const name = () => props.levels[index()]?.name ?? "";
	const label = () => props.label ?? "Effort";
	const recommendedWord = () => props.recommendedLabel ?? "Recommended";

	return (
		<div class={styles.root}>
			<div
				ref={(el) => {
					card = el;
				}}
				class={styles.card}
				data-sky={sky() ? "" : undefined}
				style={{ "--pos": String(startPos) }}
			>
				<div class={styles.header}>
					<span id={`${id}-label`} class={styles.name}>
						{label()}
					</span>
					<LevelName text={name()} special={sky()} />
					<Show when={props.help !== ""}>
						<button
							type="button"
							class={styles.help}
							data-open={tip() ? "" : undefined}
							aria-label={`About ${label().toLowerCase()}`}
							aria-describedby={`${id}-help`}
							onPointerEnter={(event) => {
								if (event.pointerType === "mouse") setTip(true);
							}}
							onPointerLeave={(event) => {
								if (event.pointerType === "mouse") setTip(false);
							}}
							onPointerDown={(event) => {
								tapped = event.pointerType !== "mouse";
							}}
							onFocus={() => {
								if (!tapped) setTip(true);
							}}
							onBlur={() => {
								tapped = false;
								setTip(false);
							}}
							onClick={() => {
								if (tapped) setTip((open) => !open);
								else setTip(true);
								tapped = false;
							}}
						>
							<svg viewBox="0 0 24 24" aria-hidden="true">
								<circle cx="12" cy="12" r="10" />
								<path d="M9.2 9.3a2.9 2.9 0 0 1 5.6 0.9c0 1.9-2.8 2.5-2.8 4.1" />
								<path d="M12 17.6h0.01" />
							</svg>
							<span id={`${id}-help`} role="tooltip" class={styles.tip}>
								{props.help ??
									"How long the model thinks before it answers. Higher is slower, and smarter."}
							</span>
						</button>
					</Show>
				</div>

				<div class={styles.ends} aria-hidden="true">
					<span>{props.minLabel ?? "Faster"}</span>
					<span>{props.maxLabel ?? "Smarter"}</span>
				</div>

				<div
					ref={(el) => {
						track = el;
					}}
					class={styles.control}
					onPointerDown={(event) => {
						if (event.button !== 0) return;
						event.preventDefault();
						thumb?.focus({ preventScroll: true });
						event.currentTarget.setPointerCapture(event.pointerId);
						dragging = true;
						const at = along(event.clientX);
						target = at;
						glide();
						pick(Math.round(at * last()));
					}}
					onPointerMove={(event) => {
						if (!dragging) return;
						const at = along(event.clientX);
						target = at;
						glide();
						pick(Math.round(at * last()));
					}}
					onPointerUp={() => {
						if (!dragging) return;
						dragging = false;
						target = picked / last();
						glide();
					}}
					onPointerCancel={() => {
						dragging = false;
						target = index() / last();
						glide();
					}}
				>
					<div class={styles.track} aria-hidden="true">
						<div class={styles.fill} />
						<div class={styles.sky}>
							<canvas
								ref={(el) => {
									mosaic = el;
								}}
								class={styles.mosaic}
							/>
						</div>
						<For each={props.levels}>
							{(_, step) => (
								<span
									class={step() === recommended() ? styles.tick : styles.dot}
									style={stop(step())}
								/>
							)}
						</For>
					</div>
					<div class={styles.rail}>
						<span
							ref={(el) => {
								thumb = el;
							}}
							class={styles.thumb}
							role="slider"
							tabindex={0}
							aria-labelledby={`${id}-label`}
							aria-valuemin={0}
							aria-valuemax={last()}
							aria-valuenow={index()}
							aria-valuetext={`${name()}${index() === recommended() ? `, ${recommendedWord().toLowerCase()}` : ""}`}
							aria-orientation="horizontal"
							onKeyDown={(event) => {
								const from = index();
								const moves: Record<string, number> = {
									ArrowRight: from + 1,
									ArrowUp: from + 1,
									PageUp: from + 1,
									ArrowLeft: from - 1,
									ArrowDown: from - 1,
									PageDown: from - 1,
									Home: 0,
									End: last(),
								};
								const to = moves[event.key];
								if (to === undefined) return;
								event.preventDefault();
								pick(to);
							}}
						>
							<span class={styles.halo} aria-hidden="true" />
							<Brain
								class={styles.brain}
								pinkClass={styles.pink}
								galaxyClass={styles.galaxy}
								gradient={`${id}-sky`}
							/>
							<For each={sky() && arrivals() > 0 ? [arrivals()] : []}>
								{() => <span class={styles.flash} aria-hidden="true" />}
							</For>
							<canvas
								ref={(el) => {
									burst = el;
								}}
								class={styles.burst}
								aria-hidden="true"
							/>
						</span>
					</div>
				</div>

				<div class={styles.under} aria-hidden="true">
					<Show when={recommended() >= 0}>
						<span
							class={styles.recommended}
							data-edge={
								recommended() === 0 ? "start" : recommended() === last() ? "end" : undefined
							}
							style={stop(recommended())}
						>
							{recommendedWord()}
						</span>
					</Show>
				</div>
			</div>
		</div>
	);
}
