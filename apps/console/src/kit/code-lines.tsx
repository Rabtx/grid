import type { JSX } from "@solidjs/web";
import { createEffect, createSignal, For, onSettled, Show } from "solid-js";

/** How a line differs from the last commit: new, or changed. */
export type LineMark = "added" | "modified";

/** The lines picked by a selection, 1-based and inclusive. */
export type LineRange = { from: number; to: number };

/** Where the caret is in the code, 1-based, as a status bar says it ("Ln 9, Col 42"). */
export type Caret = { line: number; column: number };

/**
 * A file's lines to read (Figma 13 · Editor): a number gutter, a bar where a line differs from the
 * last commit (green when added, amber when changed), and the code, highlighted. Selecting text
 * lights the lines it covers and floats `actions` under them (Ask the agent, Explain).
 *
 * `lines` is HTML, one entry per line, already escaped or highlighted by the caller.
 */
export function CodeLines(props: {
	lines: readonly string[];
	marks?: ReadonlyMap<number, LineMark>;
	/** Shown under the selected lines while there is a selection. */
	actions?: (range: LineRange) => JSX.Element;
	onSelect?: (range: LineRange | null) => void;
	/** Where the caret (or a selection's moving end) is, whenever it moves within the code. */
	onCaret?: (caret: Caret) => void;
	label?: string;
}): JSX.Element {
	const [range, setRange] = createSignal<LineRange | null>(null);
	let frame: HTMLElement | undefined;

	/** The line an element (or text node) of the selection sits on. */
	function lineOf(node: Node | null): number | null {
		const element = node instanceof Element ? node : (node?.parentElement ?? null);
		const row = element?.closest<HTMLElement>("[data-line]");
		return row && frame?.contains(row) ? Number(row.dataset.line) : null;
	}

	onSettled(() => {
		const clear = () => {
			if (!range()) return;
			setRange(null);
			props.onSelect?.(null);
		};
		// The picked lines stay picked while the bar is used (a tap on it can collapse the
		// selection first); a new press in the code, or Escape, lets them go.
		const press = (event: PointerEvent) => {
			const target = event.target as Element | null;
			if (frame?.contains(target) && !target?.closest("[data-ask-bar]")) clear();
		};
		const escape = (event: KeyboardEvent) => {
			if (event.key === "Escape") clear();
		};
		const read = () => {
			const selection = document.getSelection();
			if (selection && selection.rangeCount > 0) caretAt(selection);
			if (!selection || selection.isCollapsed || selection.rangeCount === 0) return;
			const start = lineOf(selection.anchorNode);
			const end = lineOf(selection.focusNode);
			if (start === null || end === null) return;
			const next = { from: Math.min(start, end), to: Math.max(start, end) };
			const current = range();
			if (current?.from === next.from && current?.to === next.to) return;
			setRange(next);
			props.onSelect?.(next);
		};
		document.addEventListener("selectionchange", read);
		document.addEventListener("pointerdown", press);
		document.addEventListener("keydown", escape);
		return () => {
			document.removeEventListener("selectionchange", read);
			document.removeEventListener("pointerdown", press);
			document.removeEventListener("keydown", escape);
		};
	});

	/** The caret's line and column: characters of the line's code before the selection's focus. */
	function caretAt(selection: Selection): void {
		const line = lineOf(selection.focusNode);
		const node = selection.focusNode;
		if (line === null || !node || !props.onCaret) return;
		const code = frame?.querySelector(`[data-line="${line}"] code`);
		let column = 1;
		if (code?.contains(node)) {
			const before = document.createRange();
			before.setStart(code, 0);
			before.setEnd(node, selection.focusOffset);
			column = before.toString().length + 1;
		}
		props.onCaret({ line, column });
	}

	const inRange = (line: number) => {
		const current = range();
		return current !== null && line >= current.from && line <= current.to;
	};

	return (
		<section
			ref={(el) => {
				frame = el;
			}}
			aria-label={props.label ?? "Code"}
			class="code-lines min-w-0 py-3 font-mono text-body leading-6"
		>
			<For each={props.lines}>
				{(html, index) => {
					const line = () => index() + 1;
					const mark = () => props.marks?.get(line());
					return (
						<>
							<div
								data-line={line()}
								class={`relative flex min-w-0 ${inRange(line()) ? "bg-accent/10" : ""}`}
							>
								<span
									aria-hidden="true"
									class={`w-0.5 shrink-0 ${mark() === "added" ? "bg-success" : mark() === "modified" ? "bg-warning" : ""}`}
								/>
								<span
									aria-hidden="true"
									class={`w-12 shrink-0 select-none pr-4 text-right tabular-nums ${inRange(line()) ? "text-fg" : "text-fg-faint"}`}
								>
									{line()}
								</span>
								<code
									class="min-w-0 flex-1 whitespace-pre pr-6 text-fg"
									style={{ "tab-size": 4 }}
									innerHTML={html || " "}
								/>
							</div>
							<Show when={props.actions && range()?.to === line() ? range() : null}>
								{(picked) => (
									<div data-ask-bar class="sticky left-0 z-10 flex justify-center py-1">
										{props.actions?.(picked())}
									</div>
								)}
							</Show>
						</>
					);
				}}
			</For>
		</section>
	);
}

/** The floating bar under selected lines: a primary ask and quieter actions beside it. */
export function CodeAskBar(props: { children: JSX.Element }): JSX.Element {
	return (
		<div class="surface-card flex items-center gap-1 rounded-full p-1 font-kit text-body">
			{props.children}
		</div>
	);
}

/** A button on the selection bar; `primary` is the filled one (Ask the agent). */
export function CodeAskAction(props: {
	onClick: () => void;
	primary?: boolean;
	icon?: JSX.Element;
	children: JSX.Element;
}): JSX.Element {
	return (
		<button
			type="button"
			// Keep the selection: the press must not move focus out of the code first.
			onMouseDown={(event) => event.preventDefault()}
			onClick={() => props.onClick()}
			class={`focus-ring flex h-8 items-center gap-1.5 rounded-full px-3 transition-colors duration-fast ${props.primary ? "bg-inverse text-inverse-fg" : "text-fg-muted hover:bg-fill hover:text-fg"} pointer-coarse:h-10 [&_svg]:size-3.5`}
		>
			{props.icon}
			{props.children}
		</button>
	);
}

/**
 * Along the foot of an open file (Figma 13 · Editor): where the work is on the left (the branch,
 * how much is changed), what the file is on the right (its language, the machine).
 */
export function StatusStrip(props: { start: JSX.Element; end?: JSX.Element }): JSX.Element {
	return (
		<div class="hidden h-8 shrink-0 items-center gap-4 border-line border-t px-4 text-caption text-fg-subtle md:flex [&_svg]:size-3.5">
			<span class="flex min-w-0 items-center gap-4">{props.start}</span>
			<span class="flex-1" />
			<span class="flex min-w-0 items-center gap-4">{props.end}</span>
		</div>
	);
}

/** Pixels a minimap line takes at most, and the width of one character in it. */
const MAP_LINE = 3;
const MAP_CHAR = 0.75;

/**
 * A file at a glance beside its code (Figma 13 · Editor, desktop): each line a sliver as long as
 * the line, the lines changed since the last commit marked on its edge, and the part on screen
 * framed. Pressing or dragging on it scrolls the code there.
 */
export function CodeMinimap(props: {
	text: string;
	marks?: ReadonlyMap<number, LineMark>;
	/** The element the code scrolls in. */
	scroller: HTMLElement | undefined;
}): JSX.Element {
	let canvas: HTMLCanvasElement | undefined;
	let ink: HTMLSpanElement | undefined;
	let added: HTMLSpanElement | undefined;
	let modified: HTMLSpanElement | undefined;
	const [view, setView] = createSignal({ top: 0, height: 0 });

	function draw(): void {
		const scroller = props.scroller;
		if (!canvas || !scroller || !ink || !added || !modified) return;
		const lines = props.text.split("\n");
		const height = Math.max(1, Math.min(scroller.clientHeight, lines.length * MAP_LINE));
		const width = canvas.clientWidth || 64;
		const ratio = window.devicePixelRatio || 1;
		canvas.width = Math.round(width * ratio);
		canvas.height = Math.round(height * ratio);
		canvas.style.height = `${height}px`;
		const context = canvas.getContext("2d");
		if (!context) return;
		context.scale(ratio, ratio);
		context.clearRect(0, 0, width, height);
		const step = height / lines.length;
		const colours = {
			ink: getComputedStyle(ink).color,
			added: getComputedStyle(added).color,
			modified: getComputedStyle(modified).color,
		};
		lines.forEach((line, index) => {
			const y = index * step;
			const mark = props.marks?.get(index + 1);
			if (mark) {
				context.fillStyle = mark === "added" ? colours.added : colours.modified;
				context.fillRect(0, y, 2, Math.max(1, step));
			}
			const text = line.replace(/\t/g, "    ");
			const indent = text.length - text.trimStart().length;
			const length = text.trim().length;
			if (!length) return;
			context.fillStyle = colours.ink;
			context.fillRect(
				6 + indent * MAP_CHAR,
				y + step * 0.2,
				Math.min(length * MAP_CHAR, width - 8 - indent * MAP_CHAR),
				Math.max(1, step * 0.6),
			);
		});
		measure();
	}

	/** The part of the file on screen, as a share of the map. */
	function measure(): void {
		const scroller = props.scroller;
		if (!scroller || !canvas) return;
		const map = canvas.clientHeight;
		const total = Math.max(1, scroller.scrollHeight);
		setView({
			top: (scroller.scrollTop / total) * map,
			height: Math.min(map, (scroller.clientHeight / total) * map),
		});
	}

	function scrollTo(event: PointerEvent): void {
		const scroller = props.scroller;
		if (!scroller || !canvas) return;
		const box = canvas.getBoundingClientRect();
		const share = Math.min(1, Math.max(0, (event.clientY - box.top) / Math.max(1, box.height)));
		scroller.scrollTop = share * scroller.scrollHeight - scroller.clientHeight / 2;
	}

	createEffect(
		() => [props.text, props.marks, props.scroller] as const,
		([, , scroller]) => {
			if (!scroller) return;
			draw();
			const resized = new ResizeObserver(() => draw());
			resized.observe(scroller);
			// The colours follow the theme: draw again when it changes.
			const themed = new MutationObserver(() => draw());
			themed.observe(document.documentElement, { attributes: true });
			scroller.addEventListener("scroll", measure, { passive: true });
			return () => {
				resized.disconnect();
				themed.disconnect();
				scroller.removeEventListener("scroll", measure);
			};
		},
	);

	return (
		<div aria-hidden="true" class="relative hidden w-16 shrink-0 border-line border-l lg:block">
			<span
				ref={(el) => {
					ink = el;
				}}
				class="hidden text-fg-faint"
			/>
			<span
				ref={(el) => {
					added = el;
				}}
				class="hidden text-success"
			/>
			<span
				ref={(el) => {
					modified = el;
				}}
				class="hidden text-warning"
			/>
			<canvas
				ref={(el) => {
					canvas = el;
				}}
				class="block w-full cursor-pointer touch-none"
				onPointerDown={(event) => {
					event.currentTarget.setPointerCapture(event.pointerId);
					scrollTo(event);
				}}
				onPointerMove={(event) => {
					if (event.currentTarget.hasPointerCapture(event.pointerId)) scrollTo(event);
				}}
			/>
			<span
				class="pointer-events-none absolute inset-x-0 bg-fill-strong"
				style={{ top: `${view().top}px`, height: `${view().height}px` }}
			/>
		</div>
	);
}

/** A run of lines written in one commit, and who wrote it, for `BlameLines`. */
export type BlameBlock = {
	from: number;
	to: number;
	/** The author's or agent's mark. */
	who: JSX.Element;
	subject: string;
	/** When, already worded ("2m ago"). */
	when: string;
	/** Read aloud for the run: who, what and when in one sentence. */
	label: string;
};

/**
 * A file's lines with who wrote them (Figma 13 · Editor, Blame): each run of lines from one commit
 * under its author or agent, the commit's subject and when. On desktop the story sits in a column
 * beside the lines; on phones it heads each run.
 */
export function BlameLines(props: {
	lines: readonly string[];
	blocks: readonly BlameBlock[];
	label?: string;
}): JSX.Element {
	return (
		<section
			aria-label={props.label ?? "Blame"}
			class="code-lines min-w-0 py-3 font-mono text-body leading-6"
		>
			<For each={props.blocks}>
				{(block) => (
					<div class="flex min-w-0 flex-col border-line border-t first:border-t-0 md:flex-row">
						<div
							title={block.label}
							class="flex min-w-0 px-4 pt-2 pb-1 font-kit text-caption text-fg-subtle md:w-72 md:shrink-0 md:self-stretch md:border-line md:border-r md:py-0 [&_svg]:size-3.5"
						>
							<span class="sr-only">{block.label}</span>
							<span aria-hidden="true" class="flex min-w-0 flex-1 items-center gap-2 md:h-6">
								{block.who}
								<span class="truncate text-fg-muted">{block.subject}</span>
								<span class="ml-auto shrink-0 tabular-nums">{block.when}</span>
							</span>
						</div>
						<div class="min-w-0 flex-1">
							<For each={props.lines.slice(block.from - 1, block.to)}>
								{(html, index) => (
									<div class="flex min-w-0">
										<span
											aria-hidden="true"
											class="w-12 shrink-0 select-none pr-4 text-right text-fg-faint tabular-nums"
										>
											{block.from + index()}
										</span>
										<code
											class="min-w-0 flex-1 whitespace-pre pr-6 text-fg"
											style={{ "tab-size": 4 }}
											innerHTML={html || " "}
										/>
									</div>
								)}
							</For>
						</div>
					</div>
				)}
			</For>
		</section>
	);
}
