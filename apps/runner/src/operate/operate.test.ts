import { afterEach, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { Who } from "../auth";
import { InboxStore } from "../inbox/store";
import { ShipStore } from "../ship/store";
import { monitorUrl, probeService, publicAddress } from "./probe";
import { operateRequest } from "./routes";
import { Operate } from "./service";
import { OperateStore } from "./store";

const owner: Who = { userId: "u", workspace: "w", role: "owner" };
const closed: (() => void)[] = [];
afterEach(() => {
	for (const close of closed.splice(0)) close();
});
function setup(path = ":memory:") {
	let at = new Date("2026-10-05T20:00:00.000Z");
	let ok = true;
	let calls = 0;
	const store = new OperateStore(path);
	const ship = new ShipStore(path);
	const inbox = new InboxStore(path);
	closed.push(() => {
		store.close();
		inbox.close();
	});
	const folders: Record<string, Record<string, string>> = {
		w: { app: "/app", other: "/other" },
		foreign: { app: "/foreign" },
	};
	const operate = new Operate({
		store,
		ship,
		inbox,
		folders: (workspace) => folders[workspace] ?? {},
		now: () => at,
		probe: async () => {
			calls++;
			return { at: at.toISOString(), ok, ms: ok ? 42 : 10_000 };
		},
	});
	return {
		store,
		ship,
		inbox,
		operate,
		folders,
		at: () => at,
		advance: (ms = 60_000) => {
			at = new Date(at.getTime() + ms);
		},
		answer: (value: boolean) => {
			ok = value;
		},
		calls: () => calls,
	};
}
const site = "https://example.com/health";
const request = (
	operate: Operate,
	method: string,
	path = "/operate/app",
	body?: unknown,
	who = owner,
) =>
	operateRequest(
		new Request(`http://runner${path}`, {
			method,
			...(body === undefined ? {} : { body: JSON.stringify(body) }),
		}),
		new URL(`http://runner${path}`),
		who,
		operate,
	);

describe("Operate lifecycle", () => {
	it("checks without browser, debounces outage/recovery and retains deduplicated workspace Inbox events", async () => {
		const s = setup();
		s.operate.register(owner, "app", "production", site);
		expect(s.operate.view(owner, "app").services[0]?.state).toBe("unknown");
		await s.operate.tick();
		expect(s.operate.view(owner, "app").services[0]?.state).toBe("healthy");
		await s.operate.tick();
		expect(s.calls()).toBe(1);
		s.answer(false);
		for (let i = 0; i < 2; i++) {
			s.advance();
			await s.operate.tick();
		}
		expect(s.operate.view(owner, "app").services[0]?.state).toBe("degraded");
		expect(s.inbox.unread("w", "another-member")).toBe(0);
		s.advance();
		await s.operate.tick();
		let view = s.operate.view(owner, "app");
		expect(view.services[0]?.state).toBe("down");
		expect(view.incidents).toHaveLength(1);
		expect(s.inbox.list("w", "another-member").items[0]?.kind).toBe("incident_open");
		expect(s.inbox.list("foreign", "u").items).toHaveLength(0);
		const id = s.inbox.list("w", "u").items[0]?.id;
		s.inbox.read("w", "u", id);
		s.advance();
		await s.operate.tick();
		expect(s.inbox.unread("w", "u")).toBe(0);
		s.answer(true);
		s.advance();
		await s.operate.tick();
		expect(s.operate.view(owner, "app").services[0]?.state).toBe("down");
		s.advance();
		await s.operate.tick();
		view = s.operate.view(owner, "app");
		expect(view.services[0]?.state).toBe("healthy");
		expect(view.incidents[0]?.status).toBe("resolved");
		expect(s.inbox.list("w", "u").items).toHaveLength(2);
		expect(s.inbox.unread("w", "u")).toBe(1);
		expect(view.services[0]?.checks).toBe(7);
		expect(view.services[0]?.coverage).toBeCloseTo((7 / 1440) * 100);
		expect(view.services[0]?.uptime).toBeCloseTo((3 / 7) * 100);
		expect(view.services[0]?.p95).toBe(42);
	});
	it("shows stale observer as unknown and resets failure/success streaks over monitoring gaps", async () => {
		const s = setup();
		s.operate.register(owner, "app", "prod", site);
		s.answer(false);
		await s.operate.tick();
		s.advance();
		await s.operate.tick();
		s.advance(240_000);
		expect(s.operate.view(owner, "app").services[0]?.state).toBe("unknown");
		expect(s.operate.view(owner, "app").services[0]?.responseMs).toBeNull();
		await s.operate.tick();
		expect(s.operate.view(owner, "app").incidents).toHaveLength(0);
		s.advance();
		await s.operate.tick();
		s.advance();
		await s.operate.tick();
		s.answer(true);
		s.advance();
		await s.operate.tick();
		s.advance(240_000);
		await s.operate.tick();
		expect(s.operate.view(owner, "app").incidents[0]?.status).toBe("open");
		s.advance();
		await s.operate.tick();
		expect(s.operate.view(owner, "app").incidents[0]?.status).toBe("resolved");
	});
	it("inherits persistent Ship settings and respects removal and manual overrides", async () => {
		const s = setup();
		s.ship.setEnvironment("w", "app", "production", { url: site });
		s.ship.setEnvironment("foreign", "app", "production", { url: "https://foreign.example.com" });
		await s.operate.tick();
		expect(s.operate.view(owner, "app").services).toHaveLength(1);
		s.operate.remove(owner, "app", "production");
		s.advance();
		await s.operate.tick();
		expect(s.operate.view(owner, "app").services).toHaveLength(0);
		s.operate.register(owner, "app", "production", "https://manual.example.com");
		s.ship.setEnvironment("w", "app", "production", { url: "https://ship.example.com" });
		await s.operate.tick();
		expect(s.operate.view(owner, "app").services[0]?.url).toBe("https://manual.example.com/");
	});
	it("keeps same-address manual overrides and their observations when Ship changes", async () => {
		const s = setup();
		s.ship.setEnvironment("w", "app", "production", { url: site });
		await s.operate.tick();
		const before = s.store.monitors("w", "app")[0]!;
		s.operate.register(owner, "app", "production", site);
		s.ship.setEnvironment("w", "app", "production", { url: "https://changed.example.com" });
		s.advance();
		await s.operate.tick();
		expect(s.operate.view(owner, "app").services[0]).toMatchObject({ url: site, checks: 2 });
		expect(s.store.monitors("w", "app")[0]?.generation).toBe(before.generation);
	});
	it("reclaims stopped capacity and bounds old names without resurrecting stopped Ship services", () => {
		const s = setup();
		s.ship.setEnvironment("w", "app", "production", { url: site });
		s.operate.view(owner, "app");
		s.operate.remove(owner, "app", "production");
		for (let i = 0; i < 260; i++) {
			s.operate.register(owner, "app", `retired-${i}`, site);
			s.operate.remove(owner, "app", `retired-${i}`);
		}
		expect(s.store.monitors()).toHaveLength(201);
		for (let i = 0; i < 50; i++) s.operate.register(owner, "app", `active-${i}`, site);
		expect(() => s.operate.register(owner, "app", "overflow", site)).toThrow("50 monitors");
		s.operate.remove(owner, "app", "active-0");
		s.operate.register(owner, "app", "replacement", site);
		expect(s.operate.view(owner, "app").services).toHaveLength(50);
		expect(
			s.operate.view(owner, "app").services.some((service) => service.name === "production"),
		).toBe(false);
	});
	it("checks fifty timeout targets every minute and opens incidents after three rounds", async () => {
		const s = setup();
		let calls = 0;
		const pending: (() => void)[] = [];
		const operate = new Operate({
			store: s.store,
			ship: s.ship,
			inbox: s.inbox,
			folders: () => ({ app: "/app" }),
			now: s.at,
			probe: () => {
				calls++;
				return new Promise((resolve) =>
					pending.push(() => resolve({ at: s.at().toISOString(), ok: false, ms: 10_000 })),
				);
			},
		});
		for (let i = 0; i < 50; i++) operate.register(owner, "app", `service-${i}`, site);
		for (let round = 0; round < 3; round++) {
			const started = s.at().toISOString();
			const tick = operate.tick();
			for (let wave = 0; wave < 5; wave++) {
				expect(pending).toHaveLength(10);
				s.advance(10_000);
				for (const finish of pending.splice(0)) finish();
				await Promise.resolve();
			}
			await tick;
			expect(calls).toBe((round + 1) * 50);
			expect(
				operate.view(owner, "app").services.every((service) => service.checkedAt === started),
			).toBe(true);
			s.advance(10_000);
		}
		expect(operate.view(owner, "app").incidents).toHaveLength(50);
		expect(s.inbox.list("w", "u").items).toHaveLength(50);
	});
	it("persists state and replays outbox across restart without losing read state", async () => {
		const root = mkdtempSync(join(tmpdir(), "grid-operate-test-"));
		closed.push(() => rmSync(root, { recursive: true, force: true }));
		const path = join(root, "state.db");
		const s = setup(path);
		s.operate.register(owner, "app", "prod", site);
		for (let i = 0; i < 3; i++) {
			const monitor = s.store.monitors("w", "app")[0]!;
			s.store.record(monitor, { at: s.at().toISOString(), ok: false, ms: 15 });
			s.advance();
		}
		expect(s.store.outbox()).toHaveLength(1);
		const restarted = setup(path);
		expect(restarted.operate.view(owner, "app").incidents).toHaveLength(1);
		await restarted.operate.tick();
		expect(s.inbox.list("w", "u").items).toHaveLength(1);
		const draft = s.inbox.list("w", "u").items[0]!;
		s.inbox.read("w", "u", draft.id);
		s.inbox.keep(draft);
		expect(s.inbox.unread("w", "u")).toBe(0);
		expect(s.store.outbox()).toHaveLength(0);
	});
	it("removal and target change never claim an outage recovered; rejects obsolete in-flight results", async () => {
		const s = setup();
		s.operate.register(owner, "app", "prod", site);
		s.answer(false);
		for (let i = 0; i < 3; i++) {
			await s.operate.tick();
			s.advance();
		}
		s.operate.remove(owner, "app", "prod");
		expect(s.operate.view(owner, "app").incidents[0]).toMatchObject({
			status: "open",
			monitoring: false,
		});
		s.operate.register(owner, "app", "prod", site);
		const old = s.store.monitors("w", "app")[0]!;
		s.operate.remove(owner, "app", "prod");
		s.operate.register(owner, "app", "prod", site);
		expect(s.store.record(old, { at: s.at().toISOString(), ok: true, ms: 5 })).toBe(false);
	});
	it("prevents overlapping background checks", async () => {
		const s = setup();
		let finish: ((probe: { at: string; ok: boolean; ms: number }) => void) | undefined;
		let calls = 0;
		const operate = new Operate({
			store: s.store,
			ship: s.ship,
			inbox: s.inbox,
			folders: () => ({ app: "/app" }),
			now: s.at,
			probe: () => {
				calls++;
				return new Promise((resolve) => {
					finish = resolve;
				});
			},
		});
		operate.register(owner, "app", "prod", site);
		const tick = operate.tick();
		await operate.tick();
		expect(calls).toBe(1);
		finish?.({ at: s.at().toISOString(), ok: true, ms: 5 });
		await tick;
	});
});

describe("Operate input and isolation", () => {
	it("rejects private, credentialed and unsafe addresses without network requests", async () => {
		for (const raw of [
			"file:///etc/passwd",
			"http://localhost",
			"http://127.0.0.1",
			"http://169.254.169.254/latest",
			"http://2130706433",
			"http://[::1]",
			"http://[::ffff:127.0.0.1]",
			"https://example.com?a=secret",
			"https://example.com#token",
			"https://user:secret@example.com",
		])
			expect(() => monitorUrl(raw)).toThrow();
		expect(publicAddress("8.8.8.8")).toBe(true);
		expect(publicAddress("100.64.1.1")).toBe(false);
		expect(publicAddress("2001:4860:4860::8888")).toBe(true);
		expect(publicAddress("2002:7f00:1::")).toBe(false);
		expect((await probeService("http://127.0.0.1:4000")).ok).toBe(false);
	});
	it("enforces permissions, selected workspace, bounded request and documented methods", async () => {
		const s = setup();
		const member: Who = { ...owner, role: "member" };
		expect(
			(await request(s.operate, "PUT", "/operate/app/services/prod", { url: site }, member))
				?.status,
		).toBe(403);
		expect(s.operate.view(member, "app").allowed).toBe(false);
		expect(
			(await request(s.operate, "PUT", "/operate/app/services/prod", { url: site }))?.status,
		).toBe(204);
		expect(s.operate.view({ ...owner, workspace: "foreign" }, "app").services).toHaveLength(0);
		expect((await request(s.operate, "GET", "/operate/absent"))?.status).toBe(404);
		expect((await request(s.operate, "POST"))?.status).toBe(405);
		expect(
			(await request(s.operate, "PUT", "/operate/app/services/%00", { url: site }))?.status,
		).toBe(400);
		expect(
			(await request(s.operate, "PUT", "/operate/app/services/prod", { url: "x".repeat(5000) }))
				?.status,
		).toBe(413);
		expect((await request(s.operate, "DELETE", "/operate/app/services/prod"))?.status).toBe(204);
		expect((await request(s.operate, "DELETE", "/operate/app/services/prod"))?.status).toBe(404);
	});
});
