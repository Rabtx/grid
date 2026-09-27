import { mkdtempSync, rmSync } from "node:fs";
import { unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { cached } from "./catalog";
import type { Choice, TurnEvent } from "./events";
import { exportedTurn } from "./freebuff-export";
import {
	connectionWarning,
	inSession,
	isMenu,
	isWorking,
	menuNotes,
	parseMenu,
	type Reply,
	ReplyTracker,
	sessionModel,
} from "./freebuff-screen";
import type { AgentContext, AgentSession, Provider, TurnResult } from "./provider";
import { spawnTui, type TuiProcess } from "./tui";

/**
 * Freebuff as a chat agent. It only has an interactive terminal UI, so the runner runs the
 * official CLI in a pseudo-terminal and uses it the way a person would: it picks the model in the
 * CLI's own menu, types the message, reads the reply off the screen as it is written (streamed
 * into the chat), and when the turn ends asks the CLI's own `/export` for the exact reply.
 *
 * Freebuff sessions are paid for by the hour of Freebucks. Closing the process (not ending the
 * session) leaves the hour running, so the next start rejoins it instead of paying again.
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
		start: (context) => startFreebuff(options.binary, spawn, context),
	};
}

/** Wait for the menu or a running session, passing on why when Freebuff cannot connect. */
async function reachSession(tui: TuiProcess): Promise<string[]> {
	try {
		return await tui.wait((lines) => isMenu(lines) || inSession(lines), START_MS);
	} catch (cause) {
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

/** Move the menu's highlight to `wanted` (or keep Freebuff's own choice) and start the session. */
async function chooseModel(tui: TuiProcess, wanted: string | undefined): Promise<void> {
	const menu = parseMenu(tui.lines());
	const target = wanted ? menu.models.findIndex((model) => model.id === wanted) : menu.selected;
	if (target < 0) throw new Error(`Freebuff does not offer ${wanted} right now`);
	while (parseMenu(tui.lines()).selected !== target) {
		const at = parseMenu(tui.lines()).selected;
		tui.write(target < at ? "\x1b[A" : "\x1b[B");
		const next = target < at ? at - 1 : at + 1;
		await tui.wait((lines) => parseMenu(lines).selected === next, STEP_MS);
	}
	tui.write("\r");
	await tui.wait(inSession, START_MS);
}

/** The model list, read from the menu in a scratch folder without starting a session. */
async function readCatalog(binary: string, spawn: Tui): Promise<Choice[]> {
	const cwd = mkdtempSync(join(tmpdir(), "grid-freebuff-models-"));
	const tui = spawn([binary], cwd);
	try {
		const lines = await reachSession(tui);
		if (!isMenu(lines)) {
			throw new Error("A Freebuff session is running; its models show again once it ends");
		}
		await expandMenu(tui);
		return parseMenu(tui.lines()).models;
	} finally {
		tui.kill();
		await tui.exited;
		rmSync(cwd, { recursive: true, force: true });
	}
}

/** The reply as read off the screen, for when the export is not there. */
function fromScreen(reply: Reply | null): TurnEvent[] {
	if (!reply) return [];
	return [
		...(reply.reasoning ? [{ type: "reasoning" as const, text: reply.reasoning }] : []),
		...(reply.text ? [{ type: "message" as const, text: reply.text }] : []),
	];
}

/** Type a message the way a paste arrives, so new lines stay in the message instead of sending it. */
function typed(text: string): string {
	return text.includes("\n") ? `\x1b[200~${text}\x1b[201~` : text;
}

async function startFreebuff(
	binary: string,
	spawn: Tui,
	context: AgentContext,
): Promise<AgentSession> {
	let wanted = context.model;
	let continuing = Boolean(context.resume);
	let tui: TuiProcess | null = null;
	let models: Choice[] = [];
	let notes: string[] = [];
	let cancelled = false;
	let busy = false;

	const announce = () => {
		const model = sessionModel(tui?.lines() ?? []) ?? wanted;
		const efforts = models.find((choice) => choice.id === model)?.efforts;
		context.emit({
			type: "info",
			...(models.length ? { models } : {}),
			...(model ? { model } : {}),
			...(efforts ? { efforts } : {}),
		});
	};

	/** A running CLI in a session, started (and the model chosen) if need be. */
	const ready = async (): Promise<TuiProcess> => {
		if (!tui?.alive) {
			// `--continue` picks the conversation back up after the process was closed.
			tui = spawn(continuing ? [binary, "--continue"] : [binary], context.cwd);
		}
		const current = tui;
		const lines = await reachSession(current);
		if (isMenu(lines)) {
			await expandMenu(current);
			const menu = current.lines();
			models = parseMenu(menu).models;
			notes = menuNotes(menu);
			await chooseModel(current, wanted);
			announce();
		} else if (!models.length) {
			announce();
		}
		return current;
	};

	/** The exact reply, from Freebuff's own export; written inside the folder (it refuses others). */
	const exportTurn = async (current: TuiProcess) => {
		const name = `.grid-freebuff-${crypto.randomUUID()}.json`;
		const path = join(context.cwd, name);
		current.write(`/export ${name}`);
		await Bun.sleep(150);
		current.write("\r");
		try {
			// Freebuff says when it has written the file; it may still be writing when it appears.
			for (let i = 0; i < 50; i++) {
				await Bun.sleep(100);
				const written = await Bun.file(path)
					.json()
					.catch(() => null);
				if (written) return exportedTurn(written);
			}
			console.error("[runner] Freebuff did not export the turn; keeping the reply as read");
			return [];
		} finally {
			await unlink(path).catch(() => undefined);
		}
	};

	const prompt = async (text: string): Promise<TurnResult> => {
		cancelled = false;
		busy = true;
		let current: TuiProcess | null = null;
		try {
			current = await ready();
			const screen = current;
			if (notes.length) {
				context.emit({
					type: "tool",
					id: `freebuff-${crypto.randomUUID()}`,
					title: "Freebuff session",
					kind: "other",
					status: "completed",
					input: sessionModel(screen.lines()) ?? undefined,
					output: notes.join("\n"),
				});
				notes = [];
			}

			const tracker = new ReplyTracker(text);
			const shown = { reasoning: "", text: "" };
			const live = { reasoning: true, text: true };
			const stream = (kind: "reasoning" | "text", full: string, whole: boolean) => {
				if (!live[kind]) return;
				// Only whole rows while it is still writing: the last one may be half drawn.
				const upTo = whole ? full : full.slice(0, full.lastIndexOf("\n") + 1);
				if (!upTo.startsWith(shown[kind])) {
					// Redrawn above what was sent (Markdown laid out again): the turn is restated at the end.
					live[kind] = false;
					return;
				}
				const delta = upTo.slice(shown[kind].length);
				if (!delta) return;
				shown[kind] = upTo;
				context.emit({ type: kind === "text" ? "message" : "reasoning", text: delta });
			};
			screen.onChange(() => {
				const reply = tracker.update(screen.lines());
				if (!reply) return;
				stream("reasoning", reply.reasoning, Boolean(reply.text));
				stream("text", reply.text, false);
			});

			screen.write(typed(text));
			await Bun.sleep(150);
			screen.write("\r");
			await screen.wait((lines) => cancelled || (tracker.finished && !isWorking(lines)), TURN_MS);
			if (cancelled) {
				await screen.wait((lines) => !isWorking(lines), STEP_MS).catch(() => undefined);
				return { reason: "cancelled" };
			}
			const seen = tracker.update(screen.lines());
			screen.onChange();
			const exact = await exportTurn(screen);
			const events = exact.length ? exact : fromScreen(seen);
			if (events.length) context.emit({ type: "turn_rewrite", events });
			if (!continuing) {
				continuing = true;
				context.onResumeToken("latest");
			}
			return { reason: "done" };
		} catch (cause) {
			if (cancelled) return { reason: "cancelled" };
			return { reason: "error", error: cause instanceof Error ? cause.message : String(cause) };
		} finally {
			current?.onChange();
			busy = false;
		}
	};

	/** A Freebuff command typed into its prompt, between turns. */
	const command = async (line: string) => {
		if (busy) throw new Error("Wait for Freebuff to finish the current message");
		const current = await ready();
		current.write(line);
		await Bun.sleep(150);
		current.write("\r");
		return current;
	};

	return {
		prompt,
		// Esc is how Freebuff itself stops a turn.
		cancel: () => {
			cancelled = true;
			tui?.write("\x1b");
		},
		approve: () => undefined,
		setModel: async (next) => {
			wanted = next;
			if (sessionModel(tui?.lines() ?? []) === next) return;
			// Freebuff fixes the model for a session: switching ends it and picks again.
			const current = await command("/end-session");
			await current.wait(isMenu, START_MS);
			await chooseModel(current, next);
			announce();
		},
		setMode: async () => undefined,
		setEffort: async (level) => {
			await command(`/reasoning ${level}`);
			context.emit({ type: "info", effort: level });
		},
		close: () => tui?.kill(),
	};
}
