/**
 * Warp arrival: a celebration for picking a flagship model. The screen dims and a field of stars
 * streams out from the middle, faster and faster, until a flash and a shockwave; the model's name
 * rises out of it letter by letter with a light sweeping across, a caption under it, while embers
 * drift out and settle. About three and a half seconds, drawn on a canvas under the words, in the
 * lab's own colours. It never takes a click: any key or pointer press ends it at once.
 *
 * The kit only draws. Whether to celebrate (reduced motion, a setting, desktop only) is the
 * caller's decision.
 */

export type ArrivalOptions = {
	/** The name that arrives: the model's, short. */
	title: string;
	/** A line under it: "Flagship model · Anthropic". */
	caption: string;
	/** Two hues in degrees, the lab's colours: the stars run from the first to the second. */
	hues: readonly [number, number];
	/** Saturation, 0 to 100: a silver lab is low. */
	saturation?: number;
};

const WARP_MS = 1150;
const FLASH_MS = 380;
const RING_MS = 1000;
const HOLD_UNTIL_MS = 3050;
const FADE_MS = 520;
const STARS = 280;
const EMBERS = 90;
const STYLE_ID = "kit-arrival-style";

type Star = { angle: number; dist: number; speed: number; hue: number; width: number };
type Ember = {
	x: number;
	y: number;
	vx: number;
	vy: number;
	size: number;
	hue: number;
	life: number;
	twinkle: number;
};

let running: (() => void) | null = null;

/** Keyframes for the words, added to the page once. */
function ensureStyle(): void {
	if (document.getElementById(STYLE_ID)) return;
	const style = document.createElement("style");
	style.id = STYLE_ID;
	style.textContent = `
@keyframes kit-arrival-letter {
	from { opacity: 0; transform: translateY(0.45em) scale(0.92); filter: blur(12px); }
	60% { opacity: 1; filter: blur(0); }
	to { opacity: 1; transform: none; filter: blur(0); }
}
@keyframes kit-arrival-sheen {
	from { background-position: 120% 0; }
	to { background-position: -40% 0; }
}
@keyframes kit-arrival-caption {
	from { opacity: 0; letter-spacing: 0.6em; }
	to { opacity: 0.8; letter-spacing: 0.32em; }
}`;
	document.head.append(style);
}

function ease(t: number): number {
	return 1 - (1 - Math.min(Math.max(t, 0), 1)) ** 3;
}

/** Play it. Starting another ends the one running. */
export function playArrival(options: ArrivalOptions): void {
	running?.();
	ensureStyle();
	const [hueA, hueB] = options.hues;
	const sat = options.saturation ?? 90;
	const color = (hue: number, light: number, alpha = 1) =>
		`hsl(${hue} ${sat}% ${light}% / ${alpha})`;

	const root = document.createElement("div");
	root.setAttribute("aria-hidden", "true");
	Object.assign(root.style, {
		position: "fixed",
		inset: "0",
		zIndex: "9999",
		pointerEvents: "none",
		transition: `opacity ${FADE_MS}ms ease`,
	});
	const canvas = document.createElement("canvas");
	Object.assign(canvas.style, { position: "absolute", inset: "0", width: "100%", height: "100%" });
	root.append(canvas);

	// The words: each letter rises on its own beat; the sweep of light runs across them all.
	const words = document.createElement("div");
	Object.assign(words.style, {
		position: "absolute",
		inset: "0",
		display: "flex",
		flexDirection: "column",
		alignItems: "center",
		justifyContent: "center",
		gap: "1.1rem",
		textAlign: "center",
		padding: "0 2rem",
	});
	// The name, twice in one place: solid glowing letters that rise one by one, and over them the
	// same word as a sweep of light (a clipped gradient cannot reach letters that animate alone).
	const title = document.createElement("div");
	Object.assign(title.style, {
		position: "relative",
		fontSize: "clamp(2.75rem, 7.5vw, 6.5rem)",
		fontWeight: "650",
		lineHeight: "1.05",
		letterSpacing: "-0.03em",
		whiteSpace: "nowrap",
	});
	const letters = document.createElement("div");
	Object.assign(letters.style, {
		color: "#fff",
		textShadow: `0 0 18px ${color(hueA, 62, 0.75)}, 0 0 54px ${color(hueB, 58, 0.5)}`,
	});
	[...options.title].forEach((char, index) => {
		const letter = document.createElement("span");
		letter.textContent = char === " " ? "\u00a0" : char;
		Object.assign(letter.style, {
			display: "inline-block",
			opacity: "0",
			animation: `kit-arrival-letter 720ms ${WARP_MS + 40 + index * 38}ms cubic-bezier(0.2, 0.8, 0.2, 1) forwards`,
		});
		letters.append(letter);
	});
	const sheen = document.createElement("div");
	sheen.textContent = options.title;
	Object.assign(sheen.style, {
		position: "absolute",
		inset: "0",
		backgroundImage: `linear-gradient(100deg, transparent 0%, transparent 40%, ${color(hueB, 92, 0.95)} 48%, #fff 50%, ${color(hueA, 90, 0.9)} 52%, transparent 60%, transparent 100%)`,
		backgroundSize: "250% 100%",
		backgroundPosition: "120% 0",
		WebkitBackgroundClip: "text",
		backgroundClip: "text",
		color: "transparent",
		animation: `kit-arrival-sheen 1300ms ${WARP_MS + 40 + options.title.length * 38 + 380}ms cubic-bezier(0.4, 0, 0.2, 1) both`,
	});
	title.append(letters, sheen);
	const caption = document.createElement("div");
	caption.textContent = options.caption.toUpperCase();
	Object.assign(caption.style, {
		fontSize: "0.8rem",
		fontWeight: "500",
		color: color(hueA, 84),
		opacity: "0",
		animation: `kit-arrival-caption 900ms ${WARP_MS + 520}ms ease-out forwards`,
	});
	words.append(title, caption);
	root.append(words);
	document.body.append(root);

	const context = canvas.getContext("2d");
	const dpr = Math.min(window.devicePixelRatio || 1, 2);
	let width = 0;
	let height = 0;
	const size = () => {
		width = window.innerWidth;
		height = window.innerHeight;
		canvas.width = Math.round(width * dpr);
		canvas.height = Math.round(height * dpr);
		context?.setTransform(dpr, 0, 0, dpr, 0, 0);
	};
	size();
	const reach = () => Math.hypot(width, height) / 2 + 40;

	const star = (): Star => {
		const mix = Math.random();
		return {
			angle: Math.random() * Math.PI * 2,
			dist: Math.random() * 60,
			speed: 0.35 + Math.random() * 0.9,
			hue: hueA + (hueB - hueA) * mix,
			width: 0.6 + Math.random() * 1.6,
		};
	};
	const stars = Array.from({ length: STARS }, star);
	const embers: Ember[] = [];
	let spawned = false;

	const start = performance.now();
	let last = start;
	let frame = 0;
	let ended = false;

	const end = () => {
		if (ended) return;
		ended = true;
		cancelAnimationFrame(frame);
		window.removeEventListener("resize", size);
		window.removeEventListener("keydown", end, true);
		window.removeEventListener("pointerdown", end, true);
		root.style.opacity = "0";
		setTimeout(() => root.remove(), FADE_MS);
		if (running === end) running = null;
	};
	running = end;
	window.addEventListener("resize", size);
	window.addEventListener("keydown", end, true);
	window.addEventListener("pointerdown", end, true);

	const draw = (now: number) => {
		if (!context) return end();
		const t = now - start;
		const dt = Math.min(now - last, 40);
		last = now;
		const cx = width / 2;
		const cy = height / 2;
		const far = reach();
		context.clearRect(0, 0, width, height);

		// The room dims around the event, and brightens back at the end.
		const dim = Math.min(t / 260, 1) * (t > HOLD_UNTIL_MS ? 1 - (t - HOLD_UNTIL_MS) / FADE_MS : 1);
		const vignette = context.createRadialGradient(cx, cy, 0, cx, cy, far);
		vignette.addColorStop(0, `rgb(4 6 14 / ${0.62 * dim})`);
		vignette.addColorStop(1, `rgb(0 0 0 / ${0.9 * dim})`);
		context.fillStyle = vignette;
		context.fillRect(0, 0, width, height);

		// Warp: the stars accelerate outward, their streaks growing with their speed; after the
		// flash they coast, slow and fade instead of coming back.
		const warp = Math.min(t / WARP_MS, 1);
		const after = Math.max(t - WARP_MS, 0);
		const pace =
			t < WARP_MS ? 0.25 + 5.5 * warp ** 2.2 : Math.max(0.15, 5.75 * Math.exp(-after / 380));
		const fade = t < WARP_MS ? 1 : Math.max(0, 1 - after / 1600);
		context.lineCap = "round";
		for (const item of stars) {
			const velocity = item.speed * pace * (0.3 + item.dist / 260);
			item.dist += velocity * dt;
			if (item.dist > far) {
				if (t < WARP_MS) Object.assign(item, star());
				else continue;
			}
			const trail = Math.min(velocity * 16, 220);
			const x1 = cx + Math.cos(item.angle) * item.dist;
			const y1 = cy + Math.sin(item.angle) * item.dist;
			const x0 = cx + Math.cos(item.angle) * Math.max(item.dist - trail, 0);
			const y0 = cy + Math.sin(item.angle) * Math.max(item.dist - trail, 0);
			const bright = Math.min(item.dist / 140, 1) * fade;
			const streak = context.createLinearGradient(x0, y0, x1, y1);
			streak.addColorStop(0, color(item.hue, 70, 0));
			streak.addColorStop(1, color(item.hue, 88, bright));
			context.strokeStyle = streak;
			context.lineWidth = item.width * (1 + warp * 0.8);
			context.beginPath();
			context.moveTo(x0, y0);
			context.lineTo(x1, y1);
			context.stroke();
		}

		// The flash, the shockwave rings, and the embers thrown out by them.
		if (t >= WARP_MS) {
			if (!spawned) {
				spawned = true;
				for (let i = 0; i < EMBERS; i++) {
					const angle = Math.random() * Math.PI * 2;
					const speed = 0.08 + Math.random() * 0.42;
					embers.push({
						x: cx,
						y: cy,
						vx: Math.cos(angle) * speed,
						vy: Math.sin(angle) * speed - 0.03,
						size: 0.8 + Math.random() * 2.4,
						hue: Math.random() < 0.5 ? hueA : hueB,
						life: 1400 + Math.random() * 1300,
						twinkle: Math.random() * Math.PI * 2,
					});
				}
				// A small jolt as it lands.
				root.animate(
					[
						{ transform: "translate(0, 0)" },
						{ transform: "translate(3px, -2px)" },
						{ transform: "translate(-3px, 2px)" },
						{ transform: "translate(2px, 1px)" },
						{ transform: "translate(0, 0)" },
					],
					{ duration: 220, easing: "ease-out" },
				);
			}
			const flash = 1 - after / FLASH_MS;
			if (flash > 0) {
				const light = context.createRadialGradient(cx, cy, 0, cx, cy, far * 0.9);
				light.addColorStop(0, `rgb(255 255 255 / ${0.9 * flash})`);
				light.addColorStop(0.25, color(hueB, 70, 0.55 * flash));
				light.addColorStop(1, color(hueA, 50, 0));
				context.fillStyle = light;
				context.fillRect(0, 0, width, height);
			}
			for (const [delay, hue] of [
				[0, hueA],
				[140, hueB],
			] as const) {
				const progress = (after - delay) / RING_MS;
				if (progress <= 0 || progress >= 1) continue;
				const radius = ease(progress) * far * 0.75;
				context.strokeStyle = color(hue, 76, (1 - progress) * 0.85);
				context.lineWidth = 1 + (1 - progress) * 7;
				context.beginPath();
				context.arc(cx, cy, radius, 0, Math.PI * 2);
				context.stroke();
			}
			for (const ember of embers) {
				if (ember.life <= 0) continue;
				ember.life -= dt;
				ember.x += ember.vx * dt;
				ember.y += ember.vy * dt;
				ember.vx *= 0.992;
				ember.vy = ember.vy * 0.992 - 0.0006 * dt;
				ember.twinkle += dt * 0.012;
				const alpha = Math.min(ember.life / 600, 1) * (0.55 + 0.45 * Math.sin(ember.twinkle));
				context.fillStyle = color(ember.hue, 80, alpha);
				context.shadowColor = color(ember.hue, 65, alpha);
				context.shadowBlur = 8;
				context.beginPath();
				context.arc(ember.x, ember.y, ember.size, 0, Math.PI * 2);
				context.fill();
			}
			context.shadowBlur = 0;
		}

		if (t >= HOLD_UNTIL_MS) return end();
		frame = requestAnimationFrame(draw);
	};
	frame = requestAnimationFrame(draw);
}
