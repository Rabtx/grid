import { describe, expect, it } from "bun:test";

import { readConfig } from "./config";
import { type SpawnPty, type TerminalClient, TerminalStore } from "./terminals";

const bytes = (text: string) => new TextEncoder().encode(text);

function fakePty() {
	const spawned: {
		onData: (bytes: Uint8Array) => void;
		onExit: (code: number) => void;
		writes: (string | Uint8Array)[];
		sizes: [number, number][];
		killed: boolean;
	}[] = [];
	const spawn: SpawnPty = (options) => {
		const pty = {
			...options,
			writes: [] as (string | Uint8Array)[],
			sizes: [] as [number, number][],
			killed: false,
		};
		spawned.push(pty);
		return {
			write: (data) => pty.writes.push(data),
			resize: (cols, rows) => pty.sizes.push([cols, rows]),
			kill: () => {
				pty.killed = true;
			},
		};
	};
	return { spawned, spawn };
}

function client() {
	const seen = { output: [] as string[], exits: [] as number[], titles: [] as string[] };
	const handle: TerminalClient = {
		output: (chunk) => seen.output.push(new TextDecoder().decode(chunk)),
		exited: (code) => seen.exits.push(code),
		titled: (title) => seen.titles.push(title),
	};
	return { seen, handle };
}

const config = { ...readConfig({}), replayBytes: 10, maxTerminalsPerUser: 2 };

describe("TerminalStore", () => {
	it("keeps an interactive CLI alive across detach and replays raw bytes and screen state", async () => {
		const cli = fakePty();
		const store = new TerminalStore(config, fakePty().spawn, (options) =>
			cli.spawn({ ...options, shell: options.provider.command[0] }),
		);
		const info = store.open("me", { cols: 80, rows: 24 }, import.meta.dir, undefined, {
			id: "fixture",
			name: "Fixture",
			command: ["fixture"],
		});
		expect(info?.cwd).toBe(import.meta.dir);
		expect(info?.provider).toBe("fixture");
		const first = client();
		const attached = store.attach("me", info?.id ?? "", first.handle);
		attached?.detach();
		cli.spawned[0].onData(bytes("Ad: Hello from sponsor\r\nChoose?"));
		await new Promise((resolve) => setTimeout(resolve, 10));
		expect(cli.spawned[0].killed).toBe(false);
		const late = store.attach("me", info?.id ?? "", client().handle);
		expect(late?.history.map((part) => new TextDecoder().decode(part)).join("")).toContain(
			"Ad: Hello from sponsor",
		);
		expect(late?.screen).toContain("Ad: Hello from sponsor");
		expect(late?.ads).toEqual(["Ad: Hello from sponsor"]);
		store.write("me", info?.id ?? "", "/history\r");
		expect(cli.spawned[0].writes).toEqual(["/history\r"]);
		store.closeAll();
	});
	it("requires an absolute existing workspace folder for interactive CLIs", () => {
		const store = new TerminalStore(config, fakePty().spawn);
		expect(() =>
			store.open("me", { cols: 80, rows: 24 }, ".", undefined, {
				id: "fixture",
				name: "Fixture",
				command: ["fixture"],
			}),
		).toThrow("workspace folder");
	});

	it("keeps each person's terminals to themselves", () => {
		const { spawn } = fakePty();
		const store = new TerminalStore(config, spawn);
		const mine = store.open("me", { cols: 80, rows: 24 });
		expect(mine).not.toBeNull();
		expect(store.list("me")).toHaveLength(1);
		expect(store.list("you")).toHaveLength(0);
		expect(store.attach("you", mine?.id ?? "", client().handle)).toBeNull();
		expect(store.close("you", mine?.id ?? "")).toBe(false);
	});

	it("caps how many terminals one person can hold", () => {
		const store = new TerminalStore(config, fakePty().spawn);
		store.open("me", { cols: 80, rows: 24 });
		store.open("me", { cols: 80, rows: 24 });
		expect(store.open("me", { cols: 80, rows: 24 })).toBeNull();
		expect(store.open("you", { cols: 80, rows: 24 })).not.toBeNull();
	});

	it("replays recent output to a client that attaches later, within the replay budget", () => {
		const { spawned, spawn } = fakePty();
		const store = new TerminalStore(config, spawn);
		const info = store.open("me", { cols: 80, rows: 24 });
		spawned[0].onData(bytes("12345"));
		spawned[0].onData(bytes("67890"));
		spawned[0].onData(bytes("abc"));

		const late = client();
		const attached = store.attach("me", info?.id ?? "", late.handle);
		const replayed = attached?.history.map((chunk) => new TextDecoder().decode(chunk)).join("");
		// 13 bytes written, 10 kept: the oldest chunk is dropped whole.
		expect(replayed).toBe("67890abc");

		spawned[0].onData(bytes("live"));
		expect(late.seen.output).toEqual(["live"]);
	});

	it("picks up the title a shell sets and tells attached clients", () => {
		const { spawned, spawn } = fakePty();
		const store = new TerminalStore(config, spawn);
		const info = store.open("me", { cols: 80, rows: 24 });
		const watcher = client();
		store.attach("me", info?.id ?? "", watcher.handle);
		spawned[0].onData(bytes("\x1b]0;vim notes.md\x07"));
		expect(watcher.seen.titles).toEqual(["vim notes.md"]);
		expect(store.list("me")[0].title).toBe("vim notes.md");
	});

	it("forwards input and resizes, clamped to sizes a PTY accepts", () => {
		const { spawned, spawn } = fakePty();
		const store = new TerminalStore(config, spawn);
		const id = store.open("me", { cols: 80, rows: 24 })?.id ?? "";
		store.write("me", id, "ls\r");
		store.resize("me", id, 120.7, 0);
		store.resize("me", id, 120, 2);
		expect(spawned[0].writes).toEqual(["ls\r"]);
		expect(spawned[0].sizes).toEqual([[120, 2]]);
	});

	it("reports the exit and keeps the terminal listed until it is closed", () => {
		const { spawned, spawn } = fakePty();
		const store = new TerminalStore(config, spawn);
		const id = store.open("me", { cols: 80, rows: 24 })?.id ?? "";
		const watcher = client();
		store.attach("me", id, watcher.handle);
		spawned[0].onExit(130);
		expect(watcher.seen.exits).toEqual([130]);
		expect(store.list("me")[0].exitCode).toBe(130);
		expect(store.close("me", id)).toBe(true);
		expect(store.list("me")).toHaveLength(0);
	});

	it("kills the shell when a running terminal is closed", () => {
		const { spawned, spawn } = fakePty();
		const store = new TerminalStore(config, spawn);
		const id = store.open("me", { cols: 80, rows: 24 })?.id ?? "";
		store.close("me", id);
		expect(spawned[0].killed).toBe(true);
	});
});

describe("catching a terminal up", () => {
	it("sends only the bytes a device is missing, and starts over when they are no longer kept", () => {
		const { spawned, spawn } = fakePty();
		const store = new TerminalStore({ ...readConfig({}), replayBytes: 8 }, spawn);
		const info = store.open("me", { cols: 80, rows: 24 });
		if (!info) throw new Error("no terminal");
		const pty = spawned[0];
		pty.onData(bytes("abc"));
		pty.onData(bytes("def"));
		const text = (chunks: Uint8Array[]) =>
			chunks.map((chunk) => new TextDecoder().decode(chunk)).join("");

		const caught = store.attach("me", info.id, client().handle, 3);
		expect(caught?.resumed).toBe(true);
		expect(caught?.at).toBe(3);
		expect(text(caught?.history ?? [])).toBe("def");

		const midChunk = store.attach("me", info.id, client().handle, 4);
		expect(text(midChunk?.history ?? [])).toBe("ef");

		const upToDate = store.attach("me", info.id, client().handle, 6);
		expect(upToDate?.resumed).toBe(true);
		expect(upToDate?.history).toEqual([]);

		// Past what is kept (8 bytes): a device that saw only the first byte starts over.
		pty.onData(bytes("ghi"));
		const stale = store.attach("me", info.id, client().handle, 1);
		expect(stale?.resumed).toBe(false);
		expect(stale?.at).toBe(3);
		expect(text(stale?.history ?? [])).toBe("defghi");

		// Nonsense offsets, or none, get everything kept.
		expect(store.attach("me", info.id, client().handle, 99)?.resumed).toBe(false);
		expect(store.attach("me", info.id, client().handle)?.resumed).toBe(false);
	});
});
