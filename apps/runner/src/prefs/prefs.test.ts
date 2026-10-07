import { describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { creditNote, gitEnvironment, signingKey } from "./git";
import { isQuiet } from "./quiet";
import { patchPrefs, prefsRequest } from "./routes";
import { DEFAULT_PREFS, PrefsStore } from "./store";

describe("person prefs", () => {
	it("keep what was set over the defaults, per person", () => {
		const store = new PrefsStore(":memory:");
		expect(store.get("me")).toEqual(DEFAULT_PREFS);
		const next = patchPrefs(store.get("me"), {
			git: { name: "Ana", email: "ana@example.com", creditAgent: false },
			notify: {
				channels: { runs: { phone: true } },
				quiet: { on: true, timezone: "Asia/Karachi" },
			},
		});
		store.set("me", next);
		expect(store.get("me").git).toMatchObject({
			name: "Ana",
			creditAgent: false,
			signCommits: false,
		});
		expect(store.get("me").notify.channels.runs).toEqual({ desktop: true, phone: true });
		expect(store.get("me").notify.quiet).toMatchObject({
			on: true,
			from: "22:00",
			timezone: "Asia/Karachi",
		});
		expect(store.get("you")).toEqual(DEFAULT_PREFS);
	});
	it("drop the email channel and digest that older runners saved, which nothing ever sent", () => {
		const store = new PrefsStore(":memory:");
		// As a runner before 2026-10-07 stored them.
		const legacy = {
			notify: {
				channels: { reviews: { desktop: false, phone: true, email: true } },
				digest: true,
			},
		};
		store.set("me", legacy as never);
		const prefs = store.get("me");
		expect(prefs.notify.channels.reviews).toEqual({ desktop: false, phone: true });
		expect(prefs.notify).not.toHaveProperty("digest");
	});
	it("refuse what is not a setting", () => {
		for (const bad of [
			[],
			{ git: { email: "not an email" } },
			{ git: { creditAgent: "yes" } },
			{ notify: { channels: { spam: { phone: true } } } },
			{ notify: { quiet: { from: "25:00" } } },
			{ notify: { quiet: { timezone: "Mars/Olympus" } } },
		])
			expect(() => patchPrefs(DEFAULT_PREFS, bad)).toThrow();
	});
	it("answer over HTTP with the signing key, and say what is wrong", async () => {
		const store = new PrefsStore(":memory:");
		const call = (method: string, body?: unknown) =>
			prefsRequest(
				new Request("http://runner/prefs", {
					method,
					body: body ? JSON.stringify(body) : undefined,
				}),
				new URL("http://runner/prefs"),
				"me",
				store,
			);
		const saved = await call("PATCH", { notify: { lockScreen: false } });
		expect(saved?.status).toBe(200);
		const data = ((await saved?.json()) as { data: { prefs: typeof DEFAULT_PREFS } }).data;
		expect(data.prefs.notify.lockScreen).toBe(false);
		expect(data).toHaveProperty("signingKey");
		expect((await call("PATCH", { notify: { lockScreen: 1 } }))?.status).toBe(400);
		expect((await call("DELETE"))?.status).toBe(405);
	});
});

describe("quiet hours", () => {
	const quiet = { ...DEFAULT_PREFS.notify.quiet, on: true, timezone: "UTC" };
	it("run overnight, through the day, and all weekend when asked", () => {
		// 2026-10-07 is a Wednesday.
		expect(isQuiet(quiet, new Date("2026-10-07T23:30:00Z"))).toBe(true);
		expect(isQuiet(quiet, new Date("2026-10-07T07:59:00Z"))).toBe(true);
		expect(isQuiet(quiet, new Date("2026-10-07T08:00:00Z"))).toBe(false);
		expect(
			isQuiet({ ...quiet, from: "12:00", to: "13:00" }, new Date("2026-10-07T12:30:00Z")),
		).toBe(true);
		expect(isQuiet({ ...quiet, on: false }, new Date("2026-10-07T23:30:00Z"))).toBe(false);
		const saturday = new Date("2026-10-10T15:00:00Z");
		expect(isQuiet(quiet, saturday)).toBe(false);
		expect(isQuiet({ ...quiet, weekends: true }, saturday)).toBe(true);
	});
	it("follow the person's zone", () => {
		// 03:00 UTC is 08:00 in Karachi: quiet in UTC, over in Karachi.
		const at = new Date("2026-10-07T03:00:00Z");
		expect(isQuiet(quiet, at)).toBe(true);
		expect(isQuiet({ ...quiet, timezone: "Asia/Karachi" }, at)).toBe(false);
	});
});

describe("git identity", () => {
	it("gives agents the person's name, and signs only with a key", () => {
		const git = { name: "Ana", email: "ana@example.com", creditAgent: true, signCommits: true };
		const key = { path: "/home/ana/.ssh/id_ed25519.pub", type: "ed25519", addedAt: "" };
		expect(gitEnvironment(git, key)).toEqual({
			GIT_AUTHOR_NAME: "Ana",
			GIT_AUTHOR_EMAIL: "ana@example.com",
			GIT_COMMITTER_NAME: "Ana",
			GIT_COMMITTER_EMAIL: "ana@example.com",
			GIT_CONFIG_COUNT: "3",
			GIT_CONFIG_KEY_0: "gpg.format",
			GIT_CONFIG_VALUE_0: "ssh",
			GIT_CONFIG_KEY_1: "user.signingkey",
			GIT_CONFIG_VALUE_1: key.path,
			GIT_CONFIG_KEY_2: "commit.gpgsign",
			GIT_CONFIG_VALUE_2: "true",
		});
		expect(gitEnvironment({ ...git, name: null }, null)).toEqual({});
		expect(creditNote(git)).toBeNull();
		expect(creditNote({ ...git, creditAgent: false })).toContain("Co-authored-by");
	});
	it("finds this machine's SSH key", () => {
		const home = mkdtempSync(join(tmpdir(), "grid-home-"));
		try {
			expect(signingKey(home)).toBeNull();
			mkdirSync(join(home, ".ssh"));
			writeFileSync(join(home, ".ssh", "id_rsa.pub"), "ssh-rsa AAA");
			writeFileSync(join(home, ".ssh", "id_ed25519.pub"), "ssh-ed25519 AAA");
			expect(signingKey(home)?.type).toBe("ed25519");
		} finally {
			rmSync(home, { recursive: true, force: true });
		}
	});
});
