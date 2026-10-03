import { afterAll, describe, expect, it } from "bun:test";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { spawnPty } from "./pty";
import { listeningPorts, previewLines, readMachine, terminalStatus } from "./terminal-status";

const encode = (text: string) => new TextEncoder().encode(text);

describe("terminal status", () => {
	it("reads the ports a terminal's processes listen on, and no one else's", () => {
		const ss = [
			'LISTEN 0 511 127.0.0.1:5173 0.0.0.0:* users:(("node",pid=41,fd=20))',
			'LISTEN 0 511 [::1]:5173 [::]:* users:(("node",pid=41,fd=21))',
			'LISTEN 0 512 127.0.0.1:4100 0.0.0.0:* users:(("bun",pid=99,fd=24))',
			"LISTEN 0 4096 127.0.0.1:631 0.0.0.0:*",
		].join("\n");
		expect(listeningPorts(ss, new Set([40, 41]))).toEqual([5173]);
		expect(listeningPorts(ss, new Set([7]))).toEqual([]);
	});

	it("keeps the last lines a person would read, without colours, titles or redrawn lines", () => {
		const output = [
			encode("\x1b]0;zsh\x07❯ bun run dev\r\n"),
			encode("\x1b[32m➜\x1b[0m ready in 412 ms\r\n"),
			encode("building 10%\rbuilding 100%\r\n\r\n"),
			encode("10:43 reload chat.css\r\n"),
		];
		expect(previewLines(output)).toEqual([
			"➜ ready in 412 ms",
			"building 100%",
			"10:43 reload chat.css",
		]);
		expect(previewLines([])).toEqual([]);
	});

	const folder = realpathSync(mkdtempSync(join(tmpdir(), "grid-terminal-status-")));
	afterAll(() => rmSync(folder, { recursive: true, force: true }));

	it.skipIf(process.platform !== "linux")(
		"says what a live shell is running and where, and that it waits at its prompt after",
		async () => {
			const output: Uint8Array[] = [];
			let ended = false;
			const pty = spawnPty({
				shell: "/bin/sh",
				cwd: folder,
				cols: 80,
				rows: 24,
				onData: (bytes) => output.push(bytes),
				onExit: () => {
					ended = true;
				},
			});
			try {
				pty.write("echo hello-status && sleep 5\r");
				let status = await terminalStatus(pty.pid ?? null, output, await readMachine());
				for (let tries = 0; tries < 40 && !status.command; tries++) {
					await Bun.sleep(50);
					status = await terminalStatus(pty.pid ?? null, output, await readMachine());
				}
				expect(status.cwd).toBe(folder);
				expect(status.command).toBe("sleep 5");
				expect(status.preview.join("\n")).toContain("hello-status");
				expect(status.branch).toBeNull();
			} finally {
				pty.kill();
				for (let tries = 0; tries < 40 && !ended; tries++) await Bun.sleep(25);
			}
		},
	);
});
