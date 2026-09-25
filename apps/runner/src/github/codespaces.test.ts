import { describe, expect, it } from "bun:test";

import type { Environment } from "../environments/registry";
import { CodespacesLink, GitHubError } from "./codespaces";
import type { Gh, GhResult } from "./gh";

/** A `gh` that answers from a script: each call gets the first matching answer. */
function fakeGh(answers: { match: RegExp; result: Partial<GhResult> }[]) {
	const calls: string[] = [];
	const spawned: string[] = [];
	let finishSpawn: (code: number) => void = () => {};
	const gh: Gh = {
		async run(args) {
			const line = args.join(" ");
			calls.push(line);
			const answer = answers.find((item) => item.match.test(line));
			return { code: 0, stdout: "", stderr: "", ...answer?.result };
		},
		spawn(args) {
			spawned.push(args.join(" "));
			const listeners: ((text: string) => void)[] = [];
			queueMicrotask(() => {
				for (const listener of listeners) {
					listener(
						"! One-time code (AB12-CD34) copied to clipboard\nOpen https://github.com/login/device\n",
					);
				}
			});
			return {
				output: (listener) => listeners.push(listener),
				exited: new Promise<number>((resolve) => {
					finishSpawn = resolve;
				}),
				kill: () => finishSpawn(1),
			};
		},
	};
	return { gh, calls, spawned, finish: (code: number) => finishSpawn(code) };
}

const signedIn = {
	match: /^auth status/,
	result: {
		stdout:
			"github.com\n  ✓ Logged in to github.com account octo (keyring)\n  - Token scopes: 'codespace', 'repo'\n",
	},
};

function link(gh: Gh, environments: Environment[] = [], paired: unknown[] = []) {
	return new CodespacesLink(
		":memory:",
		gh,
		{
			environments: () => environments,
			pair: async (_owner, input) => {
				paired.push(input);
				return {
					id: "env-1",
					label: input.label,
					url: input.url,
					codespace: input.codespace,
					createdAt: "",
				};
			},
		},
		async () => {},
	);
}

describe("CodespacesLink sign-in", () => {
	it("claims a machine that is already signed in, for the first person only", async () => {
		const { gh } = fakeGh([signedIn]);
		const github = link(gh);
		const mine = await github.signIn("u1");
		expect(mine).toMatchObject({ login: "octo", canManageCodespaces: true, claimedBy: "you" });
		expect((await github.status("u2")).claimedBy).toBe("someone-else");
		expect(github.signIn("u2")).rejects.toBeInstanceOf(GitHubError);
		expect(github.list("u2")).rejects.toThrow("Someone else");
	});

	it("runs GitHub's device sign-in, shows its code, and claims it once approved", async () => {
		let loggedIn = false;
		const { gh, spawned, finish } = fakeGh([
			{
				match: /^auth status/,
				get result() {
					return loggedIn ? signedIn.result : { code: 1, stderr: "not logged in" };
				},
			},
		]);
		const github = link(gh);
		const waiting = await github.signIn("u1");
		expect(spawned[0]).toContain("auth login");
		expect(spawned[0]).toContain("--scopes codespace");
		expect(waiting.pending).toEqual({ code: "AB12-CD34", url: "https://github.com/login/device" });
		expect(waiting.claimedBy).toBeNull();

		loggedIn = true;
		finish(0);
		await Bun.sleep(5);
		const done = await github.status("u1");
		expect(done).toMatchObject({ claimedBy: "you", login: "octo", pending: null });
	});

	it("asks only for the Codespaces scope when signed in without it", async () => {
		const { gh, spawned } = fakeGh([
			{ match: /^auth status/, result: { stdout: "account octo\n  - Token scopes: 'repo'\n" } },
		]);
		await link(gh).signIn("u1");
		expect(spawned[0]).toBe("auth refresh --hostname github.com --scopes codespace");
	});
});

describe("CodespacesLink Codespaces", () => {
	it("lists Codespaces with the environment each is paired as", async () => {
		const { gh } = fakeGh([
			signedIn,
			{
				match: /^codespace list/,
				result: {
					stdout: JSON.stringify([
						{
							name: "cs-1",
							displayName: "Grid",
							repository: "o/grid",
							state: "Available",
							machineName: "basic",
							lastUsedAt: "t",
						},
						{
							name: "cs-2",
							displayName: "",
							repository: "o/app",
							state: "Shutdown",
							machineName: "basic",
							lastUsedAt: "t",
						},
					]),
				},
			},
		]);
		const github = link(gh, [
			{ id: "env-9", label: "Grid", url: "u", codespace: "cs-1", createdAt: "" },
		]);
		await github.signIn("u1");
		const list = await github.list("u1");
		expect(list.map((item) => [item.name, item.environment, item.displayName])).toEqual([
			["cs-1", "env-9", "Grid"],
			["cs-2", null, "cs-2"],
		]);
	});

	it("connects a Codespace: starts it, asks Grid inside for a code over SSH, and pairs", async () => {
		const paired: unknown[] = [];
		const { gh, calls } = fakeGh([
			signedIn,
			{
				match: /^api user\/codespaces\/cs-1$/,
				result: {
					stdout: JSON.stringify({
						state: "Available",
						repository: { name: "grid" },
						display_name: "Grid",
					}),
				},
			},
			{
				match: /^codespace ssh/,
				result: {
					stdout:
						"Pairing code: WXYZ-2345  (valid for 10 minutes)\nAddress: http://cs-1.tail.ts.net:4100\n",
				},
			},
		]);
		const github = link(gh, [], paired);
		await github.signIn("u1");
		github.connect("u1", "cs-1");
		await Bun.sleep(5);
		expect(calls.find((line) => line.startsWith("codespace ssh"))).toContain(
			"cd '/workspaces/grid' && GRID_PAIRING=1 bun run grid:pair",
		);
		expect(paired).toEqual([
			{ url: "http://cs-1.tail.ts.net:4100", code: "WXYZ-2345", label: "Grid", codespace: "cs-1" },
		]);
	});

	it("refuses names and repositories that are not what they claim to be", async () => {
		const { gh, calls } = fakeGh([signedIn]);
		const github = link(gh);
		await github.signIn("u1");
		expect(github.start("u1", "cs; rm -rf /")).rejects.toThrow("not a Codespace name");
		expect(() => github.connect("u1", "../x")).toThrow("not a Codespace name");
		expect(github.create("u1", { repository: "not a repo" })).rejects.toThrow("owner/name");
		expect(calls.some((line) => line.includes("rm -rf"))).toBe(false);
	});
});
