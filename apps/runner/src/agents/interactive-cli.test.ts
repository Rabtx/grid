import { describe, expect, it } from "bun:test";

import { InteractiveCliScreen, spawnInteractiveCli } from "./interactive-cli";

const bytes = (text: string) => new TextEncoder().encode(text);
const settle = () => new Promise((resolve) => setTimeout(resolve, 10));

describe("InteractiveCliScreen", () => {
	it("interprets cursor movement, selections, questions and ads while retaining the screen", async () => {
		const events: { type: string; content?: string; options?: string[] }[] = [];
		const screen = new InteractiveCliScreen(40, 8, (event) => events.push(event));
		screen.write(bytes("Loading...\rReady\x1b[K\r\n> Agent one\r\n> Agent two"));
		await settle();
		expect(screen.snapshot()).toContain("Ready");
		expect(screen.snapshot()).not.toContain("Loading...");
		expect(events.some((event) => event.type === "selection" && event.options?.length === 2)).toBe(
			true,
		);
		screen.write(bytes("\r\nAd: Sponsor message\r\nContinue?"));
		await settle();
		expect(
			events.some((event) => event.type === "ad" && event.content === "Ad: Sponsor message"),
		).toBe(true);
		expect(events.some((event) => event.type === "question")).toBe(true);
		expect(screen.snapshot()).toContain("Ad: Sponsor message");
		screen.dispose();
	});

	it.each(["", "\x1b[?1049h"])(
		"retains ads that scroll off in a single PTY chunk",
		async (prefix) => {
			const events: { type: string; content?: string }[] = [];
			const screen = new InteractiveCliScreen(40, 3, (event) => events.push(event));
			screen.write(bytes(`${prefix}Ad: Sponsor message\r\nline1\r\nline2\r\nline3\r\nline4`));
			await settle();
			expect(screen.snapshot()).not.toContain("Ad: Sponsor message");
			expect(screen.ads()).toContain("Ad: Sponsor message");
			expect(events.filter((event) => event.type === "ad")).toEqual([
				{ type: "ad", content: "Ad: Sponsor message" },
			]);
			screen.dispose();
		},
	);
});

describe("spawnInteractiveCli", () => {
	it("runs a direct PTY command in the requested workspace and forwards input", async () => {
		let output = "";
		let finish!: (code: number) => void;
		const exited = new Promise<number>((resolve) => (finish = resolve));
		const pty = spawnInteractiveCli({
			provider: {
				id: "fixture",
				name: "Fixture",
				command: [
					process.execPath,
					"-e",
					"process.stdout.write(process.cwd()+'\\n'); process.stdin.once('data', b => {process.stdout.write('got:'+b.toString()); process.exit(0)})",
				],
			},
			cwd: import.meta.dir,
			cols: 80,
			rows: 24,
			onData: (chunk) => {
				output += new TextDecoder().decode(chunk);
			},
			onExit: finish,
		});
		await settle();
		pty.write("/history\r");
		expect(await exited).toBe(0);
		expect(output).toContain(import.meta.dir);
		expect(output).toContain("/history");
	});
});
