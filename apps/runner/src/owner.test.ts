import { afterAll, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createTokenVerifier } from "./auth";
import { OTHER_WORKSPACE, type Person, RunnerOwner } from "./owner";

const dir = mkdtempSync(join(tmpdir(), "grid-runner-owner-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));
let count = 0;
const database = () => join(dir, `owner-${++count}.db`);

const ME: Person = {
	userId: "me",
	email: "me@grid.test",
	workspaces: [
		{ id: "ws-home", role: "owner" },
		{ id: "ws-team", role: "admin" },
	],
};
const TEAMMATE: Person = {
	userId: "teammate",
	email: "teammate@grid.test",
	workspaces: [
		{ id: "ws-team", role: "member" },
		{ id: "ws-theirs", role: "owner" },
	],
};
// Anyone who can sign up can make a workspace and be its owner.
const STRANGER: Person = {
	userId: "stranger",
	email: "stranger@grid.test",
	workspaces: [{ id: "ws-stranger", role: "owner" }],
};

describe("RunnerOwner", () => {
	it("belongs to the first owner to sign in, and serves only the workspaces they are in", () => {
		const owner = new RunnerOwner(database());
		expect(owner.admits(ME, "ws-home")).toBe(true);
		expect(owner.admits(TEAMMATE, "ws-team")).toBe(true);
		expect(owner.admits(TEAMMATE, "ws-theirs")).toBe(false);
		expect(owner.admits(STRANGER, "ws-stranger")).toBe(false);
	});

	it("lets no one but an owner claim it", () => {
		const owner = new RunnerOwner(database());
		expect(owner.admits(TEAMMATE, "ws-team")).toBe(false);
		expect(owner.admits(ME, "ws-team")).toBe(false);
		expect(owner.admits(ME, "ws-home")).toBe(true);
	});

	it("on a runner that already holds work, is claimed only by an owner of that work", () => {
		const owner = new RunnerOwner(database(), null, () => ["ws-home"]);
		expect(owner.admits(STRANGER, "ws-stranger")).toBe(false);
		// Signing in to their team first still claims it: the work here is theirs.
		expect(owner.admits(ME, "ws-team")).toBe(true);
		expect(owner.admits(STRANGER, "ws-stranger")).toBe(false);
	});

	it("is whoever RUNNER_OWNER names, by email or id", () => {
		const owner = new RunnerOwner(database(), "me@grid.test");
		expect(owner.admits(STRANGER, "ws-stranger")).toBe(false);
		expect(owner.admits(ME, "ws-team")).toBe(true);
		expect(owner.admits(STRANGER, "ws-stranger")).toBe(false);
	});

	it("keeps its owner across restarts, and follows the workspaces they join and leave", () => {
		const path = database();
		new RunnerOwner(path).admits(ME, "ws-home");
		const restarted = new RunnerOwner(path);
		expect(restarted.admits(STRANGER, "ws-stranger")).toBe(false);
		expect(restarted.admits(TEAMMATE, "ws-team")).toBe(true);
		restarted.admits({ ...ME, workspaces: [{ id: "ws-home", role: "owner" }] }, "ws-home");
		expect(new RunnerOwner(path).admits(TEAMMATE, "ws-team")).toBe(false);
	});
});

describe("signing in to a runner that serves another workspace", () => {
	it("refuses it as forbidden, not as signed out", async () => {
		const fetcher = (async (input: string | URL | Request) =>
			Response.json(
				input.toString().endsWith("/auth/me")
					? { data: { id: "stranger", email: "stranger@grid.test" } }
					: { data: [{ id: "ws-stranger", slug: "mine", isDefault: true, role: "owner" }] },
			)) as typeof fetch;
		const owner = new RunnerOwner(database());
		owner.admits(ME, "ws-home");
		const verify = createTokenVerifier(
			"http://api.test",
			fetcher,
			() => {},
			() => {},
			(person, workspace) => owner.admits(person, workspace),
		);
		expect(await verify("t1")).toEqual({ status: 403, message: OTHER_WORKSPACE });
	});
});
