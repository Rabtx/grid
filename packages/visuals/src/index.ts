/**
 * Inline visuals: what an agent shows inside its reply. Usually a list of typed blocks (stats,
 * charts, tables, lists, comparisons, timelines, progress, calculators, choices, tabs) the console
 * draws with its own components; for what blocks cannot draw, one self-contained HTML page, which
 * the console runs in a sandboxed frame with no network and no way out.
 *
 * Two ways in, so every agent can use them whatever it supports: Grid's `show_visual` tool, for
 * agents that call Grid's tools, and a ```grid-visual fence of JSON in the reply itself, which any
 * model that writes markdown can produce. Both are checked here — by the runner for the tool, by
 * the console for a fence — so a visual that passes is one the console can draw as the agent
 * meant, and an error names the block that was wrong.
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
		case "progress":
			return compact({
				type: "progress",
				title: maybeText(block, "title", at, 120),
				items: list(block, "items", at, 1, 12).map((item, i) => {
					const where = `${at}.items[${i}]`;
					const fields = object(item, where);
					const max = maybeNumber(fields, "max", where);
					if (max !== undefined && max <= 0) throw new VisualError(`${where}.max must be above 0`);
					return compact({
						label: text(fields, "label", where, 60),
						value: number(fields, "value", where),
						max,
						unit: maybeText(fields, "unit", where, 12),
						tone: oneOf(fields, "tone", where, TONES),
					});
				}),
			});
		case "timeline":
			return compact({
				type: "timeline",
				title: maybeText(block, "title", at, 120),
				items: list(block, "items", at, 1, 24).map((item, i) => {
					const where = `${at}.items[${i}]`;
					const fields = object(item, where);
					return compact({
						time: maybeText(fields, "time", where, 40),
						title: text(fields, "title", where, 160),
						detail: maybeText(fields, "detail", where, 400),
						tone: oneOf(fields, "tone", where, TONES),
					});
				}),
			});
		case "donut": {
			const items = list(block, "items", at, 1, 8).map((item, i) => {
				const where = `${at}.items[${i}]`;
				const fields = object(item, where);
				const value = number(fields, "value", where);
				if (value < 0) throw new VisualError(`${where}.value must not be negative`);
				return { label: text(fields, "label", where, 60), value };
			});
			if (!items.some((item) => item.value > 0))
				throw new VisualError(`${at}.items need at least one value above 0`);
			return compact({
				type: "donut",
				title: maybeText(block, "title", at, 120),
				unit: maybeText(block, "unit", at, 12),
				total: maybeText(block, "total", at, 40),
				items,
			});
		}
		case "facts":
			return compact({
				type: "facts",
				title: maybeText(block, "title", at, 120),
				items: list(block, "items", at, 1, 24).map((item, i) => {
					const where = `${at}.items[${i}]`;
					const fields = object(item, where);
					return compact({
						label: text(fields, "label", where, 60),
						value: text(fields, "value", where, 200),
						tone: oneOf(fields, "tone", where, TONES),
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
	"progress {title?, items:[{label, value, max? (default 100), unit?, tone?}]} 1-12 bars toward a target: coverage, budgets, completion.",
	"timeline {title?, items:[{time?, title, detail?, tone?}]} 1-24 events or milestones in order.",
	"donut {title?, unit?, total? (centre text), items:[{label, value}]} 1-8 parts of a whole.",
	"facts {title?, items:[{label, value, tone?}]} 1-24 key-value pairs: a summary card of settings, versions, owners.",
	"choices {prompt?, options:[{label, description?, message?}]} 1-6 next steps; a click sends message (default label) as the reader's next message.",
	"tabs {tabs:[{label, blocks:[...]}]} 2-6 views; tabs hold any block except tabs.",
	"tone is neutral, accent, success, warning or danger; accent marks the one thing that matters.",
	"Send html instead of blocks only for what blocks cannot draw (a diagram, a custom interactive view): one self-contained HTML document with inline <style> and <script>. Network loads are blocked, so draw with inline SVG or canvas and embed images as data: URIs. CSS variables --background --foreground --muted --border --accent follow Grid's theme.",
	`At most ${VISUALS_PER_TURN} visuals per turn.`,
].join(" ");

/** The tool's arguments, as its MCP server lists them. */
export const SHOW_VISUAL_SCHEMA: Record<string, unknown> = {
	type: "object",
	properties: {
		title: { type: "string", description: "A short name for the visual (not shown)." },
		blocks: {
			type: "array",
			description: "The components to draw, in reading order.",
			items: { type: "object" },
		},
		html: { type: "string", description: "One self-contained HTML document, instead of blocks." },
		height: { type: "number", description: "For html: the frame's starting height in pixels." },
	},
	required: ["title"],
};

/** The language tag of a fenced visual in a reply: ```grid-visual, then the JSON, then ```. */
export const VISUAL_FENCE = "grid-visual";

/** A piece of a reply: markdown to draw as it is, or a visual fence (checked, or why it failed). */
export type ReplyPart =
	| { kind: "text"; text: string }
	| { kind: "visual"; visual: Visual }
	| { kind: "pending" }
	| { kind: "invalid"; source: string; error: string };

const FENCE_OPEN = new RegExp(`^(\\s{0,3})(\`{3,}|~{3,})\\s*${VISUAL_FENCE}\\s*$`);

/**
 * A reply split around its ```grid-visual fences, in order. Each fence's JSON is checked as the
 * tool's arguments are (`{title, blocks}` or `{title, html}`; a bare list of blocks is taken as
 * the blocks). A fence still being written (no closing fence yet) is `pending`, so a streaming
 * reply shows a placeholder rather than half a spec; one that does not check out is `invalid`,
 * with the reason, so it can be shown as code.
 */
export function splitReply(reply: string): ReplyPart[] {
	if (!reply.includes(VISUAL_FENCE)) return [{ kind: "text", text: reply }];
	const parts: ReplyPart[] = [];
	const lines = reply.split("\n");
	let text: string[] = [];
	const flush = () => {
		if (text.join("\n").trim()) parts.push({ kind: "text", text: text.join("\n") });
		text = [];
	};
	for (let i = 0; i < lines.length; i++) {
		const open = FENCE_OPEN.exec(lines[i] ?? "");
		if (!open) {
			text.push(lines[i] ?? "");
			continue;
		}
		// The fence closes on a line of the same character, at least as long, and nothing else.
		const marker = open[2] ?? "```";
		const close = lines.findIndex((line, j) => {
			if (j <= i) return false;
			const run = /^\s{0,3}(`{3,}|~{3,})\s*$/.exec(line)?.[1];
			return Boolean(run && run[0] === marker[0] && run.length >= marker.length);
		});
		flush();
		if (close === -1) {
			parts.push({ kind: "pending" });
			return parts;
		}
		const source = lines.slice(i + 1, close).join("\n");
		parts.push(readFence(source));
		i = close;
	}
	flush();
	return parts;
}

function readFence(source: string): ReplyPart {
	try {
		const parsed: unknown = JSON.parse(source);
		const args = Array.isArray(parsed)
			? { title: "Visual", blocks: parsed }
			: object(parsed, "visual");
		return { kind: "visual", visual: readVisual({ title: "Visual", ...args }) };
	} catch (cause) {
		const error =
			cause instanceof VisualError
				? cause.message
				: cause instanceof SyntaxError
					? `Not valid JSON: ${cause.message}`
					: "Could not read this visual";
		return { kind: "invalid", source, error };
	}
}

/**
 * What every agent is told about rich replies, whatever it is and whatever tools it has: when a
 * visual helps, and how to write one as a fence. Agents with Grid's tools also see `show_visual`.
 */
export const RICH_REPLIES_NOTE = [
	"Rich replies: Grid draws visuals inside your reply with its own components, in the reader's theme.",
	"Use one when it reads faster than prose — numbers to compare, a trend, options side by side, a plan with steps, a status overview, a timeline, a breakdown — and always when the person asks for a visual, chart, table, dashboard, rich UI or similar.",
	`To add one, put a fenced block with the language ${VISUAL_FENCE} in your reply, holding JSON: {"title": "...", "blocks": [...]}.`,
	"Keep the prose around it short: state the finding, do not describe the visual. Prefer blocks; use one block type per idea.",
	`Example:\n\`\`\`${VISUAL_FENCE}\n{"title":"Bundle size","blocks":[{"type":"stats","items":[{"label":"Total","value":"412 KB","detail":"-18% vs last week","trend":"down","tone":"success"}]},{"type":"bar-chart","unit":"KB","better":"lower","items":[{"label":"vendor","value":240,"baseline":300},{"label":"app","value":172,"baseline":200}]}]}\n\`\`\``,
	"If you have Grid's show_visual tool you may use it instead with the same JSON. Blocks:",
	SHOW_VISUAL_DESCRIPTION.slice(SHOW_VISUAL_DESCRIPTION.indexOf("markdown {text}")),
].join("\n");
