import type { JSX } from "@solidjs/web";
import { createMemo, createSignal, For, Match, onSettled, Show, Switch, untrack } from "solid-js";

import { evaluate } from "./visual-formula";

/**
 * Inline visuals: what an agent shows inside its reply (the runner's `show_visual` tool), drawn
 * with the kit in the reader's theme. The runner checks every spec before it is logged, so these
 * take the shapes as given; anything still unreadable draws nothing rather than breaking the
 * reply around it.
 */

export type VisualTone = "neutral" | "accent" | "success" | "warning" | "danger";

type Stats = {
	type: "stats";
	items: {
		label: string;
		value: string;
		detail?: string;
		trend?: "up" | "down" | "flat";
		tone?: VisualTone;
	}[];
};
type BarChart = {
	type: "bar-chart";
	title?: string;
	unit?: string;
	items: { label: string; value: number; baseline?: number; highlight?: boolean }[];
	sort?: "none" | "value";
	baselineLabel?: string;
	valueLabel?: string;
	better?: "lower" | "higher";
};
type LineChart = {
	type: "line-chart";
	title?: string;
	unit?: string;
	labels: string[];
	series: { name: string; values: (number | null)[] }[];
};
type Table = {
	type: "table";
	title?: string;
	columns: { label: string; format?: "text" | "number" | "percent" }[];
	rows: (string | number | null)[][];
	highlightRow?: number;
};
type List = {
	type: "list";
	title?: string;
	style?: "bullets" | "numbered" | "checklist" | "steps";
	items: {
		title: string;
		detail?: string;
		status?: "done" | "current" | "pending" | "failed";
		tone?: VisualTone;
	}[];
};
type Callout = {
	type: "callout";
	tone?: "info" | "success" | "warning" | "danger";
	title?: string;
	text: string;
};
type Compare = {
	type: "compare";
	options: {
		title: string;
		subtitle?: string;
		highlight?: boolean;
		points: { label: string; value: string }[];
	}[];
};
type Calculator = {
	type: "calculator";
	title?: string;
	inputs: {
		id: string;
		label: string;
		value: number;
		min?: number;
		max?: number;
		step?: number;
		unit?: string;
	}[];
	outputs: {
		id?: string;
		label: string;
		formula: string;
		unit?: string;
		prefix?: string;
		decimals?: number;
		emphasis?: boolean;
	}[];
};
type Choices = {
	type: "choices";
	prompt?: string;
	options: { label: string; description?: string; message?: string }[];
};
type Markdown = { type: "markdown"; text: string };

export type VisualLeaf =
	| Markdown
	| Stats
	| BarChart
	| LineChart
	| Table
	| List
	| Callout
	| Compare
	| Calculator
	| Choices;
export type VisualBlock =
	| VisualLeaf
	| { type: "tabs"; tabs: { label: string; blocks: VisualLeaf[] }[] };

const TONE_TEXT: Record<VisualTone, string> = {
	neutral: "text-fg",
	accent: "text-accent",
	success: "text-success",
	warning: "text-warning",
	danger: "text-danger",
};

const SERIES = [
	"stroke-accent",
	"stroke-violet",
	"stroke-success",
	"stroke-warning",
	"stroke-danger",
	"stroke-fg-subtle",
];
const SERIES_DOT = [
	"bg-accent",
	"bg-violet",
	"bg-success",
	"bg-warning",
	"bg-danger",
	"bg-fg-subtle",
];

function Caption(props: { children: JSX.Element }): JSX.Element {
	return <p class="text-caption text-fg-subtle">{props.children}</p>;
}

/** A number as a visual shows it: grouped thousands, at most two decimals. */
function figure(value: number, unit?: string): string {
	const text = value.toLocaleString(undefined, { maximumFractionDigits: 2 });
	return unit ? `${text}${unit === "%" ? "" : " "}${unit}` : text;
}

function StatsView(props: { block: Stats }): JSX.Element {
	return (
		<div class="grid grid-cols-2 gap-2 sm:grid-cols-3">
			<For each={props.block.items}>
				{(item) => (
					<div class="surface-card flex min-w-0 flex-col gap-0.5 p-3">
						<span class="truncate text-caption text-fg-subtle">{item.label}</span>
						<span
							class={`truncate text-headline tabular-nums ${TONE_TEXT[item.tone ?? "neutral"]}`}
						>
							{item.value}
						</span>
						<Show when={item.detail}>
							<span class="truncate text-caption text-fg-muted">
								{item.trend === "up" ? "↑ " : item.trend === "down" ? "↓ " : ""}
								{item.detail}
							</span>
						</Show>
					</div>
				)}
			</For>
		</div>
	);
}

function BarChartView(props: { block: BarChart }): JSX.Element {
	const items = () =>
		props.block.sort === "value"
			? [...props.block.items].sort((a, b) => b.value - a.value)
			: props.block.items;
	const top = () =>
		Math.max(
			...props.block.items.flatMap((item) => [Math.abs(item.value), Math.abs(item.baseline ?? 0)]),
			1e-9,
		);
	const changeTone = (item: BarChart["items"][number]) => {
		if (item.baseline === undefined || !props.block.better || item.baseline === item.value)
			return "text-fg-subtle";
		const better =
			props.block.better === "lower" ? item.value < item.baseline : item.value > item.baseline;
		return better ? "text-success" : "text-danger";
	};
	return (
		<div class="flex flex-col gap-2">
			<Show when={props.block.title}>
				<Caption>{props.block.title}</Caption>
			</Show>
			<Show when={props.block.baselineLabel || props.block.valueLabel}>
				<div class="flex gap-4 text-caption text-fg-muted">
					<span class="inline-flex items-center gap-1.5">
						<span aria-hidden="true" class="size-1.5 rounded-full bg-fg-subtle/40" />
						{props.block.baselineLabel ?? "Before"}
					</span>
					<span class="inline-flex items-center gap-1.5">
						<span aria-hidden="true" class="size-1.5 rounded-full bg-accent" />
						{props.block.valueLabel ?? "After"}
					</span>
				</div>
			</Show>
			<For each={items()}>
				{(item) => (
					<div class="grid grid-cols-3 items-center gap-2 sm:grid-cols-4">
						<span class="min-w-0 truncate text-caption text-fg-muted" title={item.label}>
							{item.label}
						</span>
						<span class="col-span-2 flex flex-col gap-0.5 sm:col-span-3">
							<Show when={item.baseline !== undefined}>
								<span
									aria-hidden="true"
									class="h-1.5 rounded-full bg-fg-subtle/40"
									style={{ width: `${(Math.abs(item.baseline ?? 0) / top()) * 100}%` }}
								/>
							</Show>
							<span class="flex items-center gap-2">
								<span
									aria-hidden="true"
									class={`h-2.5 rounded-full ${item.highlight ? "bg-accent" : "bg-accent/45"}`}
									style={{ width: `${Math.max(1, (Math.abs(item.value) / top()) * 85)}%` }}
								/>
								<span
									class={`shrink-0 text-caption tabular-nums ${item.baseline !== undefined ? changeTone(item) : "text-fg-muted"}`}
								>
									{figure(item.value, props.block.unit)}
								</span>
							</span>
						</span>
					</div>
				)}
			</For>
		</div>
	);
}

const WIDTH = 320;
const HEIGHT = 120;

function LineChartView(props: { block: LineChart }): JSX.Element {
	const range = createMemo(() => {
		const values = props.block.series.flatMap((series) =>
			series.values.filter((v): v is number => v !== null),
		);
		const low = Math.min(...values, 0);
		const high = Math.max(...values, low + 1e-9);
		return { low, high };
	});
	const x = (index: number) => (index / Math.max(1, props.block.labels.length - 1)) * WIDTH;
	const y = (value: number) =>
		HEIGHT - ((value - range().low) / (range().high - range().low)) * (HEIGHT - 8) - 4;
	// A gap (null) breaks the line into runs.
	const paths = (values: (number | null)[]) => {
		const runs: string[] = [];
		let run = "";
		values.forEach((value, index) => {
			if (value === null) {
				if (run) runs.push(run);
				run = "";
				return;
			}
			run += `${run ? "L" : "M"}${x(index).toFixed(1)},${y(value).toFixed(1)}`;
		});
		if (run) runs.push(run);
		return runs;
	};
	return (
		<div class="flex flex-col gap-2">
			<Show when={props.block.title}>
				<Caption>{props.block.title}</Caption>
			</Show>
			<svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} class="h-auto w-full max-w-full" aria-hidden="true">
				<line
					x1="0"
					x2={WIDTH}
					y1={HEIGHT - 4}
					y2={HEIGHT - 4}
					class="stroke-line"
					stroke-width="1"
				/>
				<For each={props.block.series}>
					{(series, index) => (
						<For each={paths(series.values)}>
							{(d) => (
								<path
									d={d}
									fill="none"
									stroke-width="2"
									stroke-linecap="round"
									stroke-linejoin="round"
									class={SERIES[index() % SERIES.length]}
								/>
							)}
						</For>
					)}
				</For>
			</svg>
			<div class="flex justify-between text-micro text-fg-subtle">
				<span>{props.block.labels[0]}</span>
				<span>
					{figure(range().low, props.block.unit)} – {figure(range().high, props.block.unit)}
				</span>
				<span>{props.block.labels.at(-1)}</span>
			</div>
			<Show when={props.block.series.length > 1}>
				<div class="flex flex-wrap gap-3 text-caption text-fg-muted">
					<For each={props.block.series}>
						{(series, index) => (
							<span class="inline-flex items-center gap-1.5">
								<span
									aria-hidden="true"
									class={`size-1.5 rounded-full ${SERIES_DOT[index() % SERIES_DOT.length]}`}
								/>
								{series.name}
							</span>
						)}
					</For>
				</div>
			</Show>
		</div>
	);
}

function TableView(props: { block: Table }): JSX.Element {
	const cell = (value: string | number | null, format?: Table["columns"][number]["format"]) => {
		if (value === null) return "—";
		if (typeof value === "number")
			return format === "percent" ? `${figure(value)}%` : figure(value);
		return value;
	};
	const numeric = (format?: string) => format === "number" || format === "percent";
	return (
		<div class="flex flex-col gap-2">
			<Show when={props.block.title}>
				<Caption>{props.block.title}</Caption>
			</Show>
			<div class="surface-card overflow-x-auto">
				<table class="w-full text-caption">
					<thead>
						<tr class="border-line border-b text-fg-subtle">
							<For each={props.block.columns}>
								{(column) => (
									<th
										class={`px-3 py-2 font-medium ${numeric(column.format) ? "text-right" : "text-left"}`}
									>
										{column.label}
									</th>
								)}
							</For>
						</tr>
					</thead>
					<tbody>
						<For each={props.block.rows}>
							{(row, index) => (
								<tr
									class={`border-line border-b last:border-b-0 ${index() === props.block.highlightRow ? "bg-accent/8 text-fg" : "text-fg-muted"}`}
								>
									<For each={row}>
										{(value, column) => {
											const format = () => props.block.columns[column()]?.format;
											return (
												<td
													class={`px-3 py-2 ${numeric(format()) ? "text-right tabular-nums" : ""}`}
												>
													{cell(value, format())}
												</td>
											);
										}}
									</For>
								</tr>
							)}
						</For>
					</tbody>
				</table>
			</div>
		</div>
	);
}

function ListView(props: { block: List }): JSX.Element {
	// What the agent marked done starts ticked; the reader's ticks are their own after that.
	const [ticked, setTicked] = createSignal<Set<number>>(
		untrack(
			() =>
				new Set(
					props.block.items.flatMap((item, index) => (item.status === "done" ? [index] : [])),
				),
		),
	);
	const style = () => props.block.style ?? "bullets";
	const mark = (item: List["items"][number], index: number) => {
		if (style() === "numbered") return `${index + 1}.`;
		if (style() === "steps")
			return item.status === "done"
				? "✓"
				: item.status === "failed"
					? "✕"
					: item.status === "current"
						? "●"
						: "○";
		return "•";
	};
	const markTone = (item: List["items"][number]) =>
		item.status === "done"
			? "text-success"
			: item.status === "failed"
				? "text-danger"
				: item.status === "current"
					? "text-accent"
					: TONE_TEXT[item.tone ?? "neutral"];
	return (
		<div class="flex flex-col gap-2">
			<Show when={props.block.title}>
				<Caption>{props.block.title}</Caption>
			</Show>
			<ul class="flex flex-col gap-1.5">
				<For each={props.block.items}>
					{(item, index) => (
						<li class="flex items-start gap-2">
							<Show
								when={style() === "checklist"}
								fallback={
									<span class={`w-4 shrink-0 text-center text-body ${markTone(item)}`}>
										{mark(item, index())}
									</span>
								}
							>
								<input
									type="checkbox"
									class="mt-1 size-4 shrink-0 accent-accent"
									checked={ticked().has(index())}
									aria-label={item.title}
									onChange={(event) => {
										const on = event.currentTarget.checked;
										setTicked((current) => {
											const next = new Set(current);
											if (on) next.add(index());
											else next.delete(index());
											return next;
										});
									}}
								/>
							</Show>
							<span class="flex min-w-0 flex-col">
								<span
									class={`text-body ${style() === "checklist" && ticked().has(index()) ? "text-fg-subtle line-through" : "text-fg"}`}
								>
									{item.title}
								</span>
								<Show when={item.detail}>
									<span class="text-caption text-fg-muted">{item.detail}</span>
								</Show>
							</span>
						</li>
					)}
				</For>
			</ul>
		</div>
	);
}

const CALLOUT: Record<NonNullable<Callout["tone"]>, string> = {
	info: "bg-accent/8 text-accent",
	success: "bg-success/10 text-success",
	warning: "bg-warning/12 text-warning",
	danger: "bg-danger/10 text-danger",
};

function CalloutView(props: { block: Callout }): JSX.Element {
	return (
		<div
			class={`flex flex-col gap-0.5 rounded-kit px-3 py-2.5 ${CALLOUT[props.block.tone ?? "info"]}`}
		>
			<Show when={props.block.title}>
				<span class="font-medium text-body">{props.block.title}</span>
			</Show>
			<span class="whitespace-pre-wrap text-body text-fg">{props.block.text}</span>
		</div>
	);
}

function CompareView(props: { block: Compare }): JSX.Element {
	return (
		<div
			class={`grid grid-cols-1 gap-2 ${props.block.options.length > 2 ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}
		>
			<For each={props.block.options}>
				{(option) => (
					<div
						class={`surface-card flex min-w-0 flex-col gap-2 p-3 ${option.highlight ? "ring-1 ring-accent" : ""}`}
					>
						<div class="flex flex-col">
							<span class="flex items-center gap-2 font-medium text-body text-fg">
								{option.title}
								<Show when={option.highlight}>
									<span class="rounded-kit-sm bg-accent/10 px-1.5 text-caption text-accent">
										Recommended
									</span>
								</Show>
							</span>
							<Show when={option.subtitle}>
								<span class="text-caption text-fg-subtle">{option.subtitle}</span>
							</Show>
						</div>
						<dl class="flex flex-col gap-1">
							<For each={option.points}>
								{(point) => (
									<div class="flex justify-between gap-3 text-caption">
										<dt class="text-fg-subtle">{point.label}</dt>
										<dd class="text-right text-fg">{point.value}</dd>
									</div>
								)}
							</For>
						</dl>
					</div>
				)}
			</For>
		</div>
	);
}

function CalculatorView(props: { block: Calculator }): JSX.Element {
	// The inputs start where the agent set them; the reader's edits are theirs after that.
	const [values, setValues] = createSignal<Record<string, number>>(
		untrack(() => Object.fromEntries(props.block.inputs.map((input) => [input.id, input.value]))),
	);
	const results = createMemo(() => {
		const known: Record<string, number> = { ...values() };
		return props.block.outputs.map((output) => {
			try {
				const value = evaluate(output.formula, known);
				if (output.id) known[output.id] = value;
				return Number.isFinite(value) ? value : null;
			} catch {
				return null;
			}
		});
	});
	return (
		<div class="surface-card flex flex-col gap-3 p-3">
			<Show when={props.block.title}>
				<Caption>{props.block.title}</Caption>
			</Show>
			<div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
				<For each={props.block.inputs}>
					{(input) => (
						<label class="flex flex-col gap-1">
							<span class="text-caption text-fg-subtle">
								{input.label}
								{input.unit ? ` (${input.unit})` : ""}
							</span>
							<input
								type="number"
								class="surface-field h-kit-control rounded-kit px-2.5 text-body text-fg tabular-nums"
								value={values()[input.id]}
								min={input.min}
								max={input.max}
								step={input.step ?? "any"}
								onInput={(event) => {
									const next = Number(event.currentTarget.value);
									if (Number.isFinite(next))
										setValues((current) => ({ ...current, [input.id]: next }));
								}}
							/>
						</label>
					)}
				</For>
			</div>
			<div class="flex flex-col gap-1 border-line border-t pt-2">
				<For each={props.block.outputs}>
					{(output, index) => (
						<div class="flex items-baseline justify-between gap-3">
							<span class="text-caption text-fg-muted">{output.label}</span>
							<span
								class={`tabular-nums ${output.emphasis ? "text-headline text-fg" : "text-body text-fg"}`}
							>
								{(() => {
									const value = results()[index()];
									if (value === null || value === undefined) return "—";
									const text = value.toLocaleString(undefined, {
										minimumFractionDigits: output.decimals ?? 0,
										maximumFractionDigits: output.decimals ?? 2,
									});
									return `${output.prefix ?? ""}${text}${output.unit ? ` ${output.unit}` : ""}`;
								})()}
							</span>
						</div>
					)}
				</For>
			</div>
		</div>
	);
}

function ChoicesView(props: { block: Choices; onChoose?: (message: string) => void }): JSX.Element {
	return (
		<div class="flex flex-col gap-2">
			<Show when={props.block.prompt}>
				<Caption>{props.block.prompt}</Caption>
			</Show>
			<div class="flex flex-wrap gap-2">
				<For each={props.block.options}>
					{(option) => (
						<button
							type="button"
							class="focus-ring surface-outline flex min-h-11 flex-col items-start rounded-kit px-3 py-1.5 text-left transition-colors duration-fast hover:bg-fill disabled:opacity-50 md:min-h-0"
							disabled={!props.onChoose}
							title={option.message ?? option.label}
							onClick={() => props.onChoose?.(option.message ?? option.label)}
						>
							<span class="text-body text-fg">{option.label}</span>
							<Show when={option.description}>
								<span class="text-caption text-fg-subtle">{option.description}</span>
							</Show>
						</button>
					)}
				</For>
			</div>
		</div>
	);
}

function Leaf(props: {
	block: VisualLeaf;
	onChoose?: (message: string) => void;
	markdown: (text: string) => JSX.Element;
}): JSX.Element {
	return (
		<Switch>
			<Match when={props.block.type === "markdown" && (props.block as Markdown)}>
				{(block) => props.markdown(block().text)}
			</Match>
			<Match when={props.block.type === "stats" && (props.block as Stats)}>
				{(block) => <StatsView block={block()} />}
			</Match>
			<Match when={props.block.type === "bar-chart" && (props.block as BarChart)}>
				{(block) => <BarChartView block={block()} />}
			</Match>
			<Match when={props.block.type === "line-chart" && (props.block as LineChart)}>
				{(block) => <LineChartView block={block()} />}
			</Match>
			<Match when={props.block.type === "table" && (props.block as Table)}>
				{(block) => <TableView block={block()} />}
			</Match>
			<Match when={props.block.type === "list" && (props.block as List)}>
				{(block) => <ListView block={block()} />}
			</Match>
			<Match when={props.block.type === "callout" && (props.block as Callout)}>
				{(block) => <CalloutView block={block()} />}
			</Match>
			<Match when={props.block.type === "compare" && (props.block as Compare)}>
				{(block) => <CompareView block={block()} />}
			</Match>
			<Match when={props.block.type === "calculator" && (props.block as Calculator)}>
				{(block) => <CalculatorView block={block()} />}
			</Match>
			<Match when={props.block.type === "choices" && (props.block as Choices)}>
				{(block) => <ChoicesView block={block()} onChoose={props.onChoose} />}
			</Match>
		</Switch>
	);
}

function TabsView(props: {
	tabs: { label: string; blocks: VisualLeaf[] }[];
	onChoose?: (message: string) => void;
	markdown: (text: string) => JSX.Element;
}): JSX.Element {
	const [current, setCurrent] = createSignal(0);
	return (
		<div class="flex flex-col gap-3">
			<div role="tablist" class="flex gap-1 overflow-x-auto border-line border-b">
				<For each={props.tabs}>
					{(tab, index) => (
						<button
							type="button"
							role="tab"
							aria-selected={current() === index() ? "true" : "false"}
							class={`focus-ring -mb-px min-h-11 shrink-0 border-b-2 px-2.5 text-body transition-colors duration-fast md:min-h-0 md:py-1.5 ${current() === index() ? "border-fg text-fg" : "border-transparent text-fg-subtle hover:text-fg"}`}
							onClick={() => setCurrent(index())}
						>
							{tab.label}
						</button>
					)}
				</For>
			</div>
			<For each={props.tabs[current()]?.blocks ?? []}>
				{(block) => <Leaf block={block} onChoose={props.onChoose} markdown={props.markdown} />}
			</For>
		</div>
	);
}

/**
 * An agent's visual drawn natively: its blocks in reading order. `onChoose` sends a choice's
 * message as the reader's next one; `markdown` draws a markdown block the way replies are drawn.
 */
export function InlineVisual(props: {
	title: string;
	blocks: VisualBlock[];
	onChoose?: (message: string) => void;
	markdown: (text: string) => JSX.Element;
}): JSX.Element {
	return (
		<figure class="flex flex-col gap-4" aria-label={props.title}>
			<For each={props.blocks}>
				{(block) => (
					<Show
						when={block.type === "tabs" && block}
						fallback={
							<Leaf
								block={block as VisualLeaf}
								onChoose={props.onChoose}
								markdown={props.markdown}
							/>
						}
					>
						{(tabs) => (
							<TabsView
								tabs={(tabs() as Extract<VisualBlock, { type: "tabs" }>).tabs}
								onChoose={props.onChoose}
								markdown={props.markdown}
							/>
						)}
					</Show>
				)}
			</For>
		</figure>
	);
}

/** The page's own theme, from the console's: the variables a visual's HTML is told it can use. */
function themeCss(): string {
	const root = getComputedStyle(document.documentElement);
	const body = getComputedStyle(document.body);
	const read = (name: string, fallback: string) => root.getPropertyValue(name).trim() || fallback;
	return `:root{color-scheme:light dark;--background:${body.backgroundColor};--foreground:${body.color};--muted:${read("--color-fg-subtle", "gray")};--border:${read("--color-line-strong", "gray")};--accent:${read("--color-accent", "royalblue")};font-family:${body.fontFamily};font-size:13px}body{margin:0;background:transparent;color:var(--foreground)}`;
}

// Nothing leaves the frame: no network, no forms, no frames inside it, no navigation away.
const CSP =
	"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; media-src data: blob:; form-action 'none'; frame-src 'none'; base-uri 'none'";

/** Tells Grid the page's height as it changes, so the frame fits its content. */
const SIZER = `<script>(()=>{const send=()=>parent.postMessage({gridVisualHeight:document.documentElement.scrollHeight},"*");new ResizeObserver(send).observe(document.documentElement);addEventListener("load",send);})()</script>`;

/** The page as the frame loads it: Grid's policy and theme first, then the agent's document. */
export function framedDocument(html: string, theme: string): string {
	return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${CSP}"><style>${theme}</style>${SIZER}</head><body>${html}</body></html>`;
}

/**
 * An agent's own HTML page, in a sandboxed frame: scripts run, but on an opaque origin with no
 * network, no storage of Grid's, no popups and no way to navigate the console. It grows to fit.
 */
export function VisualFrame(props: { title: string; html: string; height: number }): JSX.Element {
	let frame: HTMLIFrameElement | undefined;
	const [height, setHeight] = createSignal(props.height);
	onSettled(() => {
		const listen = (event: MessageEvent) => {
			if (event.source !== frame?.contentWindow) return;
			const asked = (event.data as { gridVisualHeight?: unknown } | null)?.gridVisualHeight;
			if (typeof asked === "number" && Number.isFinite(asked))
				setHeight(Math.min(1200, Math.max(80, Math.ceil(asked))));
		};
		window.addEventListener("message", listen);
		return () => window.removeEventListener("message", listen);
	});
	return (
		<iframe
			ref={(el) => {
				frame = el;
			}}
			title={props.title}
			sandbox="allow-scripts"
			referrerpolicy="no-referrer"
			srcdoc={framedDocument(props.html, themeCss())}
			class="w-full border-0"
			style={{ height: `${height()}px` }}
		/>
	);
}
