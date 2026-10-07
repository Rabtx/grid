import { afterEach, describe, expect, it } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdirSync, mkdtempSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Who } from "../auth";
import { signedOut } from "../auth";
import type { ChatEvent } from "../agents/events";
import { ChatHub } from "../chat/hub";
import { ChatStore } from "../chat/store";
import { readConfig } from "../config";
import { spawnPty } from "../pty";
import { startServer } from "../server";
import { TerminalStore } from "../terminals";
import { logPath, readLogTail, redactLog } from "./log-tail";
import { OperateTelemetry } from "./telemetry";
import { telemetryRequest } from "./telemetry-routes";
import { TelemetryStore } from "./telemetry-store";

const owner: Who = { userId: "u", workspace: "w", role: "owner" };
const member: Who = { ...owner, role: "member" };
const cleanups: (() => void)[] = [];
afterEach(() => {
	for (const cleanup of cleanups.splice(0).reverse()) cleanup();
});
function setup(persist = false) {
	const folder = mkdtempSync(join(tmpdir(), "grid-operate-telemetry-"));
	cleanups.push(() => rmSync(folder, { recursive: true, force: true }));
	const path = persist ? join(folder, "store.db") : ":memory:";
	const store = new TelemetryStore(path),
		chat = new ChatStore(path);
	cleanups.push(() => {
		store.close();
		chat.close();
	});
	const folders = { w: { app: folder }, other: { app: folder } };
	const telemetry = new OperateTelemetry({
		store,
		chat,
		folders: (workspace) => folders[workspace as keyof typeof folders] ?? {},
	});
	return { folder, path, store, chat, telemetry };
}
function request(
	telemetry: OperateTelemetry,
	method: string,
	path: string,
	input?: unknown,
	who = owner,
) {
	return telemetryRequest(
		new Request(`http://runner${path}`, {
			method,
			...(input === undefined ? {} : { body: JSON.stringify(input) }),
		}),
		new URL(`http://runner${path}`),
		who,
		telemetry,
	);
}
function session(
	chat: ChatStore,
	id: string,
	provider = "alpha",
	workspace = "w",
	project = "app",
	costs: unknown[] = [],
) {
	chat.create({
		id,
		provider,
		ownerId: "u",
		workspaceId: workspace,
		project,
		cwd: "/unused",
		title: "private title",
		model: null,
		mode: null,
		effort: null,
		worktree: null,
	});
	chat.append(id, costs.map((costUsd) => ({ type: "usage", costUsd })) as ChatEvent[]);
}
const charge = { service: "web", provider: "hosting", amountCents: 1200, date: "2026-10-06" };

describe("Operate log tails", () => {
	it("limits bytes/lines, drops cut first line and keeps empty log distinguishable", () => {
		const s = setup();
		writeFileSync(
			join(s.folder, "web.log"),
			Array.from({ length: 400 }, (_, i) => `line-${i}: ${"x".repeat(300)}`).join("\n") + "\n",
		);
		const tail = readLogTail(s.folder, "web.log");
		expect(tail.bytes).toBe(65536);
		expect(tail.lines).toBe(200);
		expect(tail.truncated).toBe(true);
		expect(tail.text.startsWith("line-200:")).toBe(true);
		expect(tail.text).toContain("line-399:");
		writeFileSync(join(s.folder, "web.log"), "x".repeat(70000));
		expect(readLogTail(s.folder, "web.log").text).toBe("");
		writeFileSync(join(s.folder, "web.log"), "");
		expect(readLogTail(s.folder, "web.log")).toMatchObject({
			text: "",
			bytes: 0,
			lines: 0,
			truncated: false,
		});
	});
	it("rejects traversal, absolute, hidden, credential and control paths", () => {
		for (const path of [
			"../a.log",
			"/tmp/a.log",
			"a/../../b.log",
			"a\\b.log",
			".env.log",
			".ssh/a.log",
			"credentials.log",
			"private-key.log",
			"id_rsa.log",
			"a\na.log",
			"a\0.log",
			"a\u0085.log",
			"a//b.log",
			"a.txt",
		])
			expect(() => logPath(path)).toThrow();
		expect(logPath("logs/application.log")).toBe("logs/application.log");
	});
	it("rejects symlinks, directories, FIFOs and malformed UTF8/binary without leaking paths", () => {
		const s = setup();
		writeFileSync(join(s.folder, "ok.log"), "okay");
		symlinkSync(join(s.folder, "ok.log"), join(s.folder, "alias.log"));
		expect(() => readLogTail(s.folder, "alias.log")).toThrow("symbolic links");
		mkdirSync(join(s.folder, "dir.log"));
		expect(() => readLogTail(s.folder, "dir.log")).toThrow("regular");
		const result = Bun.spawnSync(["mkfifo", join(s.folder, "pipe.log")]);
		expect(result.exitCode).toBe(0);
		expect(() => readLogTail(s.folder, "pipe.log")).toThrow("regular");
		for (const bytes of [Buffer.from([0, 1]), Buffer.from([255, 254])]) {
			writeFileSync(join(s.folder, "bad.log"), bytes);
			expect(() => readLogTail(s.folder, "bad.log")).toThrow("UTF-8");
		}
		expect(() => readLogTail(s.folder, "missing.log")).toThrow("Log file not found");
	});
	it("rejects parent symlink replacement between validation and opening", () => {
		const s = setup();
		const outside = mkdtempSync(join(tmpdir(), "grid-operate-outside-"));
		cleanups.push(() => rmSync(outside, { recursive: true, force: true }));
		mkdirSync(join(s.folder, "logs"));
		writeFileSync(join(s.folder, "logs/web.log"), "inside");
		writeFileSync(join(outside, "web.log"), "outside");
		expect(() =>
			readLogTail(s.folder, "logs/web.log", (phase) => {
				if (phase !== "validated") return;
				renameSync(join(s.folder, "logs"), join(s.folder, "old"));
				symlinkSync(outside, join(s.folder, "logs"));
			}),
		).toThrow("changed");
	});
	it("refuses last component symlink replacement before opening", () => {
		const s = setup();
		writeFileSync(join(s.folder, "web.log"), "old");
		writeFileSync(join(s.folder, "other.log"), "new");
		expect(() =>
			readLogTail(s.folder, "web.log", (phase) => {
				if (phase !== "validated") return;
				rmSync(join(s.folder, "web.log"));
				symlinkSync(join(s.folder, "other.log"), join(s.folder, "web.log"));
			}),
		).toThrow("safely");
	});
	it("rejects replacement of the path after opening and after reading the descriptor", () => {
		for (const boundary of ["opened", "read"] as const) {
			const s = setup();
			writeFileSync(join(s.folder, "web.log"), "original");
			expect(() =>
				readLogTail(s.folder, "web.log", (phase) => {
					if (phase !== boundary) return;
					renameSync(join(s.folder, "web.log"), join(s.folder, "rotated.log"));
					writeFileSync(join(s.folder, "web.log"), "replacement");
				}),
			).toThrow("changed");
		}
	});

	it("redacts terminal escapes, credentials, URLs, quoted JSON and complete/partial PEM blocks", () => {
		// Deliberately generated dummy values exercise redaction without embedding credentials.
		const dummy = {
			quotedValue: "two word value",
			escapedValue: 'escaped"value',
			assignmentValue: "abcdef",
			bearerValue: "abcdefgh",
			providerValue: "abcdefghijklmnop",
			githubValue: "abcdefghijklmnopqrstuvwxyz",
			pemMaterial: "M".repeat(64),
		};
		const pemBoundary = (edge: "BEGIN" | "END", kind = "PRIVATE KEY") =>
			["-----", edge, " ", kind, "-----"].join("");
		const assignments = [
			["password", JSON.stringify(dummy.quotedValue)],
			["AWS_SECRET_ACCESS_KEY", dummy.assignmentValue],
		].map(([field, value]) => [field, value].join("="));
		const input = [
			"\x1b[31mhello\x1b[0m",
			assignments[0],
			JSON.stringify({ api_key: dummy.escapedValue }),
			assignments[1],
			["Authorization: Bearer", dummy.bearerValue].join(" "),
			["Cookie: session", dummy.assignmentValue].join("="),
			"postgres://user:private@example.com/db",
			["sk", dummy.providerValue].join("-"),
			["ghp", dummy.githubValue].join("_"),
			pemBoundary("BEGIN"),
			dummy.pemMaterial,
			pemBoundary("END"),
			"last",
		].join("\n");
		const clean = redactLog(input);
		for (const secret of [
			dummy.quotedValue,
			"escaped",
			dummy.assignmentValue,
			"private@example",
			dummy.providerValue,
			dummy.pemMaterial,
			"\x1b",
		])
			expect(clean).not.toContain(secret);
		expect(clean).toContain("[REDACTED");
		expect(clean).toContain("last");
		expect(redactLog([pemBoundary("BEGIN", "RSA PRIVATE KEY"), "abc"].join("\n"))).not.toContain(
			"abc",
		);
		expect(redactLog(["secret material", pemBoundary("END"), "normal"].join("\n"))).toBe(
			"[REDACTED PEM]\nnormal",
		);
		expect(redactLog("N".repeat(64))).toBe("[REDACTED KEY MATERIAL]");
		// Redacting a value must not swallow the line break and the next line's first word.
		const lines = ["10:00:01 INFO served token=abc123", "10:00:02 INFO served token=def456"];
		expect(redactLog(lines.join("\n")).split("\n")).toEqual([
			"10:00:01 INFO served token=[REDACTED]",
			"10:00:02 INFO served token=[REDACTED]",
		]);
		expect(redactLog("authorization: Bearer abc.def")).not.toContain("abc.def");
		expect(redactLog("hello\x1b]0;title\x07world")).toBe("helloworld");
	});
	it("scopes metadata and reads, respects custom production permissions and releases 20-source capacity", async () => {
		const s = setup();
		writeFileSync(join(s.folder, "web.log"), "password=abc\nnormal");
		expect(
			(await request(s.telemetry, "GET", "/operate/app/logs", undefined, member))?.status,
		).toBe(403);
		const permitted: Who = {
			...member,
			customRole: "ops",
			settings: { customRoles: [{ id: "ops", permissions: { production: true } }] },
		};
		expect(
			(await request(s.telemetry, "PUT", "/operate/app/logs/web", { path: "web.log" }, permitted))
				?.status,
		).toBe(204);
		const response = await request(s.telemetry, "GET", "/operate/app/logs/web");
		expect(((await response!.json()) as { data: { text: string } }).data.text).not.toContain("abc");
		expect(
			(
				await request(s.telemetry, "GET", "/operate/app/logs/web", undefined, {
					...owner,
					workspace: "other",
				})
			)?.status,
		).toBe(404);
		expect((await request(s.telemetry, "GET", "/operate/missing/logs"))?.status).toBe(404);
		for (let i = 1; i < 20; i++) s.telemetry.register(owner, "app", `source${i}`, "web.log");
		expect(() => s.telemetry.register(owner, "app", "extra", "web.log")).toThrow("20 log sources");
		s.telemetry.register(owner, "app", "web", "web.log");
		s.telemetry.removeSource(owner, "app", "web");
		s.telemetry.register(owner, "app", "extra", "web.log");
		expect(s.telemetry.logs(owner, "app").sources).toHaveLength(20);
		rmSync(join(s.folder, "web.log"));
		expect((await request(s.telemetry, "GET", "/operate/app/logs/extra"))?.status).toBe(404);
	});
});

describe("Operate reported costs", () => {
	it("aggregates retained session maxima, reports partial/zero/unknown and isolates workspace/project without reading chat payloads", () => {
		const s = setup();
		session(s.chat, "one", "alpha", "w", "app", [1, 2, 1, -5, "999", null, Infinity]);
		session(s.chat, "two", "alpha", "w", "app", [3]);
		session(s.chat, "none", "alpha");
		session(s.chat, "zero", "beta", "w", "app", [0]);
		session(s.chat, "unknown", "gamma", "w", "app", [-1, NaN]);
		session(s.chat, "foreign", "alpha", "other", "app", [90]);
		session(s.chat, "project", "alpha", "w", "else", [90]);
		s.chat.append("one", [
			{ type: "message", text: "private", costUsd: 9999 } as unknown as ChatEvent,
		]);
		s.chat.events = () => {
			throw new Error("event payloads must not be materialized");
		};
		const costs = s.telemetry.costs(member, "app");
		expect(costs.allowed).toBe(false);
		expect(costs.agents).toMatchObject({ costUsd: 5, reportedSessions: 3, totalSessions: 5 });
		expect(costs.agents.providers).toEqual([
			{ provider: "alpha", costUsd: 5, reportedSessions: 2, totalSessions: 3 },
			{ provider: "beta", costUsd: 0, reportedSessions: 1, totalSessions: 1 },
			{ provider: "gamma", costUsd: null, reportedSessions: 0, totalSessions: 1 },
		]);
		s.chat.delete("one");
		expect(s.telemetry.costs(owner, "app").agents.costUsd).toBe(3);
	});
	it("excludes nonfinite JSON costs and rejects overflowing valid totals", () => {
		const s = setup(true);
		session(s.chat, "infinite");
		session(s.chat, "large-one");
		session(s.chat, "large-two");
		const db = new Database(s.path);
		cleanups.push(() => db.close());
		db.query("INSERT INTO events VALUES (?, 1, ?)").run(
			"infinite",
			'{"type":"usage","costUsd":1e999}',
		);
		expect(s.telemetry.costs(owner, "app").agents).toMatchObject({
			costUsd: null,
			reportedSessions: 0,
			totalSessions: 3,
		});
		for (const id of ["large-one", "large-two"])
			db.query("INSERT INTO events VALUES (?, 1, ?)").run(id, '{"type":"usage","costUsd":1e308}');
		expect(() => s.telemetry.costs(owner, "app")).toThrow("supported total");
	});

	it("keeps unknown and known-zero hosting amounts distinct, validates amount/date and scoped removal", async () => {
		const s = setup();
		expect(s.telemetry.costs(member, "app").agents.costUsd).toBeNull();
		expect(s.telemetry.costs(member, "app").hosting.totalCents).toBeNull();
		expect(
			(await request(s.telemetry, "POST", "/operate/app/costs/charges", charge, member))?.status,
		).toBe(403);
		const zero = s.telemetry.addCharge(owner, "app", { ...charge, amountCents: 0 });
		expect(s.telemetry.costs(member, "app").hosting.totalCents).toBe(0);
		for (const input of [
			{ ...charge, amountCents: -1 },
			{ ...charge, amountCents: 1.5 },
			{ ...charge, amountCents: Number.MAX_SAFE_INTEGER + 1 },
			{ ...charge, date: "2026-02-30" },
			{ ...charge, service: "\0" },
			{ ...charge, provider: "host\u009b" },
		])
			expect(() => s.telemetry.addCharge(owner, "app", input)).toThrow();
		expect(() =>
			s.telemetry.removeCharge({ ...owner, workspace: "other" }, "app", zero.id),
		).toThrow("not found");
		s.telemetry.removeCharge(owner, "app", zero.id);
		expect(s.telemetry.costs(owner, "app").hosting.totalCents).toBeNull();
	});
	it("rejects record and monetary overflow without discarding stored financial records", () => {
		const s = setup();
		const max = s.telemetry.addCharge(owner, "app", {
			...charge,
			amountCents: Number.MAX_SAFE_INTEGER,
		});
		expect(() => s.telemetry.addCharge(owner, "app", { ...charge, amountCents: 1 })).toThrow(
			"supported total",
		);
		s.telemetry.removeCharge(owner, "app", max.id);
		for (let i = 0; i < 500; i++)
			s.telemetry.addCharge(owner, "app", { ...charge, amountCents: 0 });
		expect(() => s.telemetry.addCharge(owner, "app", charge)).toThrow("500 hosting charges");
		expect(s.telemetry.costs(owner, "app").hosting.charges).toHaveLength(500);
		const first = s.telemetry.costs(owner, "app").hosting.charges[0]!;
		s.telemetry.removeCharge(owner, "app", first.id);
		s.telemetry.addCharge(owner, "app", charge);
		expect(s.telemetry.costs(owner, "app").hosting.totalCents).toBe(1200);
	});
	it("source metadata and hosting records survive restart without persisting log content", () => {
		const s = setup(true);
		writeFileSync(join(s.folder, "web.log"), "do-not-store-this-line");
		s.telemetry.register(owner, "app", "web", "web.log");
		const saved = s.telemetry.addCharge(owner, "app", charge);
		const reopened = new TelemetryStore(s.path);
		cleanups.push(() => reopened.close());
		expect(reopened.sources("w", "app")).toEqual([{ name: "web", path: "web.log" }]);
		expect(reopened.charges("w", "app")[0]).toEqual(saved);
		const db = new Database(s.path);
		cleanups.push(() => db.close());
		expect(JSON.stringify(db.query("SELECT * FROM operate_log_sources").all())).not.toContain(
			"do-not-store",
		);
	});
	it("rejects inherited project keys and honors overridden built-in production permissions", async () => {
		const s = setup();
		for (const key of ["constructor", "toString", "__proto__"])
			expect(() => s.telemetry.costs(owner, key)).toThrow("not linked");
		const denied: Who = {
			...owner,
			role: "admin",
			settings: { rolePermissions: { admin: { production: false } } },
		};
		expect(
			(await request(s.telemetry, "GET", "/operate/app/logs", undefined, denied))?.status,
		).toBe(403);
		const permitted: Who = {
			...member,
			settings: { rolePermissions: { member: { production: true } } },
		};
		expect(s.telemetry.costs(permitted, "app").allowed).toBe(true);
	});
	it("rejects invalid JSON/names, unsupported methods and streamed bodies beyond 4KiB", async () => {
		const s = setup();
		expect((await request(s.telemetry, "PATCH", "/operate/app/costs"))?.status).toBe(405);
		expect((await request(s.telemetry, "PUT", "/operate/app/logs/x", {}))?.status).toBe(400);
		expect((await request(s.telemetry, "PUT", "/operate/app/logs/%ZZ", {}))?.status).toBe(400);
		const url = new URL("http://runner/operate/app/costs/charges");
		const response = await telemetryRequest(
			new Request(url.href, {
				method: "POST",
				body: new ReadableStream({
					start(controller) {
						controller.enqueue(new TextEncoder().encode("x".repeat(4097)));
						controller.close();
					},
				}),
			}),
			url,
			owner,
			s.telemetry,
		);
		expect(response?.status).toBe(413);
		expect(
			(
				await telemetryRequest(
					new Request(url.href, { method: "POST", body: "{" }),
					url,
					owner,
					s.telemetry,
				)
			)?.status,
		).toBe(400);
	});
	it("uses the actual runner auth boundary for every telemetry endpoint", async () => {
		const s = setup();
		const config = {
			...readConfig({ RUNNER_PROJECTS_DIR: s.folder, RUNNER_CWD: s.folder }),
			port: 0,
		};
		const terminals = new TerminalStore(config, spawnPty);
		const server = startServer(
			config,
			terminals,
			async (token) => (token === "good" ? { who: owner } : signedOut),
			new ChatHub(s.chat, new Map(), s.folder),
			{ operateTelemetry: s.telemetry },
		);
		cleanups.push(() => {
			terminals.closeAll();
			void server.stop(true);
		});
		for (const path of ["logs", "logs/web", "costs", "costs/charges"])
			expect((await fetch(`http://127.0.0.1:${server.port}/operate/app/${path}`)).status).toBe(401);
		expect(
			(
				await fetch(`http://127.0.0.1:${server.port}/operate/app/costs`, {
					headers: { Authorization: "Bearer good" },
				})
			).status,
		).toBe(200);
	});
});
