import { Terminal } from "@xterm/headless";

import type { Pty } from "../terminals";

export type InteractiveCliEvent =
	| { type: "text"; text: string }
	| { type: "status"; status: string }
	| { type: "selection"; options: string[] }
	| { type: "question"; text: string }
	| { type: "confirmation"; text: string }
	| { type: "ad"; content: string }
	| { type: "screen"; content: string }
	| { type: "error"; message: string };

/** A CLI profile names only the public executable. Its entire UI stays inside the PTY. */
export type InteractiveCliProvider = { id: string; name: string; command: string[] };

export const INTERACTIVE_CLIS: Record<string, InteractiveCliProvider> = {
	freebuff: { id: "freebuff", name: "Freebuff", command: ["freebuff"] },
};

/** Interpret VT state without changing the raw bytes delivered to the terminal client. */
export class InteractiveCliScreen {
	private readonly terminal: Terminal;
	private readonly decoder = new TextDecoder();
	private lastScreen = "";
	private lastInteraction = "";
	private lastAd = "";
	private readonly adHistory: string[] = [];

	constructor(
		cols: number,
		rows: number,
		private readonly emit: (event: InteractiveCliEvent) => void,
	) {
		this.terminal = new Terminal({ cols, rows, allowProposedApi: true, scrollback: 1000 });
	}

	write(bytes: Uint8Array): void {
		this.terminal.write(this.decoder.decode(bytes, { stream: true }), () => this.interpret());
	}

	resize(cols: number, rows: number): void {
		this.terminal.resize(cols, rows);
		this.interpret();
	}

	snapshot(): string {
		return this.lastScreen;
	}

	ads(): string[] {
		return [...this.adHistory];
	}

	dispose(): void {
		this.terminal.dispose();
	}

	private interpret(): void {
		try {
			const buffer = this.terminal.buffer.active;
			const lines: string[] = [];
			for (let row = buffer.viewportY; row < buffer.viewportY + this.terminal.rows; row++) {
				lines.push(buffer.getLine(row)?.translateToString(true) ?? "");
			}
			const content = lines.join("\n").trimEnd();
			if (content === this.lastScreen) return;
			this.lastScreen = content;
			this.emit({ type: "screen", content });
			const visible = lines.map((line) => line.trim()).filter(Boolean);
			const last = visible.at(-1) ?? "";
			const ad = visible.find((line) => /^(?:ad|sponsored|advertisement)\s*:/i.test(line));
			if (ad && this.lastAd !== ad) {
				this.lastAd = ad;
				this.adHistory.push(ad);
				this.emit({ type: "ad", content: ad });
			} else if (!ad) this.lastAd = "";
			if (/\b(?:y\/n|yes\/no|confirm|allow|approve)\b/i.test(last)) {
				this.interaction(`confirmation:${last}`, { type: "confirmation", text: last });
			} else if (last.endsWith("?")) {
				this.interaction(`question:${last}`, { type: "question", text: last });
			} else {
				const options = visible.filter((line) => /^[>❯●○]\s+/.test(line));
				if (options.length > 1) {
					this.interaction(`selection:${options.join("\n")}`, { type: "selection", options });
				} else if (/\b(?:thinking|working|running|loading)\b/i.test(last)) {
					this.interaction(`status:${last}`, { type: "status", status: last });
				} else if (last) {
					this.interaction(`text:${last}`, { type: "text", text: last });
				}
			}
		} catch (cause) {
			this.emit({ type: "error", message: cause instanceof Error ? cause.message : String(cause) });
			this.emit({ type: "screen", content: this.lastScreen });
		}
	}

	private interaction(key: string, event: InteractiveCliEvent): void {
		if (key === this.lastInteraction) return;
		this.lastInteraction = key;
		this.emit(event);
	}
}

/** Spawn the official command directly; a shell cannot reinterpret prompts or arguments. */
export function spawnInteractiveCli(options: {
	provider: InteractiveCliProvider;
	cwd: string;
	cols: number;
	rows: number;
	onData: (bytes: Uint8Array) => void;
	onExit: (code: number) => void;
}): Pty {
	const proc = Bun.spawn(options.provider.command, {
		cwd: options.cwd,
		env: { ...process.env, TERM: "xterm-256color", COLORTERM: "truecolor" },
		terminal: {
			cols: options.cols,
			rows: options.rows,
			data: (_terminal, bytes) => options.onData(bytes),
		},
	});
	const terminal = proc.terminal;
	if (!terminal) throw new Error("Bun did not attach a terminal to the CLI");
	void proc.exited.then((code) => {
		terminal.close();
		options.onExit(code ?? 0);
	});
	return {
		write: (data) => terminal.write(data),
		resize: (cols, rows) => terminal.resize(cols, rows),
		kill: () => proc.kill(),
	};
}
