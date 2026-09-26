import { Terminal } from "@xterm/headless";

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

/** The reply is between Freebuff's copied user prompt and its reply footer. */
export function freebuffReply(screen: string, prompt?: string): string | null {
	const lines = screen.split("\n").map((line) => line.trim());
	const end = lines.findLastIndex((line) => /⎘\s*•\s*\d/.test(line));
	if (end < 0) return null;
	let start = -1;
	for (let i = end - 1; i >= 0; i--) {
		if (lines[i].includes("⎘")) {
			start = i;
			break;
		}
	}
	if (start < 0) return null;
	if (prompt && !lines[start].includes(prompt.trim().split("\n").at(-1)?.slice(-40) ?? ""))
		return null;
	let reply = lines.slice(start + 1, end);
	if (reply.some((line) => line.startsWith("• Thinking"))) {
		const thinking = reply.findIndex((line) => line.startsWith("• Thinking"));
		const gap = reply.findIndex((line, index) => index > thinking && !line);
		if (gap >= 0) reply = reply.slice(gap + 1);
	}
	return reply.join("\n").trim();
}

function cli(binary: string, cwd: string) {
	const vt = new Terminal({ cols: COLS, rows: ROWS, allowProposedApi: true });
	const decoder = new TextDecoder();
	let screen = "";
	let exited = false;
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
			const child = cli(options.binary, process.cwd());
			try {
				return { models: (await modelMenu(child)).menu.models };
			} finally {
				child.close();
			}
		},
		start: async (context) => startFreebuff(options.binary, context),
	};
}

async function startFreebuff(binary: string, context: AgentContext): Promise<AgentSession> {
	const process = cli(binary, context.cwd);
	try {
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
					if (ads.length && !adsShown) {
						context.emit({ type: "message", text: `${ads.join("\n")}\n\n` });
						adsShown = true;
					}
					context.emit({ type: "message", text: reply });
					return { reason: "done" };
				} catch (cause) {
					return { reason: cancelled ? "cancelled" : "error", error: String(cause) };
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
