import { afterAll, describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { Who } from "../auth";
import { machineRequest, type MachineDeps } from "./routes";
import { GridUpdater, type UpdateRun } from "./update";

const dir = mkdtempSync(join(tmpdir(), "grid-update-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));
let n = 0;

/** A checkout with the update script, and a git that answers like one. */
function updater(env: Record<string, string> = { INVOCATION_ID: "x", PATH: "/usr/bin" }) {
	const root = join(dir, `checkout-${++n}`);
	mkdirSync(join(root, ".git"), { recursive: true });
	mkdirSync(join(root, "scripts", "bash"), { recursive: true });
	writeFileSync(join(root, "scripts", "bash", "update-grid.sh"), "");
	const statusFile = join(dir, `status-${n}`, "update-status.json");
	const launched: string[][] = [];
	let clock = Date.parse("2026-10-07T12:00:00Z");
	const grid = new GridUpdater({
		root,
		statusFile,
		env,
		which: (bin) => (bin === "systemd-run" ? "/usr/bin/systemd-run" : null),
		run: (cmd) => {
			if (cmd[1] === "log") return { ok: true, out: "abc1234\tfix: something" };
			if (cmd[1] === "rev-list") return { ok: true, out: "3" };
			return { ok: true, out: "" };
		},
		launch: (cmd) => launched.push(cmd),
		now: () => clock,
	});
	return { grid, statusFile, launched, advance: (ms: number) => (clock += ms) };
}

describe("GridUpdater", () => {
	it("updates only as a systemd service with systemd-run", () => {
		expect(updater({}).grid.status()).toMatchObject({
			available: false,
			reason: "Grid is not running as a systemd service on this machine",
		});
		const { grid } = updater();
		expect(grid.status()).toMatchObject({
			available: true,
			current: { commit: "abc1234", subject: "fix: something" },
			last: null,
		});
	});

	it("counts what main has that this checkout has not", () => {
		const { grid } = updater();
		expect(grid.status().behind).toBeNull();
		expect(grid.check().behind).toBe(3);
	});

	it("starts the script outside the service, once at a time", () => {
		const { grid, launched, statusFile } = updater();
		expect(grid.start()).toBe(true);
		expect(launched).toHaveLength(1);
		const cmd = launched[0] ?? [];
		expect(cmd.slice(0, 2)).toEqual(["systemd-run", "--user"]);
		expect(cmd).toContain(`--setenv=GRID_UPDATE_STATUS=${statusFile}`);
		expect(cmd).toContain("--setenv=PATH=/usr/bin");
		expect(cmd.at(-1)).toEndWith("scripts/bash/update-grid.sh");
		expect(grid.status().last).toMatchObject({ state: "running", from: "abc1234" });
		// A second press while it runs starts nothing.
		expect(grid.start()).toBe(false);
		expect(launched).toHaveLength(1);
	});

	it("reports a run that never finished as stopped, and lets a new one start", () => {
		const { grid, advance } = updater();
		grid.start();
		advance(31 * 60_000);
		expect(grid.status().last).toMatchObject({
			state: "failed",
			message: "The update stopped without finishing",
		});
		expect(grid.start()).toBe(true);
	});

	it("shows what the script wrote", () => {
		const { grid, statusFile } = updater();
		grid.start();
		const done: UpdateRun = {
			state: "done",
			step: "restarting",
			startedAt: "2026-10-07T12:00:00Z",
			finishedAt: "2026-10-07T12:02:00Z",
			from: "abc1234",
			to: "def5678",
			message: "Updated from abc1234 to def5678; restarting",
		};
		writeFileSync(statusFile, JSON.stringify(done));
		expect(grid.status().last).toEqual(done);
	});
});

describe("the update routes", () => {
	const deps = (grid: GridUpdater) => ({ updater: grid }) as unknown as MachineDeps;
	const call = (grid: GridUpdater, who: Who, method: string, path: string) =>
		machineRequest(
			new Request(`http://runner${path}`, { method }),
			new URL(`http://runner${path}`),
			who,
			deps(grid),
		);
	const owner: Who = { userId: "u1", workspace: "w", role: "owner" };
	const member: Who = { userId: "u2", workspace: "w", role: "member" };

	it("lets anyone see the version, and only those who manage machines update", async () => {
		const { grid, launched } = updater();
		expect((await call(grid, member, "GET", "/machine/update"))?.status).toBe(200);
		expect((await call(grid, member, "POST", "/machine/update"))?.status).toBe(403);
		expect((await call(grid, member, "POST", "/machine/update/check"))?.status).toBe(403);
		expect(launched).toHaveLength(0);
		expect((await call(grid, owner, "POST", "/machine/update"))?.status).toBe(202);
		expect((await call(grid, owner, "POST", "/machine/update"))?.status).toBe(409);
		expect(launched).toHaveLength(1);
	});

	it("says why when this machine cannot update itself", async () => {
		const { grid } = updater({});
		const response = await call(grid, owner, "POST", "/machine/update");
		expect(response?.status).toBe(400);
		expect(((await response?.json()) as { message: string }).message).toContain("systemd");
	});
});
