import type { JSX } from "@solidjs/web";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { WebglAddon } from "@xterm/addon-webgl";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import { createEffect, createSignal, onSettled, Show, untrack } from "solid-js";

import { useAuth } from "@/modules/auth";
import { registerDictationTarget } from "@/modules/voice";
import { ChevronDownIcon, CopyIcon } from "@/ui";

import { applyModifiers, type Arrow, arrowSequence, type Modifiers } from "../lib/keys";
import { lineForThumb, type ScrollState, thumbGeometry } from "../lib/scrollbar";
import { connectTerminal, type ConnectionState } from "../lib/terminal-socket";
import { monoFontFamily, terminalTheme } from "../lib/terminal-theme";
import { attachTouchScroll, getCellCoords, getCellDimensions } from "../lib/touch-scroll";
import {
	computeSelectionRange,
	findWordBounds,
	getSelectionGeometry,
	type SelectionPosition,
} from "../lib/touch-selection";
import { terminalSocketUrl } from "../services/terminals.service";
import { hapticTick } from "./key-bar";

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
	onFontSizeChange?: (delta: number) => void;
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

	const [selectionGeometry, setSelectionGeometry] = createSignal<SelectionPosition | null>(null);
	const [scrolledUp, setScrolledUp] = createSignal(false);
	const [hasUnreadOutput, setHasUnreadOutput] = createSignal(false);

	let dragHandle: "start" | "end" | null = null;
	let dragInitialStart: [number, number] | null = null;
	let dragInitialEnd: [number, number] | null = null;

	const updateSelection = () => {
		if (!term || !host || !term.hasSelection()) {
			setSelectionGeometry(null);
			return;
		}
		setSelectionGeometry(getSelectionGeometry(term, host));
	};

	const onHandlePointerDown = (type: "start" | "end", event: PointerEvent) => {
		if (!term) return;
		event.preventDefault();
		event.stopPropagation();
		dragHandle = type;
		const pos = term.getSelectionPosition();
		if (pos) {
			dragInitialStart = [pos.start.x, pos.start.y];
			dragInitialEnd = [pos.end.x, pos.end.y];
		}
		hapticTick(14);
		window.addEventListener("pointermove", onHandlePointerMove);
		window.addEventListener("pointerup", onHandlePointerUp);
		window.addEventListener("pointercancel", onHandlePointerUp);
	};

	const onHandlePointerMove = (event: PointerEvent) => {
		if (!dragHandle || !host || !term) return;
		const { col, row } = getCellCoords(term, host, event.clientX, event.clientY);
		const bufferRow = term.buffer.active.viewportY + row - 1;
		const colIndex = col - 1;

		if (dragHandle === "start" && dragInitialEnd) {
			const range = computeSelectionRange(
				colIndex,
				bufferRow,
				dragInitialEnd[0],
				dragInitialEnd[1],
				term.cols,
			);
			term.select(range.col, range.row, range.length);
		} else if (dragHandle === "end" && dragInitialStart) {
			const range = computeSelectionRange(
				dragInitialStart[0],
				dragInitialStart[1],
				colIndex,
				bufferRow,
				term.cols,
			);
			term.select(range.col, range.row, range.length);
		}
		updateSelection();
	};

	const onHandlePointerUp = () => {
		dragHandle = null;
		dragInitialStart = null;
		dragInitialEnd = null;
		window.removeEventListener("pointermove", onHandlePointerMove);
		window.removeEventListener("pointerup", onHandlePointerUp);
		window.removeEventListener("pointercancel", onHandlePointerUp);
	};

	const copySelection = async () => {
		const text = term?.getSelection();
		if (!text) return;
		try {
			await navigator.clipboard.writeText(text);
			hapticTick(14);
		} catch {
			// Clipboard write refused
		}
		term?.clearSelection();
		updateSelection();
	};

	const pasteFromClipboard = async () => {
		try {
			const text = await navigator.clipboard.readText();
			if (text && term) {
				hapticTick(14);
				term.paste(text);
			}
		} catch {
			// Clipboard read refused
		}
		term?.clearSelection();
		updateSelection();
	};

	const selectAllText = () => {
		term?.selectAll();
		hapticTick(14);
		updateSelection();
	};

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
			onOutput: (bytes) => {
				terminal.write(bytes);
				if (terminal.buffer.active.viewportY < terminal.buffer.active.baseY) {
					setHasUnreadOutput(true);
				}
			},
			onState: (state) => props.onState(state),
			onTitle: (title) => props.onTitle(title),
			onExit: (code) => {
				terminal.write(`\r\n\x1b[2m[process exited with code ${code}]\x1b[0m\r\n`);
			},
		});

		const subscriptions = [
			terminal.onData((data) => live.send(applyModifiers(data, props.takeModifiers()))),
			terminal.onBinary((data) => live.send(data)),
			terminal.onResize(({ cols, rows }) => {
				live.resize(cols, rows);
				updateSelection();
			}),
			terminal.onScroll(() => {
				const isUp = terminal.buffer.active.viewportY < terminal.buffer.active.baseY;
				setScrolledUp(isUp);
				if (!isUp) setHasUnreadOutput(false);
				updateSelection();
			}),
			terminal.onSelectionChange(updateSelection),
			terminal.buffer.onBufferChange(updateSelection),
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

		// Native touch scrolling with momentum, SGR wheel tracking, and pinch zoom.
		const detachTouchScroll = attachTouchScroll({
			terminal,
			container: host,
			send: (data) => live.send(data),
			onFontSizeChange: props.onFontSizeChange,
		});

		// Long-press to select text (word boundary), tap elsewhere clears.
		let longPressTimer: number | null = null;
		let touchStartX = 0;
		let touchStartY = 0;

		const cancelLongPress = () => {
			if (longPressTimer !== null) {
				clearTimeout(longPressTimer);
				longPressTimer = null;
			}
		};

		const onTouchStartSelect = (event: TouchEvent) => {
			cancelLongPress();
			if (event.touches.length !== 1) return;
			const touch = event.touches[0];
			touchStartX = touch.clientX;
			touchStartY = touch.clientY;

			longPressTimer = window.setTimeout(() => {
				if (!terminal || !host) return;
				const rect = host.getBoundingClientRect();
				const dims = getCellDimensions(terminal, host);
				const relX = Math.max(0, touch.clientX - rect.left);
				const relY = Math.max(0, touch.clientY - rect.top);
				const col = Math.floor(relX / dims.width);
				const row = Math.floor(relY / dims.height);
				const bufferRow = terminal.buffer.active.viewportY + row;
				const line = terminal.buffer.active.getLine(bufferRow);
				if (line) {
					const text = line.translateToString(false);
					const { start, length } = findWordBounds(text, col);
					terminal.select(start, bufferRow, length);
					hapticTick(24);
					updateSelection();
				}
			}, 450);
		};

		const onTouchMoveSelect = (event: TouchEvent) => {
			if (longPressTimer === null || event.touches.length !== 1) return;
			const touch = event.touches[0];
			if (Math.hypot(touch.clientX - touchStartX, touch.clientY - touchStartY) > 8) {
				cancelLongPress();
			}
		};

		const onTouchEndSelect = (event: TouchEvent) => {
			cancelLongPress();
			// Tap elsewhere clears selection
			if (terminal.hasSelection() && event.changedTouches.length === 1) {
				const touch = event.changedTouches[0];
				if (Math.hypot(touch.clientX - touchStartX, touch.clientY - touchStartY) <= 6) {
					terminal.clearSelection();
					updateSelection();
				}
			}
		};

		host.addEventListener("touchstart", onTouchStartSelect, { passive: true });
		host.addEventListener("touchmove", onTouchMoveSelect, { passive: true });
		host.addEventListener("touchend", onTouchEndSelect, { passive: true });

		// Tap to focus without scrolling the page.
		const onPointerDownFocus = (event: PointerEvent) => {
			if (event.pointerType === "touch") {
				terminal.textarea?.focus({ preventScroll: true });
			}
		};
		host.addEventListener("pointerdown", onPointerDownFocus);

		const preventPageScroll = () => {
			if (window.scrollX !== 0 || window.scrollY !== 0) {
				window.scrollTo(0, 0);
			}
		};
		window.addEventListener("scroll", preventPageScroll, { passive: true });

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
			cancelLongPress();
			onHandlePointerUp();
			document.removeEventListener("visibilitychange", resume);
			window.removeEventListener("online", resume);
			window.removeEventListener("scroll", preventPageScroll);
			scheme.removeEventListener("change", retheme);
			appearance.disconnect();
			resize.disconnect();
			host?.removeEventListener("copy", onCopy);
			host?.removeEventListener("paste", onPaste);
			host?.removeEventListener("touchstart", onTouchStartSelect);
			host?.removeEventListener("touchmove", onTouchMoveSelect);
			host?.removeEventListener("touchend", onTouchEndSelect);
			host?.removeEventListener("pointerdown", onPointerDownFocus);
			for (const subscription of subscriptions) subscription.dispose();
			detachScrollbar();
			detachTouchScroll();
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

			{/* Floating selection action bar */}
			<Show when={selectionGeometry()?.actionBar.visible}>
				<div
					style={{
						left: `${selectionGeometry()?.actionBar.x ?? 0}px`,
						top: `${selectionGeometry()?.actionBar.y ?? 0}px`,
					}}
					role="toolbar"
					aria-label="Selection actions"
					class="pointer-events-auto absolute z-30 flex items-center gap-1 rounded-md border border-stroke bg-canvas/95 px-1 py-0.5 shadow-lg backdrop-blur-sm"
				>
					<button
						type="button"
						onClick={() => void copySelection()}
						class="focus-ring flex h-8 items-center gap-1 rounded px-2 text-ink text-ui-xs hover:bg-ink/10 active:bg-ink/15"
					>
						<CopyIcon class="size-3.5" />
						<span>Copy</span>
					</button>
					<button
						type="button"
						onClick={() => void pasteFromClipboard()}
						class="focus-ring flex h-8 items-center gap-1 rounded px-2 text-ink text-ui-xs hover:bg-ink/10 active:bg-ink/15"
					>
						<span>Paste</span>
					</button>
					<button
						type="button"
						onClick={selectAllText}
						class="focus-ring flex h-8 items-center gap-1 rounded px-2 text-ink text-ui-xs hover:bg-ink/10 active:bg-ink/15"
					>
						<span>Select all</span>
					</button>
				</div>
			</Show>

			{/* Selection drag handles for touch devices */}
			<Show when={selectionGeometry()?.startHandle.visible}>
				<div
					style={{
						left: `${selectionGeometry()?.startHandle.x ?? 0}px`,
						top: `${selectionGeometry()?.startHandle.y ?? 0}px`,
					}}
					aria-label="Selection start handle"
					class="pointer-events-auto absolute z-30 -translate-x-1/2 -translate-y-full touch-none select-none"
					onPointerDown={(e) => onHandlePointerDown("start", e)}
				>
					<div class="grid size-11 place-items-center">
						<div class="size-3 rounded-full bg-primary shadow ring-2 ring-canvas" />
					</div>
				</div>
			</Show>

			<Show when={selectionGeometry()?.endHandle.visible}>
				<div
					style={{
						left: `${selectionGeometry()?.endHandle.x ?? 0}px`,
						top: `${selectionGeometry()?.endHandle.y ?? 0}px`,
					}}
					aria-label="Selection end handle"
					class="pointer-events-auto absolute z-30 -translate-x-1/2 touch-none select-none"
					onPointerDown={(e) => onHandlePointerDown("end", e)}
				>
					<div class="grid size-11 place-items-center">
						<div class="size-3 rounded-full bg-primary shadow ring-2 ring-canvas" />
					</div>
				</div>
			</Show>

			{/* Floating "jump to bottom" pill when scrolled up while output arrives */}
			<Show when={scrolledUp() && hasUnreadOutput()}>
				<button
					type="button"
					aria-label="Jump to latest output"
					onClick={() => {
						hapticTick(14);
						term?.scrollToBottom();
						setHasUnreadOutput(false);
					}}
					class="focus-ring absolute right-6 bottom-4 z-20 flex items-center gap-1.5 rounded-full bg-ink px-3 py-1.5 font-sans text-canvas text-ui-xs shadow-lg transition-transform duration-fast ease-out-grid active:scale-95"
				>
					<ChevronDownIcon class="size-3.5" />
					<span>Latest output</span>
				</button>
			</Show>

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
