import type { JSX } from "@solidjs/web";
import { createSignal, For, onSettled, Show } from "solid-js";

/** How a line differs from the last commit: new, or changed. */
export type LineMark = "added" | "modified";

/** The lines picked by a selection, 1-based and inclusive. */
export type LineRange = { from: number; to: number };

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
