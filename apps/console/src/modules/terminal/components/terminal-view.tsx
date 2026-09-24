import type { JSX } from "@solidjs/web";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { WebglAddon } from "@xterm/addon-webgl";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import { createEffect, onSettled, untrack } from "solid-js";

import { useAuth } from "@/modules/auth";
import { registerDictationTarget } from "@/modules/voice";

import { type Arrow, arrowSequence, applyModifiers, type Modifiers } from "../lib/keys";
import { lineForThumb, type ScrollState, thumbGeometry } from "../lib/scrollbar";
import { type ConnectionState, connectTerminal } from "../lib/terminal-socket";
import { monoFontFamily, terminalTheme } from "../lib/terminal-theme";
import { terminalSocketUrl } from "../services/terminals.service";

/** What the key bar and toolbar can do to the terminal that is showing. */
export type TerminalHandle = {
	send: (data: string) => void;
	arrow: (arrow: Arrow) => void;
	paste: (text: string) => void;
	focus: () => void;
};

/**
 * One live terminal: xterm.js drawing a shell that runs in the runner. It stays mounted while
 * other tabs show, so switching tabs keeps scrollback and costs nothing.
 */
export function TerminalView(props: {
	id: string;
	active: boolean;
	fontSize: number;
	/** The key bar's armed modifiers; reading them releases them. */
	takeModifiers: () => Modifiers;
	onHandle: (handle: TerminalHandle) => void;
	onState: (state: ConnectionState) => void;
	onTitle: (title: string) => void;
}): JSX.Element {
	const auth = useAuth();
	let host: HTMLDivElement | undefined;
	let track: HTMLDivElement | undefined;
	let thumb: HTMLDivElement | undefined;
	let term: Terminal | undefined;
	let fit: FitAddon | undefined;
	let frame = 0;

	// Coalesce resizes to one fit per frame: dragging a window or opening a keyboard fires many.
	function scheduleFit(): void {
		cancelAnimationFrame(frame);
		frame = requestAnimationFrame(() => {
			if (!host || host.clientWidth === 0 || host.clientHeight === 0) return;
			fit?.fit();
		});
	}

	onSettled(() => {
		if (!host) return;
		const terminal = new Terminal({
			cursorBlink: true,
			cursorStyle: "bar",
			fontFamily: monoFontFamily(),
			fontSize: untrack(() => props.fontSize),
			lineHeight: 1.15,
			scrollback: 10_000,
			theme: terminalTheme(),
			macOptionIsMeta: true,
			allowProposedApi: true,
			// Touch scrolling feels native when it is not smoothed a second time.
			smoothScrollDuration: 0,
		});
		const fitAddon = new FitAddon();
		terminal.loadAddon(fitAddon);
		terminal.loadAddon(new WebLinksAddon());
		terminal.open(host);
		term = terminal;
		fit = fitAddon;

		// The GPU renderer is much smoother on long output; fall back to the DOM one if the GPU
		// context is lost or unavailable.
		try {
			const webgl = new WebglAddon();
			webgl.onContextLoss(() => webgl.dispose());
			terminal.loadAddon(webgl);
		} catch (cause) {
			console.warn("[terminal] WebGL renderer unavailable, using the DOM renderer", cause);
		}

		// Phone keyboards must not "fix" commands.
		terminal.textarea?.setAttribute("autocapitalize", "off");
		terminal.textarea?.setAttribute("autocorrect", "off");
		terminal.textarea?.setAttribute("spellcheck", "false");

		fitAddon.fit();

		const live = connectTerminal({
			url: terminalSocketUrl(),
			id: props.id,
			token: auth.token,
			renew: auth.renew,
			size: () => ({ cols: terminal.cols, rows: terminal.rows }),
			onReset: () => terminal.reset(),
			onOutput: (bytes) => terminal.write(bytes),
			onState: (state) => props.onState(state),
			onTitle: (title) => props.onTitle(title),
			onExit: (code) => {
				terminal.write(`\r\n\x1b[2m[process exited with code ${code}]\x1b[0m\r\n`);
			},
		});

		const subscriptions = [
			terminal.onData((data) => live.send(applyModifiers(data, props.takeModifiers()))),
			terminal.onBinary((data) => live.send(data)),
			terminal.onResize(({ cols, rows }) => live.resize(cols, rows)),
		];

		// Copy and paste go through the browser's own clipboard events, so the shortcuts people
		// already use work: with a selection, Ctrl/⌘+C copies; without one, Ctrl+C interrupts.
		terminal.attachCustomKeyEventHandler((event) => {
			if (event.type !== "keydown") return true;
			const mod = event.ctrlKey || event.metaKey;
			const key = event.key.toLowerCase();
			if (mod && key === "c" && terminal.hasSelection()) return false;
			if (mod && key === "v") return false;
			return true;
		});
		const onCopy = (event: ClipboardEvent) => {
			const text = terminal.getSelection();
			if (!text) return;
			event.clipboardData?.setData("text/plain", text);
			event.preventDefault();
		};
		const onPaste = (event: ClipboardEvent) => {
			const text = event.clipboardData?.getData("text/plain");
			if (!text) return;
			event.preventDefault();
			terminal.paste(text);
		};
		host.addEventListener("copy", onCopy);
		host.addEventListener("paste", onPaste);

		const resize = new ResizeObserver(scheduleFit);
		resize.observe(host);

		// Follow Appearance: the theme and tint live on <html> as attributes and custom properties.
		const retheme = () => {
			terminal.options.theme = terminalTheme();
		};
		const appearance = new MutationObserver(retheme);
		appearance.observe(document.documentElement, {
			attributes: true,
			attributeFilter: ["style", "class", "data-theme"],
		});
		const scheme = matchMedia("(prefers-color-scheme: dark)");
		scheme.addEventListener("change", retheme);

		// Phones suspend background tabs and drop sockets; come back without waiting on backoff.
		const resume = () => {
			if (document.visibilityState === "visible") live.reconnectNow();
		};
		document.addEventListener("visibilitychange", resume);
		window.addEventListener("online", resume);

		const detachScrollbar = track && thumb ? attachScrollbar(terminal, track, thumb) : () => {};

		// Voice input typed into the shell, as if pasted: never with Enter, so nothing runs unseen.
		const unregisterDictation = registerDictationTarget(host, {
			insert: (text) => terminal.paste(text),
			focus: () => terminal.focus(),
			label: "Terminal",
			floatingMic: false,
		});

		props.onHandle({
			// Key-bar keys take the armed modifiers too, so Shift then Tab sends back tab.
			send: (data) => live.send(applyModifiers(data, props.takeModifiers())),
			arrow: (arrow) =>
				live.send(
					arrowSequence(arrow, terminal.modes.applicationCursorKeysMode, props.takeModifiers()),
				),
			paste: (text) => terminal.paste(text),
			focus: () => terminal.focus(),
		});

		return () => {
			cancelAnimationFrame(frame);
			document.removeEventListener("visibilitychange", resume);
			window.removeEventListener("online", resume);
			scheme.removeEventListener("change", retheme);
			appearance.disconnect();
			resize.disconnect();
			host?.removeEventListener("copy", onCopy);
			host?.removeEventListener("paste", onPaste);
			for (const subscription of subscriptions) subscription.dispose();
			detachScrollbar();
			unregisterDictation();
			live.close();
			terminal.dispose();
			term = undefined;
		};
	});

	// A tab that comes back into view re-measures (it was display: none) and, with a physical
	// keyboard, takes focus. On touch, focusing would pop the keyboard on every tab switch.
	createEffect(
		() => props.active,
		(active) => {
			if (!active) return;
			scheduleFit();
			if (matchMedia("(pointer: fine)").matches) requestAnimationFrame(() => term?.focus());
		},
	);

	createEffect(
		() => props.fontSize,
		(size) => {
			if (!term || term.options.fontSize === size) return;
			term.options.fontSize = size;
			scheduleFit();
		},
	);

	return (
		<div class="relative size-full">
			<div
				ref={(el) => {
					host = el;
				}}
				// xterm draws its own padding-free grid; the gutter keeps glyphs off the rounded edge.
				// On touch screens its mouse-only scrollbar gives way to the draggable one below.
				class="size-full overflow-hidden px-2 py-1.5 pointer-coarse:pr-5 pointer-coarse:[&_.xterm-scrollable-element>.scrollbar]:hidden!"
				data-terminal={props.id}
			/>
			{/* A wide, invisible grab strip; the visible thumb inside it is thin, like a native one. */}
			<div
				ref={(el) => {
					track = el;
				}}
				aria-hidden="true"
				data-no-swipe
				class="absolute inset-y-1 right-0 z-10 hidden w-5 touch-none pointer-coarse:block"
			>
				<div
					ref={(el) => {
						thumb = el;
					}}
					class="absolute right-1 hidden w-1 rounded-full bg-ink/25 transition-[width,background-color] duration-fast ease-out-grid data-[dragging]:w-1.5 data-[dragging]:bg-ink/60"
				/>
			</div>
		</div>
	);
}

/**
 * A touch scrollbar for the terminal's scrollback: grab the thumb (or anywhere on the strip) and
 * drag, and the output follows the finger line by line. xterm.js's own scrollbar only listens to
 * a mouse. Hidden while there is nothing to scroll, including in full-screen programs.
 */
function attachScrollbar(
	terminal: Terminal,
	track: HTMLDivElement,
	thumb: HTMLDivElement,
): () => void {
	let frame = 0;
	let dragOffset: number | null = null;

	const state = (): ScrollState => ({
		trackHeight: track.clientHeight,
		rows: terminal.rows,
		viewportY: terminal.buffer.active.viewportY,
		baseY: terminal.buffer.active.baseY,
	});

	const paint = () => {
		frame = 0;
		const geometry = thumbGeometry(state());
		thumb.style.display = geometry ? "block" : "none";
		if (!geometry) return;
		thumb.style.height = `${geometry.height}px`;
		thumb.style.translate = `0 ${geometry.top}px`;
	};
	const schedulePaint = () => {
		if (!frame) frame = requestAnimationFrame(paint);
	};

	const scrollTo = (clientY: number) => {
		if (dragOffset === null) return;
		const top = clientY - track.getBoundingClientRect().top - dragOffset;
		terminal.scrollToLine(lineForThumb(top, state()));
	};

	// Touch events, not pointer events: the strip is a touch-only control, and a non-passive
	// `touchmove` is what reliably keeps the browser from turning the drag into a page gesture.
	const onStart = (event: TouchEvent) => {
		const geometry = thumbGeometry(state());
		if (!geometry || event.touches.length !== 1) return;
		event.preventDefault();
		const y = event.touches[0].clientY - track.getBoundingClientRect().top;
		const onThumb = y >= geometry.top && y <= geometry.top + geometry.height;
		// On the thumb: keep the finger where it grabbed. On the strip: centre the thumb there.
		dragOffset = onThumb ? y - geometry.top : geometry.height / 2;
		thumb.dataset.dragging = "";
		scrollTo(event.touches[0].clientY);
	};
	const onMove = (event: TouchEvent) => {
		if (dragOffset === null) return;
		event.preventDefault();
		scrollTo(event.touches[0].clientY);
	};
	const onEnd = () => {
		dragOffset = null;
		delete thumb.dataset.dragging;
	};

	track.addEventListener("touchstart", onStart, { passive: false });
	track.addEventListener("touchmove", onMove, { passive: false });
	track.addEventListener("touchend", onEnd);
	track.addEventListener("touchcancel", onEnd);
	const subscriptions = [
		terminal.onScroll(schedulePaint),
		terminal.onWriteParsed(schedulePaint),
		terminal.onResize(schedulePaint),
		terminal.buffer.onBufferChange(schedulePaint),
	];
	const resize = new ResizeObserver(schedulePaint);
	resize.observe(track);
	schedulePaint();

	return () => {
		cancelAnimationFrame(frame);
		resize.disconnect();
		for (const subscription of subscriptions) subscription.dispose();
		track.removeEventListener("touchstart", onStart);
		track.removeEventListener("touchmove", onMove);
		track.removeEventListener("touchend", onEnd);
		track.removeEventListener("touchcancel", onEnd);
	};
}

export type { ConnectionState };
