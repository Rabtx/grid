import type { SpawnPty } from "./terminals";

/** A login shell on a real PTY, using Bun's built-in terminal support (no native add-on). */
export const spawnPty: SpawnPty = ({ shell, cwd, cols, rows, onData, onExit }) => {
	const proc = Bun.spawn([shell, "-l"], {
		cwd,
		env: {
			...process.env,
			TERM: "xterm-256color",
			COLORTERM: "truecolor",
			TERM_PROGRAM: "grid",
			LANG: process.env.LANG ?? "en_US.UTF-8",
		},
		terminal: {
			cols,
			rows,
			data(_terminal, bytes) {
				onData(bytes);
			},
		},
	});
	const terminal = proc.terminal;
	if (!terminal) throw new Error("Bun did not attach a terminal to the shell");

	void proc.exited.then((code) => {
		terminal.close();
		onExit(code ?? 0);
	});

	return {
		write: (data) => terminal.write(data),
		resize: (nextCols, nextRows) => terminal.resize(nextCols, nextRows),
		kill: () => proc.kill(),
	};
};
