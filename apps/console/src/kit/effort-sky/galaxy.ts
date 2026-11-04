// Adapted from Bruno Delorence's effort slider (https://brunodelorence.com/components/effort-slider).
// Copyright (c) 2026 Bruno Delorence. MIT License.
import { GROWN, HALF } from "./brain";

/*
 * The last step's two canvases. The mosaic fills the track: small rounded squares, 4 px apart in 5
 * rows, each with a colour of its own and a brightness that steps now and then, so the track
 * twinkles like a patch of sky (fewer and dimmer to the left, where effort is lowest). The burst
 * sits on the thumb: dotted rays around the brain, sparks on it, and, as the step is reached, a ring
 * of coloured specks that flies out. Everything twinkles 7.5 times a second; only the burst's first
 * second draws every frame. Nothing runs off screen, in a hidden tab or under reduced motion (a
 * still frame is drawn instead). Units are px of the slider at its own size.
 */

type Rgb = readonly [number, number, number];

const CELL_HUES: Rgb[] = [
	[216, 122, 217],
	[195, 103, 189],
	[144, 119, 245],
	[225, 223, 238],
	[131, 223, 235],
	[124, 190, 223],
	[169, 155, 175],
];
const RAY_HUES: Rgb[] = [
	[150, 150, 168],
	[96, 168, 170],
	[146, 136, 206],
	[196, 196, 214],
];
const SPARK_HUES: Rgb[] = [
	[242, 240, 252],
	[143, 242, 253],
	[215, 211, 251],
	[184, 212, 255],
];
const BURST_HUES: Rgb[] = [
	[240, 138, 214],
	[127, 233, 245],
	[107, 77, 255],
	[255, 255, 255],
	[90, 108, 255],
	[201, 184, 255],
];

/** Whether this browser can draw the sky: a 2D canvas, paths, and the observers it runs on. */
export function canDrawSky(canvas: HTMLCanvasElement): boolean {
	return (
		typeof Path2D !== "undefined" &&
		typeof ResizeObserver !== "undefined" &&
		typeof IntersectionObserver !== "undefined" &&
		canvas.getContext("2d") !== null
	);
}

export const TRACK_WIDTH = 196;
const TRACK_HEIGHT = 20;
const PITCH = 4;
const CELL = 3;
const COLUMNS = TRACK_WIDTH / PITCH;
const ROWS = TRACK_HEIGHT / PITCH;
const LEVELS = [0.45, 0.6, 0.8, 1];
const STEP = 133;
const REACH = 50;
const RAY_START = 16;
const BURST = 1000;

const rgb = ([r, g, b]: Rgb) => `rgb(${r} ${g} ${b})`;
const pick = <T>(list: readonly T[]): T => list[Math.floor(Math.random() * list.length)] as T;

type Cell = { hue: Rgb; level: number; flash: boolean };
type Ray = { angle: number; length: number; specks: { hue: Rgb; level: number }[] };
type Spark = { x: number; y: number; hue: Rgb; life: number };
type Speck = { angle: number; spread: number; speed: number; fade: number; hue: Rgb };

const presence = (x: number) => 0.4 + 0.5 * x;
const ramp = (x: number) => 0.3 + 0.7 * x ** 1.1;

export class Galaxy {
	private mosaic: CanvasRenderingContext2D;
	private burst: CanvasRenderingContext2D;
	private cells: Cell[] = [];
	private rays: Ray[] = [];
	private sparks: Spark[] = [];
	private specks: Speck[] = [];
	private inside: { x: number; y: number }[] = [];
	private unit = 1;
	private ratio = 1;
	private on = false;
	private started = 0;
	private lastStep = 0;
	private frame = 0;
	private visible = false;
	private reduced = false;
	private cleanups: (() => void)[] = [];

	constructor(
		private mosaicCanvas: HTMLCanvasElement,
		private burstCanvas: HTMLCanvasElement,
		private track: HTMLElement,
	) {
		this.mosaic = mosaicCanvas.getContext("2d") as CanvasRenderingContext2D;
		this.burst = burstCanvas.getContext("2d") as CanvasRenderingContext2D;
		this.seed();
		const resize = new ResizeObserver(() => this.resize());
		resize.observe(track);
		const seen = new IntersectionObserver(([entry]) => {
			this.visible = entry?.isIntersecting ?? false;
			this.update();
		});
		seen.observe(track);
		const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
		const readMotion = () => {
			this.reduced = motion.matches;
			this.update();
		};
		this.reduced = motion.matches;
		motion.addEventListener("change", readMotion);
		const onVisibility = () => this.update();
		document.addEventListener("visibilitychange", onVisibility);
		this.cleanups.push(
			() => resize.disconnect(),
			() => seen.disconnect(),
			() => motion.removeEventListener("change", readMotion),
			() => document.removeEventListener("visibilitychange", onVisibility),
		);
		this.resize();
	}

	/** Turns the last step on or off; `burst` plays the arrival. */
	set(on: boolean, burst: boolean): void {
		const arriving = on && !this.on;
		this.on = on;
		if (arriving) {
			this.seed();
			this.started = burst && !this.reduced ? performance.now() : Number.NEGATIVE_INFINITY;
			if (burst && !this.reduced) this.launch();
		}
		this.update();
	}

	destroy(): void {
		cancelAnimationFrame(this.frame);
		for (const cleanup of this.cleanups) cleanup();
	}

	private seed(): void {
		this.cells = [];
		for (let row = 0; row < ROWS; row++)
			for (let column = 0; column < COLUMNS; column++) {
				const cell: Cell = { hue: pick(CELL_HUES), level: 0, flash: false };
				this.roll(cell, column / (COLUMNS - 1));
				this.cells.push(cell);
			}
		const count = 14;
		this.rays = Array.from({ length: count }, (_, index) => {
			const length = 30 + Math.random() * 16;
			const specks = Array.from({ length: Math.floor((length - RAY_START) / 3) + 1 }, () => ({
				hue: pick(RAY_HUES),
				level: Math.random(),
			}));
			return {
				angle: ((index + (Math.random() - 0.5) * 0.6) / count) * Math.PI * 2,
				length,
				specks,
			};
		});
		if (!this.inside.length) {
			const left = new Path2D(HALF);
			const both = new Path2D();
			both.addPath(left);
			both.addPath(left, new DOMMatrix([-1, 0, 0, 1, 0, 0]));
			const context = this.burst;
			context.save();
			context.setTransform(1, 0, 0, 1, 0, 0);
			const fits = (x: number, y: number) =>
				[
					[0, 0],
					[1.2, 0],
					[-1.2, 0],
					[0, 1.2],
					[0, -1.2],
				].every(([dx = 0, dy = 0]) => context.isPointInPath(both, x + dx, y + dy));
			for (let y = -8.5; y <= 8.5; y += 1)
				for (let x = -8.5; x <= 8.5; x += 1)
					if (fits(x, y)) this.inside.push({ x: x * GROWN, y: y * GROWN });
			context.restore();
		}
		this.sparks = [];
	}

	private roll(cell: Cell, x: number): void {
		cell.flash = false;
		cell.level = Math.random() < presence(x) ? pick(LEVELS) : 0;
	}

	private launch(): void {
		const count = 28;
		this.specks = Array.from({ length: count }, (_, index) => ({
			angle: ((index + (Math.random() - 0.5) * 0.5) / count) * Math.PI * 2,
			spread: 0.8 + Math.random() * 0.5,
			speed: 0.6 + Math.random() * 0.9,
			fade: 0.7 + Math.random() * 0.6,
			hue: pick(BURST_HUES),
		}));
	}

	private twinkle(): void {
		this.cells.forEach((cell, index) => {
			if (Math.random() > 0.12) return;
			const x = (index % COLUMNS) / (COLUMNS - 1);
			if (Math.random() < 0.03 * x) {
				cell.flash = true;
				cell.level = 1;
			} else this.roll(cell, x);
		});
		for (const ray of this.rays)
			for (const speck of ray.specks) if (Math.random() < 0.25) speck.level = Math.random();
		this.sparks = this.sparks.filter((spark) => --spark.life > 0);
		while (this.sparks.length < 7 && this.inside.length) {
			const at = pick(this.inside);
			this.sparks.push({ ...at, hue: pick(SPARK_HUES), life: 2 + Math.floor(Math.random() * 4) });
		}
	}

	private resize(): void {
		const unit = this.track.offsetWidth / TRACK_WIDTH;
		if (!unit) return;
		this.unit = unit;
		this.ratio = Math.min(window.devicePixelRatio || 1, 2);
		const size = (canvas: HTMLCanvasElement, width: number, height: number) => {
			canvas.width = Math.round(width * unit * this.ratio);
			canvas.height = Math.round(height * unit * this.ratio);
		};
		size(this.mosaicCanvas, TRACK_WIDTH, TRACK_HEIGHT);
		size(this.burstCanvas, REACH * 2, REACH * 2);
		this.draw(performance.now());
	}

	private update(): void {
		cancelAnimationFrame(this.frame);
		this.frame = 0;
		if (!this.on) return;
		if (this.visible && !document.hidden && !this.reduced) {
			const tick = (now: number) => {
				let changed = now - this.started < BURST + 100;
				if (now - this.lastStep >= STEP) {
					this.lastStep = now;
					this.twinkle();
					changed = true;
				}
				if (changed) this.draw(now);
				this.frame = requestAnimationFrame(tick);
			};
			this.frame = requestAnimationFrame(tick);
		} else {
			if (!this.sparks.length) this.twinkle();
			this.draw(Number.POSITIVE_INFINITY);
		}
	}

	private draw(now: number): void {
		if (!this.on) return;
		this.drawMosaic();
		this.drawBurst(now - this.started);
	}

	private drawMosaic(): void {
		const context = this.mosaic;
		const scale = this.unit * this.ratio;
		context.setTransform(1, 0, 0, 1, 0, 0);
		context.clearRect(0, 0, this.mosaicCanvas.width, this.mosaicCanvas.height);
		context.setTransform(scale, 0, 0, scale, 0, 0);
		this.cells.forEach((cell, index) => {
			if (!cell.level) return;
			const column = index % COLUMNS;
			const row = Math.floor(index / COLUMNS);
			const x = column * PITCH + (PITCH - CELL) / 2;
			const y = row * PITCH + (PITCH - CELL) / 2;
			context.globalAlpha = cell.flash ? 0.95 : cell.level * ramp(column / (COLUMNS - 1));
			context.fillStyle = cell.flash ? "#f1eeff" : rgb(cell.hue);
			context.beginPath();
			context.roundRect(x, y, CELL, CELL, 0.75);
			context.fill();
		});
		context.globalAlpha = 1;
	}

	private drawBurst(t: number): void {
		const context = this.burst;
		const scale = this.unit * this.ratio;
		context.setTransform(1, 0, 0, 1, 0, 0);
		context.clearRect(0, 0, this.burstCanvas.width, this.burstCanvas.height);
		context.setTransform(scale, 0, 0, scale, REACH * scale, REACH * scale);
		const square = (x: number, y: number, size: number) =>
			context.fillRect(Math.round(x) - size / 2, Math.round(y) - size / 2, size, size);
		const reach = t < 30 ? 0 : RAY_START + 34 * (1 - Math.exp(-(t - 30) / 90));
		const intro = Math.min(1, Math.max(0, t / 160));
		for (const ray of this.rays) {
			const cos = Math.cos(ray.angle);
			const sin = Math.sin(ray.angle);
			ray.specks.forEach((speck, index) => {
				const r = RAY_START + index * 3;
				if (r > reach || r > ray.length) return;
				const fall = 1 - (r - RAY_START) / (ray.length - RAY_START + 3);
				context.globalAlpha = (0.3 + 0.7 * speck.level) * fall * intro;
				context.fillStyle = rgb(speck.hue);
				square(cos * r, sin * r, 1.25);
			});
		}
		if (t > 120) {
			for (const spark of this.sparks) {
				context.globalAlpha = 0.95;
				context.fillStyle = rgb(spark.hue);
				square(spark.x, spark.y, 1.5);
			}
		}
		if (t < BURST) {
			for (const speck of this.specks) {
				const out = 7 + 10 * (1 - Math.exp(-t / 80)) + Math.max(0, t - 160) * 0.016 * speck.speed;
				const r = out * speck.spread ** (t > 160 ? 1 : 0.3);
				const fade = t < 220 ? 1 : Math.max(0, 1 - (t - 220) / (420 * speck.fade));
				if (!fade) continue;
				context.globalAlpha = fade;
				context.fillStyle = rgb(speck.hue);
				square(Math.cos(speck.angle) * r * 1.05, Math.sin(speck.angle) * r, 2);
			}
		}
		context.globalAlpha = 1;
	}
}
