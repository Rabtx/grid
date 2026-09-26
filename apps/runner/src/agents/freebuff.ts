import { Terminal } from "@xterm/headless";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { Choice } from "./events";
import type { AgentContext, AgentSession, Provider } from "./provider";

const COLS = 110;
const ROWS = 70;

/** Read model names from the official CLI's rendered picker, after VT parsing. */
export function freebuffMenu(screen: string): { models: Choice[]; selected: number } {
	const lines = screen.split("\n");
	const models: Choice[] = [];
	let selected = -1;
	for (let i = 0; i < lines.length - 1; i++) {
		if (!lines[i + 1].includes("Freebucks/hr")) continue;
		const label = lines[i].split("│")[1]?.trim();
		const name = label
			?.replace(/^›\s*/, "")
			.split(" · ")[0]
			?.trim();
		if (!name) continue;
		if (label?.startsWith("›")) selected = models.length;
		models.push({ id: name, name, description: lines[i + 1].replace(/[│]/g, "").trim() });
	}
	return { models, selected };
}

/** Read the answer from Freebuff's rendered conversation, including an unfinished turn. */
function visibleReply(
	screen: string,
	prompt: string | undefined,
	complete: boolean,
): string | null {
	const lines = screen.split("\n").map((line) => line.trim());
	const hint = prompt?.trim().split("\n").at(-1)?.slice(-40);
	const start = lines.findLastIndex(
		(line) => line.includes("⎘") && !/⎘\s*•\s*\d/.test(line) && (!hint || line.includes(hint)),
	);
	if (start < 0) return null;
	const end = lines.findIndex(
		(line, index) =>
			index > start &&
			(/⎘\s*•\s*\d/.test(line) ||
				/^(?:thinking|working)\.\.\./i.test(line) ||
				line.includes("End session") ||
				/^[╭╰]─/.test(line)),
	);
	if (end < 0 || (complete && !/⎘\s*•\s*\d/.test(lines[end]))) return null;
	let reply = lines.slice(start + 1, end);
	if (reply.some((line) => line.startsWith("• Thinking"))) {
		const thinking = reply.findIndex((line) => line.startsWith("• Thinking"));
		const gap = reply.findIndex((line, index) => index > thinking && !line);
		if (gap >= 0) reply = reply.slice(gap + 1);
	}
	return reply.join("\n").trim();
}

export function freebuffReply(screen: string, prompt?: string): string | null {
	return visibleReply(screen, prompt, true);
}

export function freebuffProgress(screen: string, prompt: string): string | null {
	return visibleReply(screen, prompt, false);
}

function cli(binary: string, cwd: string) {
	const vt = new Terminal({ cols: COLS, rows: ROWS, allowProposedApi: true });
	const decoder = new TextDecoder();
	let screen = "";
	let exited = false;
	let onScreen: ((content: string) => void) | undefined;
	const proc = Bun.spawn([binary], {
		cwd,
		env: { ...process.env, TERM: "xterm-256color", COLORTERM: "truecolor" },
		terminal: {
			cols: COLS,
			rows: ROWS,
			data: (_terminal, bytes) => {
				vt.write(decoder.decode(bytes, { stream: true }), () => {
					const buffer = vt.buffer.active;
					screen = Array.from(
						{ length: ROWS },
						(_, row) => buffer.getLine(buffer.viewportY + row)?.translateToString(true) ?? "",
					)
						.join("\n")
						.trimEnd();
					onScreen?.(screen);
				});
			},
		},
	});
	void proc.exited.then(() => {
		exited = true;
	});
	const terminal = proc.terminal;
	if (!terminal) throw new Error("Bun did not attach a terminal to Freebuff");
	return {
		get screen() {
			return screen;
		},
		write: (text: string) => terminal.write(text),
		waitExit: () => proc.exited,
		onScreen: (listener?: (content: string) => void) => {
			onScreen = listener;
		},
		wait: async (ready: (screen: string) => boolean, timeoutMs = 15_000) => {
			const until = Date.now() + timeoutMs;
			while (Date.now() < until && !exited) {
				if (ready(screen)) return screen;
				await Bun.sleep(50);
			}
			throw new Error(exited ? "Freebuff exited" : "Freebuff did not respond in time");
		},
		close: () => {
			proc.kill();
			terminal.close();
			vt.dispose();
		},
	};
}

function adLines(screen: string): string[] {
	return screen
		.split("\n")
		.map((line) => line.trim())
		.filter((line) => /Refer friends|Copy invite link|Streak perk/.test(line));
}

async function modelMenu(child: ReturnType<typeof cli>): Promise<{
	menu: ReturnType<typeof freebuffMenu>;
	ads: string[];
}> {
	await child.wait(
		(screen) => freebuffMenu(screen).selected >= 0 && screen.includes("H · History"),
	);
	const ads = adLines(child.screen);
	if (child.screen.includes("See all") && child.screen.includes("models")) {
		child.write("\x1b[B");
		await Bun.sleep(100);
		child.write("\r");
		await child.wait((screen) => screen.includes("Show fewer"));
	}
	return {
		menu: freebuffMenu(child.screen),
		ads: [...new Set([...ads, ...adLines(child.screen)])],
	};
}

export function freebuffProvider(options: { binary: string; available: () => boolean }): Provider {
	return {
		info: () => ({
			id: "freebuff",
			name: "Freebuff",
			available: options.available(),
			models: [],
			modes: [],
		}),
		catalog: async () => {
			const cwd = mkdtempSync(join(tmpdir(), "grid-freebuff-models-"));
			const child = cli(options.binary, cwd);
			try {
				return { models: (await modelMenu(child)).menu.models };
			} finally {
				child.close();
				await child.waitExit();
				rmSync(cwd, { recursive: true, force: true });
			}
		},
		start: async (context) => startFreebuff(options.binary, context),
	};
}

async function startFreebuff(binary: string, context: AgentContext): Promise<AgentSession> {
	let process = cli(binary, context.cwd);
	try {
		await process.wait(
			(screen) =>
				freebuffMenu(screen).selected >= 0 ||
				screen.includes("Enter a coding task or / for commands"),
			30_000,
		);
		if (process.screen.includes("Enter a coding task or / for commands")) {
			process.write("\x03");
			await process.wait((screen) => screen.includes("Press Ctrl-C again to exit"));
			process.write("\x03");
			await process.waitExit();
			process.close();
			process = cli(binary, context.cwd);
		}
		const { menu, ads } = await modelMenu(process);
		const wanted = context.model
			? menu.models.findIndex((model) => model.id === context.model)
			: menu.selected;
		if (wanted < 0) throw new Error(`Freebuff did not offer model ${context.model}`);
		const direction = wanted < menu.selected ? "\x1b[A" : "\x1b[B";
		for (let i = 0; i < Math.abs(wanted - menu.selected); i++) {
			process.write(direction);
			await process.wait(
				(screen) =>
					freebuffMenu(screen).selected ===
					menu.selected + (i + 1) * (wanted < menu.selected ? -1 : 1),
			);
		}
		process.write("\r");
		await process.wait((screen) => screen.includes("Enter a coding task or / for commands"));
		context.emit({ type: "info", models: menu.models, model: menu.models[wanted].id });
		let cancelled = false;
		let adsShown = false;
		return {
			prompt: async (text) => {
				cancelled = false;
				let emitted = "";
				if (ads.length && !adsShown) {
					context.emit({ type: "message", text: `${ads.join("\n")}\n\n` });
					adsShown = true;
				}
				process.onScreen((screen) => {
					const progress = freebuffProgress(screen, text);
					if (!progress?.startsWith(emitted)) return;
					const lastWord = Math.max(progress.lastIndexOf(" "), progress.lastIndexOf("\n"));
					const stable = progress.slice(0, lastWord + 1);
					if (stable.length > emitted.length) {
						context.emit({ type: "message", text: stable.slice(emitted.length) });
						emitted = stable;
					}
				});
				try {
					process.write(text);
					await Bun.sleep(100);
					process.write("\r");
					await process.wait(
						(screen) =>
							cancelled ||
							(screen.includes("Enter a coding task or / for commands") &&
								!!freebuffReply(screen, text)),
						180_000,
					);
					if (cancelled) return { reason: "cancelled" };
					const reply = freebuffReply(process.screen, text);
					if (!reply) throw new Error("Freebuff returned no readable reply");
					context.emit({
						type: "message",
						text: reply.startsWith(emitted) ? reply.slice(emitted.length) : `\n\n${reply}`,
					});
					return { reason: "done" };
				} catch (cause) {
					return { reason: cancelled ? "cancelled" : "error", error: String(cause) };
				} finally {
					process.onScreen();
				}
			},
			cancel: () => {
				cancelled = true;
				process.write("\x03");
			},
			approve: () => undefined,
			setModel: async () => {
				throw new Error("Start a new Freebuff chat to change models");
			},
			setMode: async () => undefined,
			setEffort: async () => undefined,
			close: process.close,
		};
	} catch (cause) {
		process.close();
		throw cause;
	}
}
