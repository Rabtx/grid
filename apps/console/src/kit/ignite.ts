/**
 * Grid ignition: a celebration drawn in Grid's own material, the grid. From a point (the model you
 * just picked) a shockwave lights the cells it passes; as it crosses the middle of the screen the
 * lit cells spell a word in chunky pixels; then that word bursts into sparks and falls away. About
 * 1.7 seconds on a canvas laid over everything, never in the way of a click.
 *
 * The kit only draws. Whether to celebrate (reduced motion, a setting, desktop only) is the
 * caller's decision.
 */

export type IgniteOptions = {
	/** Where the wave starts, in viewport pixels. */
	x: number;
	y: number;
	/** What the lit cells spell; kept short, upper-case reads best. */
	label: string;
	/** The colour's hue in degrees; the provider's, so each lab lights in its own colour. */
	hue: number;
};

const CELL = 14;
const GAP = 2;
const WAVE_MS = 720;
const MARK_IN_MS = 380;
const BURST_MS = 1080;
const END_MS = 1750;
const BAND = 110;

type Spark = { x: number; y: number; vx: number; vy: number; size: number; life: number };

let running: (() => void) | null = null;

/**
 * A 5×7 pixel font, one string per glyph with rows split by "/": crisp at any cell size, where
 * rendering a system font this small would blur. Unknown characters are left out.
 */
const GLYPHS: Record<string, string> = {
	A: "01110/10001/10001/11111/10001/10001/10001",
	B: "11110/10001/10001/11110/10001/10001/11110",
	C: "01110/10001/10000/10000/10000/10001/01110",
	D: "11110/10001/10001/10001/10001/10001/11110",
	E: "11111/10000/10000/11110/10000/10000/11111",
	F: "11111/10000/10000/11110/10000/10000/10000",
	G: "01110/10001/10000/10111/10001/10001/01111",
	H: "10001/10001/10001/11111/10001/10001/10001",
	I: "01110/00100/00100/00100/00100/00100/01110",
	J: "00111/00010/00010/00010/00010/10010/01100",
	K: "10001/10010/10100/11000/10100/10010/10001",
	L: "10000/10000/10000/10000/10000/10000/11111",
	M: "10001/11011/10101/10101/10001/10001/10001",
	N: "10001/10001/11001/10101/10011/10001/10001",
	O: "01110/10001/10001/10001/10001/10001/01110",
	P: "11110/10001/10001/11110/10000/10000/10000",
	Q: "01110/10001/10001/10001/10101/10010/01101",
	R: "11110/10001/10001/11110/10100/10010/10001",
	S: "01111/10000/10000/01110/00001/00001/11110",
	T: "11111/00100/00100/00100/00100/00100/00100",
	U: "10001/10001/10001/10001/10001/10001/01110",
	V: "10001/10001/10001/10001/10001/01010/00100",
	W: "10001/10001/10001/10101/10101/10101/01010",
	X: "10001/10001/01010/00100/01010/10001/10001",
	Y: "10001/10001/01010/00100/00100/00100/00100",
	Z: "11111/00001/00010/00100/01000/10000/11111",
	0: "01110/10001/10011/10101/11001/10001/01110",
	1: "00100/01100/00100/00100/00100/00100/01110",
	2: "01110/10001/00001/00010/00100/01000/11111",
	3: "11110/00001/00001/01110/00001/00001/11110",
	4: "00010/00110/01010/10010/11111/00010/00010",
	5: "11111/10000/11110/00001/00001/10001/01110",
	6: "00110/01000/10000/11110/10001/10001/01110",
	7: "11111/00001/00010/00100/01000/01000/01000",
	8: "01110/10001/10001/01110/10001/10001/01110",
	9: "01110/10001/10001/01111/00001/00010/01100",
	".": "000/000/000/000/000/011/011",
	"-": "00000/00000/00000/11111/00000/00000/00000",
	" ": "000/000/000/000/000/000/000",
};

/** The label's pixels, one cell each, centred in a `cols`×`rows` field; cut to what fits. */
function markCells(label: string, cols: number, rows: number): Set<number> {
	const glyphs = [...label.toUpperCase()]
		.map((char) => GLYPHS[char]?.split("/"))
		.filter((glyph): glyph is string[] => Boolean(glyph));
	// Each glyph is followed by one blank column; drop glyphs from the end until the word fits.
	while (
		glyphs.length > 0 &&
		glyphs.reduce((sum, glyph) => sum + glyph[0].length + 1, -1) > cols - 4
	)
		glyphs.pop();
	const width = glyphs.reduce((sum, glyph) => sum + glyph[0].length + 1, -1);
	const left = Math.floor((cols - width) / 2);
	const top = Math.floor((rows - 7) / 2);
	const lit = new Set<number>();
	let x = left;
	for (const glyph of glyphs) {
		glyph.forEach((line, y) => {
			for (let column = 0; column < line.length; column++)
				if (line[column] === "1") lit.add((top + y) * cols + x + column);
		});
		x += glyph[0].length + 1;
	}
	return lit;
}

function easeOut(t: number): number {
	return 1 - (1 - t) ** 3;
}

/** Plays the celebration once; a second call while one plays restarts it from the new point. */
export function igniteGrid(options: IgniteOptions): void {
	if (typeof document === "undefined") return;
	running?.();

	const ratio = Math.min(window.devicePixelRatio || 1, 2);
	const width = window.innerWidth;
	const height = window.innerHeight;
	const canvas = document.createElement("canvas");
	canvas.setAttribute("aria-hidden", "true");
	canvas.width = Math.round(width * ratio);
	canvas.height = Math.round(height * ratio);
	Object.assign(canvas.style, {
		position: "fixed",
		inset: "0",
		width: `${width}px`,
		height: `${height}px`,
		pointerEvents: "none",
		zIndex: "2147483000",
	});
	document.body.append(canvas);
	const context = canvas.getContext("2d");
	if (!context) {
		canvas.remove();
		return;
	}
	context.scale(ratio, ratio);

	const pitch = CELL + GAP;
	const cols = Math.ceil(width / pitch);
	const rows = Math.ceil(height / pitch);
	const reach = Math.hypot(
		Math.max(options.x, width - options.x),
		Math.max(options.y, height - options.y),
	);
	const mark = markCells(options.label, cols, rows);
	const glow = (alpha: number, light = 62) => `hsl(${options.hue} 95% ${light}% / ${alpha})`;
	const sparks: Spark[] = [];
	let burst = false;
	let frame = 0;
	const start = performance.now();

	function explode(): void {
		const midX = width / 2;
		const midY = height / 2;
		for (const index of mark) {
			const x = (index % cols) * pitch + CELL / 2;
			const y = Math.floor(index / cols) * pitch + CELL / 2;
			const angle = Math.atan2(y - midY, x - midX) + (Math.random() - 0.5) * 1.2;
			const speed = 0.12 + Math.random() * 0.5;
			sparks.push({
				x,
				y,
				vx: Math.cos(angle) * speed,
				vy: Math.sin(angle) * speed - 0.15,
				size: CELL * (0.35 + Math.random() * 0.45),
				life: 1,
			});
		}
	}

	function stop(): void {
		cancelAnimationFrame(frame);
		canvas.remove();
		running = null;
	}
	running = stop;

	let last = start;
	function draw(now: number): void {
		const t = now - start;
		const step = Math.min(now - last, 48);
		last = now;
		context?.clearRect(0, 0, width, height);
		if (!context) return;

		const radius = reach * easeOut(Math.min(t / WAVE_MS, 1));
		const fade = t < BURST_MS ? 1 : Math.max(0, 1 - (t - BURST_MS) / (END_MS - BURST_MS));

		for (let row = 0; row < rows; row++) {
			for (let col = 0; col < cols; col++) {
				const x = col * pitch;
				const y = row * pitch;
				const distance = Math.hypot(x + CELL / 2 - options.x, y + CELL / 2 - options.y);
				const inMark = mark.has(row * cols + col);
				let alpha = 0;
				if (t < WAVE_MS + 200 && distance < radius && distance > radius - BAND) {
					// The wave's leading edge: brightest at the front, softening behind it.
					alpha = 0.5 * (1 - (radius - distance) / BAND) * (1 - t / (WAVE_MS + 200));
				} else if (distance < radius) {
					// A faint afterglow where the wave has been.
					alpha = 0.05 * fade;
				}
				if (inMark && !burst && t > MARK_IN_MS && distance < radius) {
					alpha = Math.min(1, (t - MARK_IN_MS) / 180);
				}
				if (alpha <= 0.01) continue;
				const lettered = inMark && !burst && t > MARK_IN_MS;
				// The word glows; the wave and its afterglow stay flat, which keeps them cheap.
				context.shadowBlur = lettered ? 16 : 0;
				context.shadowColor = lettered ? glow(alpha * 0.9, 60) : "transparent";
				context.fillStyle = lettered ? glow(alpha, 72) : glow(alpha);
				context.fillRect(x, y, CELL, CELL);
			}
		}

		if (!burst && t >= BURST_MS) {
			burst = true;
			explode();
		}
		context.shadowBlur = 0;
		for (const spark of sparks) {
			spark.vy += 0.0009 * step;
			spark.x += spark.vx * step;
			spark.y += spark.vy * step;
			spark.life = fade;
			const size = spark.size * (0.4 + spark.life * 0.6);
			context.fillStyle = glow(spark.life, 70);
			context.fillRect(spark.x - size / 2, spark.y - size / 2, size, size);
		}

		if (t < END_MS) frame = requestAnimationFrame(draw);
		else stop();
	}
	frame = requestAnimationFrame(draw);
}
