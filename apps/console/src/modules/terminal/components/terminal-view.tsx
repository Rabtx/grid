import type { JSX } from "@solidjs/web";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { WebglAddon } from "@xterm/addon-webgl";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import { createEffect, onSettled, untrack } from "solid-js";

import { useAuth } from "@/modules/auth";

import { type Arrow, arrowSequence, applyModifiers, type Modifiers } from "../lib/keys";
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

		props.onHandle({
			send: (data) => live.send(data),
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
		<div
			ref={(el) => {
				host = el;
			}}
			// xterm draws its own padding-free grid; the gutter keeps glyphs off the rounded edge.
			class="size-full overflow-hidden px-2 py-1.5"
			data-terminal={props.id}
		/>
	);
}

export type { ConnectionState };
