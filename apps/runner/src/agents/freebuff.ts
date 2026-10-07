import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { cached } from "./catalog";
import type { ChatEvent, Choice, TurnEvent } from "./events";
import { chatsDir, findChat, freebuffStateDir, replyState, replyText } from "./freebuff-chats";
import { exportedTurn } from "./freebuff-export";
import {
	connectionWarning,
	currentModel,
	inputText,
	inSession,
	isEffortPicker,
	isIdle,
	isMenu,
	isWorking,
	menuNotes,
	parseEfforts,
	parseMenu,
	ReplyTracker,
	type Segment,
	sessionModel,
} from "./freebuff-screen";
import type { AgentContext, AgentSession, Provider, TurnResult } from "./provider";
import { spawnTui, type TuiProcess } from "./tui";

/**
 * Freebuff as a chat agent. It only has an interactive terminal UI, so the runner runs the
 * official CLI in a pseudo-terminal and uses it the way a person would: it picks the model and its
 * reasoning in the CLI's own `/model` picker, types the message and streams the reply into the chat as the screen shows it.
 * Freebuff's own chat file says when the reply is complete and holds its exact text, which then
 * restates the turn; its folder name is the conversation's id, for picking it up again later.
 *
 * Freebuff sessions are paid for by the hour of Freebucks, from the first message. Closing the
 * process (not ending the session) leaves the hour running, so the next start rejoins it.
 */

/** Wide and tall, so replies wrap and scroll as little as possible. */
const COLS = 160;
const ROWS = 150;
/** Starting up includes signing in and reaching Freebuff's service, which can retry for a while. */
const START_MS = 120_000;
const STEP_MS = 5_000;
/** A turn can take as long as the agent needs; this only catches a CLI that stopped drawing. */
const TURN_MS = 60 * 60 * 1000;

type Tui = (command: string[], cwd: string) => TuiProcess;

export type FreebuffOptions = {
	binary: string;
	available: () => boolean;
	/** For tests: run something else in the terminal. */
	spawn?: Tui;
	/** Where Freebuff keeps its state (for tests; `~/.config/manicode` otherwise). */
	stateDir?: string;
};

const defaultSpawn: Tui = (command, cwd) =>
	spawnTui({ command, cwd, cols: COLS, rows: ROWS, name: "Freebuff" });

export function freebuffProvider(options: FreebuffOptions): Provider {
	const spawn = options.spawn ?? defaultSpawn;
	const models = cached(10 * 60 * 1000, () => readCatalog(options.binary, spawn));
	return {
		info: () => ({
			id: "freebuff",
			name: "Freebuff",
			available: options.available(),
			models: [],
			modes: [],
		}),
		catalog: async (fresh) => ({ models: await models(fresh) }),
		start: (context) =>
			startFreebuff(options.binary, spawn, options.stateDir ?? freebuffStateDir(), context),
	};
}

/** Why Freebuff stopped, in its own words: the first lines it left on screen. */
export function exitReason(lines: string[]): string {
	const said = lines
		.map((line) => line.trim())
		.filter(Boolean)
		.slice(0, 3)
		.join(" ")
		.replace(/^❌\s*/, "");
	return said ? `Freebuff stopped: ${said.slice(0, 300)}` : "Freebuff stopped";
}

/** Wait until Freebuff takes messages, passing on why when it cannot connect or stops. */
async function reachSession(tui: TuiProcess): Promise<string[]> {
	try {
		return await tui.wait((lines) => isIdle(lines) || inSession(lines), START_MS);
	} catch (cause) {
		if (!tui.alive) throw new Error(exitReason(tui.lines()));
		const warning = connectionWarning(tui.lines());
		throw new Error(warning ? `Freebuff: ${warning}` : String(cause));
	}
}

/** Show every model: the menu starts with a short list and a "See all" row under it. */
async function expandMenu(tui: TuiProcess): Promise<void> {
	if (!parseMenu(tui.lines()).collapsed) return;
	for (let i = 0; i < 20 && parseMenu(tui.lines()).selected >= 0; i++) {
		tui.write("\x1b[B");
		await Bun.sleep(80);
	}
	tui.write("\r");
	await tui.wait((lines) => !parseMenu(lines).collapsed, STEP_MS);
	for (let i = 0; i < 20 && parseMenu(tui.lines()).selected < 0; i++) {
		tui.write("\x1b[A");
		await Bun.sleep(80);
	}
}

/** Move a list's highlight to `target`, one arrow at a time, checking each step landed. */
async function highlight(
	tui: TuiProcess,
	target: number,
	selectedIn: (lines: string[]) => number,
): Promise<void> {
	while (selectedIn(tui.lines()) !== target) {
		const at = selectedIn(tui.lines());
		tui.write(target < at ? "\x1b[A" : "\x1b[B");
		const next = target < at ? at - 1 : at + 1;
		await tui.wait((lines) => selectedIn(lines) === next, STEP_MS);
	}
}

/** Open the model picker (`/model`), with every model showing. */
async function openPicker(tui: TuiProcess): Promise<void> {
	await submit(tui, "/model");
	await tui.wait(isMenu, STEP_MS * 2);
	await expandMenu(tui);
}

/**
 * Choose the model the next messages go to, and its reasoning level, in Freebuff's own picker:
 * highlight the model, Tab into its levels to pick one, then Enter. Changing costs nothing until
 * a message is sent.
 */
async function chooseModel(tui: TuiProcess, model: string, effort?: string): Promise<Choice[]> {
	await openPicker(tui);
	const menu = parseMenu(tui.lines());
	const target = menu.models.findIndex((choice) => choice.id === model);
	if (target < 0) {
		tui.write("\x1b");
		throw new Error(`Freebuff does not offer ${model} right now`);
	}
	await highlight(tui, target, (lines) => parseMenu(lines).selected);
	const choice = menu.models[target];
	if (effort && choice.efforts?.some((level) => level.id === effort)) {
		tui.write("\t");
		await tui.wait(isEffortPicker, STEP_MS);
		const { levels } = parseEfforts(tui.lines());
		const level = levels.indexOf(effort);
		if (level >= 0) await highlight(tui, level, (lines) => parseEfforts(lines).selected);
		// Enter saves the level and goes back to the models.
		tui.write("\r");
		await tui.wait((lines) => isMenu(lines) && !isEffortPicker(lines), STEP_MS);
	}
	tui.write("\r");
	await tui.wait(isIdle, STEP_MS * 2);
	if (sessionModel(tui.lines()) !== model) throw new Error(`Freebuff did not switch to ${model}`);
	return menu.models;
}

/** The model list, read from the picker in a scratch folder: nothing is sent, so nothing is spent. */
async function readCatalog(binary: string, spawn: Tui): Promise<Choice[]> {
	const cwd = mkdtempSync(join(tmpdir(), "grid-freebuff-models-"));
	const tui = spawn([binary], cwd);
	try {
		await reachSession(tui);
		await openPicker(tui);
		return parseMenu(tui.lines()).models;
	} finally {
		tui.kill();
		await tui.exited;
		rmSync(cwd, { recursive: true, force: true });
	}
}

/** One part of the reply read off the screen, as a chat event. */
function eventOf(segment: Segment, id: string, running: boolean): TurnEvent {
	if (segment.kind === "tool")
		return {
			type: "tool",
			id,
			title: segment.title,
			kind: segment.tool,
			status: running ? "running" : "completed",
			input: segment.input || undefined,
			output: segment.output || undefined,
		};
	return { type: segment.kind === "text" ? "message" : "reasoning", text: segment.text };
}

function sameTool(a: Segment, b: Segment): boolean {
	return (
		a.kind === "tool" &&
		b.kind === "tool" &&
		a.title === b.title &&
		a.input === b.input &&
		a.output === b.output
	);
}

/** A screen redrawn above what was streamed is restated at most this often while it runs. */
const RESYNC_MS = 2_000;

/**
 * A reply read off the screen, streamed into the chat: reasoning and text as they grow, tools as
 * they appear. When the screen is redrawn above what was sent (a long reply laid out again), what
 * it shows is restated with `turn_rewrite`, at most every couple of seconds, rather than left to
 * stall. `preface` is what the turn showed before the reply; a restatement repeats it, since it
 * replaces the turn's tools.
 */
export class ReplyStream {
	/** What the chat shows so far, each part with whether it was shown still running. */
	private sent: { part: Segment; running: boolean }[] = [];
	/** Parts not shown yet: a restatement held back to keep them apart. */
	private held: { parts: Segment[]; finished: boolean } | null = null;
	private restatedAt = Number.NEGATIVE_INFINITY;
	private readonly turn = crypto.randomUUID().slice(0, 8);

	constructor(
		private readonly emit: (event: ChatEvent) => void,
		private readonly preface: TurnEvent[] = [],
		private readonly now: () => number = Date.now,
	) {}

	private id(index: number): string {
		return `freebuff-screen-${this.turn}-${index}`;
	}

	/** The parts the screen shows now; `finished` once the reply's footer is drawn. */
	show(parts: Segment[], finished: boolean): void {
		const shown = parts.map((part, i) => ({ part, running: !finished && i === parts.length - 1 }));
		const events: TurnEvent[] = [];
		let fits = shown.length >= this.sent.length;
		for (let i = 0; fits && i < shown.length; i++) {
			const { part: now, running } = shown[i];
			const was = this.sent[i];
			if (!was) events.push(eventOf(now, this.id(i), running));
			else if (now.kind === "tool" || was.part.kind === "tool") {
				if (now.kind !== was.part.kind) fits = false;
				else if (!sameTool(now, was.part) || running !== was.running)
					events.push(eventOf(now, this.id(i), running));
			} else if (now.kind !== was.part.kind) fits = false;
			else if (now.text !== was.part.text) {
				// Only the last part can grow: text added to an earlier one would land after it.
				if (!now.text.startsWith(was.part.text) || i < this.sent.length - 1) fits = false;
				else
					events.push({
						type: now.kind === "text" ? "message" : "reasoning",
						text: now.text.slice(was.part.text.length),
					});
			}
		}
		if (fits) {
			for (const event of events) this.emit(event);
		} else {
			if (this.now() - this.restatedAt < RESYNC_MS) {
				this.held = { parts, finished };
				return;
			}
			this.restatedAt = this.now();
			this.emit({
				type: "turn_rewrite",
				replaceTools: true,
				events: [
					...this.preface,
					...shown.map((item, i) => eventOf(item.part, this.id(i), item.running)),
				],
			});
		}
		this.sent = shown;
		this.held = null;
	}

	/** Show a restatement held back, if it is due. */
	flush(): void {
		if (this.held) this.show(this.held.parts, this.held.finished);
	}

	/** End the turn with its exact events, or, without them, with what the screen last showed. */
	finish(exact: TurnEvent[] | null, seen: Segment[] | null): void {
		const parts = seen ?? this.held?.parts ?? this.sent.map((item) => item.part);
		const events = exact ?? parts.map((part, i) => eventOf(part, this.id(i), false));
		if (events.length)
			this.emit({ type: "turn_rewrite", replaceTools: true, events: [...this.preface, ...events] });
	}
}

/**
 * Send a message and make sure Freebuff took it. Right after starting (or rejoining a session) the
 * CLI can ignore keys for a moment, so: wait until its input box is ready, type, check the text
 * arrived, press Enter, and check it left the box, retrying each step a few times.
 */
async function submit(tui: TuiProcess, text: string): Promise<void> {
	await tui.wait(isIdle, START_MS);
	for (let attempt = 0; attempt < 3; attempt++) {
		if (!inputText(tui.lines())) tui.write(typed(text));
		const arrived = await tui
			.wait((lines) => inputText(lines) !== "", STEP_MS)
			.then(() => true)
			.catch(() => false);
		if (!arrived) continue;
		await Bun.sleep(150);
		tui.write("\r");
		const sent = await tui
			.wait((lines) => inputText(lines) === "" || isWorking(lines), STEP_MS)
			.then(() => true)
			.catch(() => false);
		if (sent) return;
	}
	throw new Error("Freebuff did not take the message; try sending it again");
}

/** Type a message the way a paste arrives, so new lines stay in the message instead of sending it. */
function typed(text: string): string {
	return text.includes("\n") ? `\x1b[200~${text}\x1b[201~` : text;
}

/** How often the chat file is read while a turn runs. */
const LOOK_MS = 400;
/** A turn the screen shows as finished, and the chat file does not mark complete, ends after this. */
const SCREEN_ONLY_MS = 3_000;
/** A connection warning on screen this long is passed on to the chat. */
const WARNING_MS = 15_000;

async function startFreebuff(
	binary: string,
	spawn: Tui,
	stateDir: string,
	context: AgentContext,
): Promise<AgentSession> {
	let wanted = context.model;
	let wantedEffort = context.effort;
	// Model, effort and the model list are set once per process.
	let prepared = false;
	// Conversations started before ids were kept say "latest": the folder's newest one.
	let conversation = context.resume && context.resume !== "latest" ? context.resume : undefined;
	let continuing = Boolean(context.resume);
	const chats = chatsDir(stateDir, context.cwd);
	let tui: TuiProcess | null = null;
	let models: Choice[] = [];
	let notes: string[] = [];
	let cancelled = false;
	let busy = false;

	const announce = () => {
		const now = currentModel(tui?.lines() ?? []);
		const model = now?.model ?? wanted;
		const efforts = models.find((choice) => choice.id === model)?.efforts;
		context.emit({
			type: "info",
			...(models.length ? { models } : {}),
			...(model ? { model } : {}),
			...(efforts ? { efforts } : {}),
			...(now?.effort ? { effort: now.effort } : {}),
		});
	};

	/** A running CLI in a session, started (and the model chosen) if need be. */
	const ready = async (): Promise<TuiProcess> => {
		if (!tui?.alive) {
			// `--continue` picks the conversation back up after the process was closed.
			const args = conversation
				? [binary, "--continue", conversation]
				: continuing
					? [binary, "--continue"]
					: [binary];
			tui = spawn(args, context.cwd);
			prepared = false;
		}
		const current = tui;
		const lines = await reachSession(current);
		if (!prepared) {
			prepared = true;
			notes = menuNotes(lines);
			const now = currentModel(lines);
			const differs =
				(wanted && wanted !== now?.model) ||
				(wantedEffort && now?.effort && wantedEffort !== now.effort);
			if (differs) models = await chooseModel(current, wanted ?? now?.model ?? "", wantedEffort);
			if (!models.length) {
				await openPicker(current);
				models = parseMenu(current.lines()).models;
				current.write("\x1b");
				await current.wait(isIdle, STEP_MS);
			}
			announce();
		}
		return current;
	};

	const prompt = async (text: string): Promise<TurnResult> => {
		cancelled = false;
		busy = true;
		let current: TuiProcess | null = null;
		try {
			current = await ready();
			const screen = current;
			// Shown before the reply; a restated turn starts with it again, since it replaces the tools.
			const preface: TurnEvent[] = [];
			if (notes.length) {
				const event: TurnEvent = {
					type: "tool",
					id: `freebuff-${crypto.randomUUID()}`,
					title: "Freebuff session",
					kind: "other",
					status: "completed",
					input: sessionModel(screen.lines()) ?? undefined,
					output: notes.join("\n"),
				};
				preface.push(event);
				context.emit(event);
				notes = [];
			}

			const tracker = new ReplyTracker(text, COLS);
			const stream = new ReplyStream(context.emit, preface);
			screen.onChange(() => {
				const parts = tracker.update(screen.lines());
				if (parts) stream.show(parts, tracker.finished);
			});

			const since = Date.now();
			await submit(screen, text);

			// Done when Freebuff's chat file says the reply is complete, or the screen has shown it
			// finished for a moment. Connection trouble on screen is passed on, not waited out.
			let chat = null as Awaited<ReturnType<typeof findChat>>;
			let finishedAt: number | null = null;
			let warnedAt: number | null = null;
			let warned = false;
			while (!cancelled) {
				if (!screen.alive) throw new Error(exitReason(screen.lines()));
				chat = await findChat(chats, text, since, chat?.id ?? conversation);
				if (chat && replyState(chat.messages, text, since) === "complete") break;
				const lines = screen.lines();
				// Not every build marks the file complete: a reply the screen shows finished, and
				// that stays finished, is done too (its text still comes from the file).
				if (tracker.finished && !isWorking(lines)) {
					finishedAt ??= Date.now();
					if (Date.now() - finishedAt > SCREEN_ONLY_MS) break;
				} else {
					finishedAt = null;
				}
				// The screen shows no reply yet but the file has text: stream that instead.
				if (chat && !tracker.anchored) {
					const saved = replyText(chat.messages, text, since);
					if (saved) stream.show([{ kind: "text", text: saved }], false);
				}
				// A restatement held back to keep them apart may be due.
				stream.flush();
				const warning = connectionWarning(lines);
				warnedAt = warning ? (warnedAt ?? Date.now()) : null;
				if (warning && !warned && warnedAt && Date.now() - warnedAt > WARNING_MS) {
					warned = true;
					context.emit({ type: "error", message: `Freebuff: ${warning}` });
				}
				if (Date.now() - since > TURN_MS) throw new Error("Freebuff did not finish in time");
				await Bun.sleep(LOOK_MS);
			}
			if (cancelled) {
				await screen.wait((lines) => !isWorking(lines), STEP_MS).catch(() => undefined);
				return { reason: "cancelled" };
			}
			const seen = tracker.update(screen.lines());
			screen.onChange();
			const exact = chat ? exportedTurn(chat.messages) : [];
			stream.finish(exact.length ? exact : null, seen);
			// The model that answered: a running session keeps the one it started with.
			announce();
			if (chat && chat.id !== conversation) {
				conversation = chat.id;
				context.onResumeToken(chat.id);
			} else if (!continuing) {
				context.onResumeToken("latest");
			}
			continuing = true;
			return { reason: "done" };
		} catch (cause) {
			if (cancelled) return { reason: "cancelled" };
			return { reason: "error", error: cause instanceof Error ? cause.message : String(cause) };
		} finally {
			current?.onChange();
			busy = false;
		}
	};

	return {
		prompt,
		// Esc is how Freebuff itself stops a turn.
		cancel: () => {
			cancelled = true;
			tui?.write("\x1b");
		},
		approve: () => undefined,
		// Freebuff's picker sets the model and its reasoning for the next message, mid-chat too.
		setModel: async (next) => {
			wanted = next;
			if (busy) throw new Error("Wait for Freebuff to finish the current message");
			const current = await ready();
			if (sessionModel(current.lines()) === next) return;
			models = await chooseModel(current, next, wantedEffort);
			announce();
		},
		setMode: async () => undefined,
		setEffort: async (level) => {
			wantedEffort = level;
			if (busy) throw new Error("Wait for Freebuff to finish the current message");
			const current = await ready();
			const now = currentModel(current.lines());
			if (!now || now.effort === level) return;
			models = await chooseModel(current, now.model, level);
			announce();
		},
		close: () => tui?.kill(),
	};
}
