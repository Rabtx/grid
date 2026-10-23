/**
 * Inline visuals: what an agent shows inside its reply through Grid's `show_visual` tool. Usually
 * a list of typed blocks (stats, charts, tables, lists, comparisons, calculators, choices, tabs)
 * the console draws with its own components; for what blocks cannot draw, one self-contained
 * HTML page, which the console runs in a sandboxed frame with no network and no way out.
 *
 * Everything an agent sends is checked here before it reaches the log: a visual that passes is
 * one the console can draw as the agent meant, and an error names the block that was wrong.
 */

export const MAX_BLOCKS = 16;
export const MAX_SPEC_BYTES = 64 * 1024;
export const MAX_HTML_BYTES = 256 * 1024;
/** A turn that keeps publishing visuals is almost certainly looping. */
export const VISUALS_PER_TURN = 6;
const MIN_HEIGHT = 80;
const MAX_HEIGHT = 1200;
const DEFAULT_HEIGHT = 360;

export class VisualError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "VisualError";
	}
}

const TONES = ["neutral", "accent", "success", "warning", "danger"] as const;

type Fields = Record<string, unknown>;

function object(value: unknown, at: string): Fields {
	if (!value || typeof value !== "object" || Array.isArray(value))
		throw new VisualError(`${at} must be an object`);
	return value as Fields;
}

function text(fields: Fields, key: string, at: string, max: number): string {
	const value = fields[key];
	if (typeof value !== "string" || !value.trim())
		throw new VisualError(`${at}.${key} must be a non-empty string`);
	if (value.length > max) throw new VisualError(`${at}.${key} is longer than ${max} characters`);
	return value.trim();
}

function maybeText(fields: Fields, key: string, at: string, max: number): string | undefined {
	return fields[key] === undefined || fields[key] === null ? undefined : text(fields, key, at, max);
}

function number(fields: Fields, key: string, at: string): number {
	const value = fields[key];
	if (typeof value !== "number" || !Number.isFinite(value))
		throw new VisualError(`${at}.${key} must be a number`);
	return value;
}

function maybeNumber(fields: Fields, key: string, at: string): number | undefined {
	return fields[key] === undefined || fields[key] === null ? undefined : number(fields, key, at);
}

function oneOf<T extends string>(fields: Fields, key: string, at: string, allowed: readonly T[]) {
	const value = fields[key];
	if (value === undefined || value === null) return undefined;
	if (typeof value !== "string" || !allowed.includes(value as T))
		throw new VisualError(`${at}.${key} must be one of ${allowed.join(", ")}`);
	return value as T;
}

function list(fields: Fields, key: string, at: string, min: number, max: number): unknown[] {
	const value = fields[key];
	if (!Array.isArray(value)) throw new VisualError(`${at}.${key} must be a list`);
	if (value.length < min || value.length > max)
		throw new VisualError(`${at}.${key} must have ${min} to ${max} items`);
	return value;
}

/** Leaves out the keys a block did not set, so the stored spec stays small. */
function compact<T extends Fields>(fields: T): T {
	return Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined)) as T;
}

const ID = /^[A-Za-z_][A-Za-z0-9_]{0,31}$/;
// What a calculator's formula may hold: names, numbers, operators, parentheses, commas.
const FORMULA = /^[A-Za-z0-9_\s.+\-*/%^(),]+$/;

function leaf(raw: unknown, at: string): Fields {
	const block = object(raw, at);
	switch (block.type) {
		case "markdown":
			return { type: "markdown", text: text(block, "text", at, 8_000) };
		case "stats":
			return {
				type: "stats",
				items: list(block, "items", at, 1, 6).map((item, i) => {
					const where = `${at}.items[${i}]`;
					const fields = object(item, where);
					return compact({
						label: text(fields, "label", where, 60),
						value: text(fields, "value", where, 40),
						detail: maybeText(fields, "detail", where, 80),
						trend: oneOf(fields, "trend", where, ["up", "down", "flat"] as const),
						tone: oneOf(fields, "tone", where, TONES),
					});
				}),
			};
		case "bar-chart":
			return compact({
				type: "bar-chart",
				title: maybeText(block, "title", at, 120),
				unit: maybeText(block, "unit", at, 12),
				items: list(block, "items", at, 1, 40).map((item, i) => {
					const where = `${at}.items[${i}]`;
					const fields = object(item, where);
					return compact({
						label: text(fields, "label", where, 60),
						value: number(fields, "value", where),
						baseline: maybeNumber(fields, "baseline", where),
						highlight: fields.highlight === true ? true : undefined,
					});
				}),
				sort: oneOf(block, "sort", at, ["none", "value"] as const),
				baselineLabel: maybeText(block, "baselineLabel", at, 24),
				valueLabel: maybeText(block, "valueLabel", at, 24),
				better: oneOf(block, "better", at, ["lower", "higher"] as const),
			});
		case "line-chart": {
			const labels = list(block, "labels", at, 2, 200).map((label, i) => {
				if (typeof label !== "string" || !label.trim() || label.length > 24)
					throw new VisualError(`${at}.labels[${i}] must be a short string`);
				return label.trim();
			});
			return compact({
				type: "line-chart",
				title: maybeText(block, "title", at, 120),
				unit: maybeText(block, "unit", at, 12),
				labels,
				series: list(block, "series", at, 1, 6).map((item, i) => {
					const where = `${at}.series[${i}]`;
					const fields = object(item, where);
					const values = list(fields, "values", where, labels.length, labels.length).map(
						(value, j) => {
							if (value === null) return null;
							if (typeof value !== "number" || !Number.isFinite(value))
								throw new VisualError(`${where}.values[${j}] must be a number or null`);
							return value;
						},
					);
					return { name: text(fields, "name", where, 40), values };
				}),
			});
		}
		case "table": {
			const columns = list(block, "columns", at, 1, 10).map((item, i) => {
				const where = `${at}.columns[${i}]`;
				const fields = object(item, where);
				return compact({
					label: text(fields, "label", where, 60),
					format: oneOf(fields, "format", where, ["text", "number", "percent"] as const),
				});
			});
			const rows = list(block, "rows", at, 1, 200).map((row, i) => {
				if (!Array.isArray(row) || row.length !== columns.length)
					throw new VisualError(`${at}.rows[${i}] must have one cell per column`);
				return row.map((cell, j) => {
					if (cell === null) return null;
					if (typeof cell === "number" && Number.isFinite(cell)) return cell;
					if (typeof cell === "string" && cell.length <= 400) return cell;
					throw new VisualError(`${at}.rows[${i}][${j}] must be text, a number or null`);
				});
			});
			const highlight = maybeNumber(block, "highlightRow", at);
			return compact({
				type: "table",
				title: maybeText(block, "title", at, 120),
				columns,
				rows,
				highlightRow:
					highlight !== undefined &&
					Number.isInteger(highlight) &&
					highlight >= 0 &&
					highlight < rows.length
						? highlight
						: undefined,
			});
		}
		case "list":
			return compact({
				type: "list",
				title: maybeText(block, "title", at, 120),
				style: oneOf(block, "style", at, ["bullets", "numbered", "checklist", "steps"] as const),
				items: list(block, "items", at, 1, 40).map((item, i) => {
					const where = `${at}.items[${i}]`;
					const fields = object(item, where);
					return compact({
						title: text(fields, "title", where, 200),
						detail: maybeText(fields, "detail", where, 400),
						status: oneOf(fields, "status", where, [
							"done",
							"current",
							"pending",
							"failed",
						] as const),
						tone: oneOf(fields, "tone", where, TONES),
					});
				}),
			});
		case "callout":
			return compact({
				type: "callout",
				tone: oneOf(block, "tone", at, ["info", "success", "warning", "danger"] as const),
				title: maybeText(block, "title", at, 120),
				text: text(block, "text", at, 1_000),
			});
		case "compare":
			return {
				type: "compare",
				options: list(block, "options", at, 2, 4).map((item, i) => {
					const where = `${at}.options[${i}]`;
					const fields = object(item, where);
					return compact({
						title: text(fields, "title", where, 60),
						subtitle: maybeText(fields, "subtitle", where, 80),
						highlight: fields.highlight === true ? true : undefined,
						points: list(fields, "points", where, 1, 12).map((point, j) => {
							const pointAt = `${where}.points[${j}]`;
							const pointFields = object(point, pointAt);
							return {
								label: text(pointFields, "label", pointAt, 60),
								value: text(pointFields, "value", pointAt, 120),
							};
						}),
					});
				}),
			};
		case "calculator": {
			const names = new Set<string>();
			const inputs = list(block, "inputs", at, 1, 8).map((item, i) => {
				const where = `${at}.inputs[${i}]`;
				const fields = object(item, where);
				const id = text(fields, "id", where, 32);
				if (!ID.test(id) || names.has(id))
					throw new VisualError(`${where}.id must be a unique name of letters, digits and _`);
				names.add(id);
				const step = maybeNumber(fields, "step", where);
				if (step !== undefined && step <= 0) throw new VisualError(`${where}.step must be above 0`);
				return compact({
					id,
					label: text(fields, "label", where, 60),
					value: number(fields, "value", where),
					min: maybeNumber(fields, "min", where),
					max: maybeNumber(fields, "max", where),
					step,
					unit: maybeText(fields, "unit", where, 12),
				});
			});
			const outputs = list(block, "outputs", at, 1, 8).map((item, i) => {
				const where = `${at}.outputs[${i}]`;
				const fields = object(item, where);
				const id = maybeText(fields, "id", where, 32);
				const formula = text(fields, "formula", where, 300);
				if (!FORMULA.test(formula))
					throw new VisualError(`${where}.formula may use names, numbers, + - * / % ^ and ( )`);
				for (const name of formula.match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? []) {
					if (!names.has(name) && !FUNCTIONS.has(name))
						throw new VisualError(
							`${where}.formula uses ${name}, which is not an input or an output above it`,
						);
				}
				if (id !== undefined) {
					if (!ID.test(id) || names.has(id))
						throw new VisualError(`${where}.id must be a unique name of letters, digits and _`);
					names.add(id);
				}
				const decimals = maybeNumber(fields, "decimals", where);
				return compact({
					id,
					label: text(fields, "label", where, 60),
					formula,
					unit: maybeText(fields, "unit", where, 12),
					prefix: maybeText(fields, "prefix", where, 4),
					decimals:
						decimals !== undefined ? Math.min(6, Math.max(0, Math.round(decimals))) : undefined,
					emphasis: fields.emphasis === true ? true : undefined,
				});
			});
			return compact({
				type: "calculator",
				title: maybeText(block, "title", at, 120),
				inputs,
				outputs,
			});
		}
		case "choices":
			return compact({
				type: "choices",
				prompt: maybeText(block, "prompt", at, 200),
				options: list(block, "options", at, 1, 6).map((item, i) => {
					const where = `${at}.options[${i}]`;
					const fields = object(item, where);
					return compact({
						label: text(fields, "label", where, 80),
						description: maybeText(fields, "description", where, 160),
						message: maybeText(fields, "message", where, 1_000),
					});
				}),
			});
		default:
			throw new VisualError(`${at}.type ${JSON.stringify(block.type)} is not a block Grid draws`);
	}
}

/** The functions a calculator's formulas may call. */
export const FUNCTIONS = new Set(["min", "max", "round", "floor", "ceil", "abs", "sqrt"]);

/** Check an agent's blocks and return them as they are kept: trimmed, unset keys left out. */
export function readBlocks(raw: unknown): Fields[] {
	if (!Array.isArray(raw) || raw.length < 1 || raw.length > MAX_BLOCKS)
		throw new VisualError(`blocks must be a list of 1 to ${MAX_BLOCKS} blocks`);
	const blocks = raw.map((item, i) => {
		const at = `blocks[${i}]`;
		const block = object(item, at);
		if (block.type !== "tabs") return leaf(block, at);
		// Tabs hold leaf blocks only, so a spec stays one level deep.
		return {
			type: "tabs",
			tabs: list(block, "tabs", at, 2, 6).map((tab, j) => {
				const where = `${at}.tabs[${j}]`;
				const fields = object(tab, where);
				return {
					label: text(fields, "label", where, 40),
					blocks: list(fields, "blocks", where, 1, MAX_BLOCKS).map((inner, k) =>
						leaf(inner, `${where}.blocks[${k}]`),
					),
				};
			}),
		};
	});
	const size = new TextEncoder().encode(JSON.stringify(blocks)).length;
	if (size > MAX_SPEC_BYTES)
		throw new VisualError(
			`The blocks are ${Math.ceil(size / 1024)} KB; the limit is ${MAX_SPEC_BYTES / 1024} KB. Show fewer rows or points.`,
		);
	return blocks;
}

/** A visual as the `visual` event carries it. */
export type Visual =
	| { title: string; format: "components"; blocks: Fields[] }
	| { title: string; format: "html"; html: string; height: number };

/** The tool's arguments as a visual: a title, and exactly one of `blocks` or `html`. */
export function readVisual(args: Fields): Visual {
	const title =
		typeof args.title === "string"
			? args.title
					.replace(/[\x00-\x1f\x7f]+/g, " ")
					.replace(/\s+/g, " ")
					.trim()
			: "";
	if (!title || title.length > 120) throw new VisualError("title must be 1 to 120 characters");
	const hasBlocks = args.blocks !== undefined && args.blocks !== null;
	const hasHtml = args.html !== undefined && args.html !== null;
	if (hasBlocks === hasHtml) throw new VisualError('Send exactly one of "blocks" or "html"');
	if (hasBlocks) return { title, format: "components", blocks: readBlocks(args.blocks) };
	if (typeof args.html !== "string" || !args.html.trim())
		throw new VisualError("html must be a complete HTML document");
	const size = new TextEncoder().encode(args.html).length;
	if (size > MAX_HTML_BYTES)
		throw new VisualError(
			`The page is ${Math.ceil(size / 1024)} KB; the limit is ${MAX_HTML_BYTES / 1024} KB.`,
		);
	const asked =
		typeof args.height === "number" && Number.isFinite(args.height) ? args.height : DEFAULT_HEIGHT;
	return {
		title,
		format: "html",
		html: args.html,
		height: Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, Math.round(asked))),
	};
}

/** What the tool tells an agent about itself. */
export const SHOW_VISUAL_DESCRIPTION = [
	"Show a finished visual inside your reply in Grid: stats, a chart, a table, a comparison, a checklist, a small calculator, or follow-up choices. Use it only when a visual reads faster than text.",
	"Call it before writing the reply; the reader sees it above your text, so keep the text brief: state the key finding and do not describe the visual.",
	"Send blocks, a list of components Grid draws in its own theme. Block types (field? is optional):",
	"markdown {text}.",
	"stats {items:[{label, value, detail?, trend?: up|down|flat, tone?}]} 1-6 headline numbers.",
	"bar-chart {title?, unit?, items:[{label, value, baseline?, highlight?}], sort?: none|value, baselineLabel?, valueLabel?, better?: lower|higher}; for before/after give the old value as baseline.",
	"line-chart {title?, unit?, labels:[x labels], series:[{name, values:[number|null per label]}]}.",
	"table {title?, columns:[{label, format?: text|number|percent}], rows:[[cell per column]], highlightRow?}.",
	"list {title?, style?: bullets|numbered|checklist|steps, items:[{title, detail?, status?: done|current|pending|failed, tone?}]}.",
	"callout {tone?: info|success|warning|danger, title?, text}.",
	"compare {options:[{title, subtitle?, highlight?, points:[{label, value}]}]} 2-4 options; highlight the recommended one.",
	"calculator {title?, inputs:[{id, label, value, min?, max?, step?, unit?}], outputs:[{id?, label, formula, prefix?, unit?, decimals?, emphasis?}]}; formulas use input ids and earlier output ids with + - * / % ^, parentheses, min max round floor ceil abs sqrt.",
	"choices {prompt?, options:[{label, description?, message?}]} 1-6 next steps; a click sends message (default label) as the reader's next message.",
	"tabs {tabs:[{label, blocks:[...]}]} 2-6 views; tabs hold any block except tabs.",
	"tone is neutral, accent, success, warning or danger; accent marks the one thing that matters.",
	"Send html instead of blocks only for what blocks cannot draw (a diagram, a custom interactive view): one self-contained HTML document with inline <style> and <script>. Network loads are blocked, so draw with inline SVG or canvas and embed images as data: URIs. CSS variables --background --foreground --muted --border --accent follow Grid's theme.",
	`At most ${VISUALS_PER_TURN} visuals per turn.`,
].join(" ");
