import { afterAll, describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { ChatHub } from "../chat/hub";
import { ChatStore } from "../chat/store";
import {
	changeTitle,
	type Deployment,
	groupEnvironments,
	nextVersion,
	versionOf,
} from "./deployments";
import { logExcerpt, readChecks, type ShipGitHub } from "./github";
import { detectMethod, methodIn, workflowEnvironments } from "./methods";
import { Ship } from "./service";
import { p95, ShipStore, uptime } from "./store";

const dir = mkdtempSync(join(tmpdir(), "grid-ship-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const CD = `
name: CD
on:
  push:
    branches: [main]
    tags: ["v*"]
  workflow_dispatch:
jobs:
  deploy-staging:
    if: github.ref == 'refs/heads/main'
    environment: staging
    runs-on: ubuntu-latest
  deploy-production:
    if: startsWith(github.ref, 'refs/tags/v')
    environment: production
    runs-on: ubuntu-latest
`;

describe("methods", () => {
	it("reads how each environment deploys from the workflows", () => {
		const workflow = Bun.YAML.parse(CD) as never;
		expect(methodIn("cd.yml", workflow, "production")).toEqual({
			kind: "tag",
			prefix: "v",
			workflow: "cd.yml",
		});
		expect(methodIn("cd.yml", workflow, "staging")).toEqual({
			kind: "branch",
			branch: "main",
			workflow: "cd.yml",
		});
		expect(methodIn("cd.yml", workflow, "preview")).toBeNull();
		expect(workflowEnvironments([{ file: "cd.yml", workflow }])).toEqual(["staging", "production"]);
		const dispatch = Bun.YAML.parse(
			"on: workflow_dispatch\njobs:\n  ship:\n    environment: { name: Production }\n",
		) as never;
		expect(detectMethod([{ file: "ship.yml", workflow: dispatch }], "production")).toEqual({
			kind: "dispatch",
			workflow: "ship.yml",
		});
	});
});

describe("deployments", () => {
	const deploy = (over: Partial<Deployment>): Deployment => ({
		id: 1,
		environment: "production",
		sha: "a".repeat(40),
		ref: "main",
		title: "x",
		author: "ana",
		creator: "ana",
		createdAt: "2026-10-01T00:00:00Z",
		finishedAt: "2026-10-01T00:01:00Z",
		state: "success",
		url: null,
		logUrl: null,
		...over,
	});

	it("groups environments, production first, the newest that succeeded live", () => {
		const groups = groupEnvironments([
			deploy({ id: 3, environment: "Preview", ref: "fix" }),
			deploy({ id: 2, state: "failed" }),
			deploy({ id: 1 }),
			deploy({ id: 4, environment: "staging" }),
		]);
		expect(groups.map((group) => [group.name, group.kind])).toEqual([
			["production", "production"],
			["staging", "staging"],
			["Preview", "preview"],
		]);
		expect(groups[0]?.history.map((item) => [item.id, item.state])).toEqual([
			[2, "failed"],
			[1, "live"],
		]);
		// A workflow's environment shows before its first deploy.
		expect(
			groupEnvironments([], ["Production"]).map((group) => [group.name, group.history]),
		).toEqual([["Production", []]]);
	});

	it("names commits by their release tag and works out the next one", () => {
		const tags = new Map([["abc", ["v0.8.3-beta", "v0.8.3"]]]);
		expect(versionOf("abc", tags)).toBe("v0.8.3");
		expect(versionOf("def1234567", tags)).toBe("def1234");
		expect(nextVersion(["v0.8.3", "v0.10.1", "v0.9.9", "other"], "v")).toBe("v0.10.2");
		expect(nextVersion([], "release-")).toBe("release-0.1.0");
		expect(changeTitle("Merge pull request #142 from a/b", "\nFix ETA rounding")).toBe(
			"Fix ETA rounding",
		);
		// GitHub carries the end of a long subject into the body.
		expect(
			changeTitle("Merge pull request #62 from a/native-row-act…", "…ions\n\nfeat: rows"),
		).toBe("feat: rows");
	});
});

describe("checks", () => {
	it("keeps each check's newest run, with how long it took and its Actions job", () => {
		const checks = readChecks(
			[
				{
					name: "Unit tests",
					status: "completed",
					conclusion: "failure",
					started_at: "2026-10-01T00:00:00Z",
					completed_at: "2026-10-01T00:01:10Z",
					html_url: "https://github.com/a/b/actions/runs/9/job/10",
					details_url: null,
				},
				{
					name: "Unit tests",
					status: "completed",
					conclusion: "success",
					started_at: "2026-09-30T00:00:00Z",
					completed_at: "2026-09-30T00:01:00Z",
					html_url: null,
					details_url: null,
				},
			],
			[
				{
					context: "Vercel",
					state: "pending",
					target_url: "https://vercel.com/x",
					created_at: "2026-10-01T00:02:00Z",
					updated_at: "2026-10-01T00:02:00Z",
				},
			],
		);
		expect(checks).toEqual([
			{
				name: "Unit tests",
				state: "failure",
				seconds: 70,
				startedAt: "2026-10-01T00:00:00Z",
				url: "https://github.com/a/b/actions/runs/9/job/10",
				run: 9,
				job: 10,
			},
			{
				name: "Vercel",
				state: "pending",
				seconds: null,
				startedAt: "2026-10-01T00:02:00Z",
				url: "https://vercel.com/x",
				run: null,
				job: null,
			},
		]);
	});

	it("cuts a failed log down to why", () => {
		const log = [
			"test\tRun tests\t2026-10-01T00:00:00.1Z $ bun test",
			"test\tRun tests\t2026-10-01T00:00:00.2Z src/jobs/eta.test.ts:",
			"test\tRun tests\t2026-10-01T00:00:00.3Z FAIL rounds 7 minutes up to 10",
			"test\tRun tests\t2026-10-01T00:00:00.4Z   expected 10, received 5",
		].join("\n");
		expect(logExcerpt(log)).toBe(
			"src/jobs/eta.test.ts:\nFAIL rounds 7 minutes up to 10\n  expected 10, received 5",
		);
		// What the test runner annotated wins, without the clean-up, colours or dependencies' frames.
		const annotated = [
			"test\tRun\t2026-10-01T00:00:00.1Z ^[[2mapi test: (pass) ok^[[22m",
			"test\tRun\t2026-10-01T00:00:00.2Z ::error file=node_modules/x/session.js,line=4::noise",
			"test\tRun\t2026-10-01T00:00:00.3Z ::error file=src/eta.test.ts,line=31,title=error: expect(received).toBe(expected)::Expected: 10%0AReceived: 5",
			"test\tRun\t2026-10-01T00:00:00.4Z ##[error]Process completed with exit code 1.",
			"test\tRun\t2026-10-01T00:00:00.5Z Post job cleanup.",
		].join("\n");
		expect(logExcerpt(annotated)).toBe(
			"src/eta.test.ts:31\n  error: expect(received).toBe(expected)\n  Expected: 10\n  Received: 5",
		);
		const plain = annotated
			.split("\n")
			.filter((line) => !line.includes("::error"))
			.join("\n");
		expect(logExcerpt(plain)).toBe(
			"api test: (pass) ok\nError: Process completed with exit code 1.",
		);
	});

	it("measures a site from Grid's own checks", () => {
		const probes = [10, 20, 30, 40].map((ms, index) => ({ at: String(index), ok: ms !== 40, ms }));
		expect(uptime(probes)).toBe(75);
		expect(p95(probes)).toBe(30);
		expect(uptime([])).toBeNull();
	});
});

describe("Ship", () => {
	const sha = (c: string) => c.repeat(40);
	function setup() {
		const projects = join(dir, "projects");
		const folder = join(projects, `app-${Math.random().toString(36).slice(2)}`);
		mkdirSync(join(folder, ".git"), { recursive: true });
		mkdirSync(join(folder, ".github", "workflows"), { recursive: true });
		writeFileSync(
			join(folder, ".git", "config"),
			'[remote "origin"]\n\turl = git@github.com:acme/app.git\n',
		);
		writeFileSync(join(folder, ".github", "workflows", "cd.yml"), CD);
		const chat = new ChatHub(new ChatStore(":memory:"), new Map(), projects);
		chat.linkProjectFolder("w", "app", folder);
		const deployments: Deployment[] = [
			{
				id: 40,
				environment: "staging",
				sha: sha("4"),
				ref: "main",
				title: "Fix ETA rounding off-by-one",
				author: "claude",
				creator: "acme-bot",
				createdAt: "2026-10-04T10:00:00Z",
				finishedAt: "2026-10-04T10:01:00Z",
				state: "success",
				url: "https://staging.acme.dev",
				logUrl: "https://github.com/acme/app/actions/runs/41/job/42",
			},
			{
				id: 30,
				environment: "production",
				sha: sha("3"),
				ref: "v0.8.3",
				title: "Seed demo drivers",
				author: "ana",
				creator: "acme-bot",
				createdAt: "2026-10-02T10:00:00Z",
				finishedAt: "2026-10-02T10:01:52Z",
				state: "success",
				url: null,
				logUrl: "https://github.com/acme/app/actions/runs/11/job/12",
			},
			{
				id: 25,
				environment: "production",
				sha: sha("5"),
				ref: "v0.8.1",
				title: "Pricing page copy",
				author: "opencode",
				creator: "acme-bot",
				createdAt: "2026-09-29T10:00:00Z",
				finishedAt: "2026-09-29T10:00:30Z",
				state: "failed",
				url: null,
				logUrl: "https://github.com/acme/app/actions/runs/26/job/27",
			},
			{
				id: 20,
				environment: "production",
				sha: sha("2"),
				ref: "v0.8.2",
				title: "Show ETA on the driver card",
				author: "ana",
				creator: "acme-bot",
				createdAt: "2026-09-28T10:00:00Z",
				finishedAt: "2026-09-28T10:01:47Z",
				state: "success",
				url: null,
				logUrl: "https://github.com/acme/app/actions/runs/21/job/22",
			},
		];
		const reruns: { run: number; job?: number | null }[] = [];
		const github = {
			deployments: async () => ({
				defaultBranch: "main",
				head: sha("4"),
				deployments: [...deployments],
				tags: new Map([
					[sha("3"), ["v0.8.3"]],
					[sha("2"), ["v0.8.2"]],
				]),
				tagNames: ["v0.8.3", "v0.8.2"],
			}),
			compare: async () => ({
				ahead: 2,
				commits: [
					{
						sha: sha("6"),
						title: "Bump vite",
						author: "ana",
						email: "ana@acme.dev",
						message: "Bump vite",
					},
					{
						sha: sha("4"),
						title: "Fix ETA rounding off-by-one",
						author: "ana",
						email: "ana@acme.dev",
						message: "Fix ETA\n\nCo-Authored-By: Claude Opus <noreply@anthropic.com>",
					},
				],
				files: [
					{ path: "db/migrations/0042_eta_rounding.sql", status: "added" },
					{ path: "src/eta.ts", status: "modified" },
				],
			}),
			checks: async () => [
				{ name: "Lint", state: "success", seconds: 18, startedAt: null, url: null, run: 1, job: 2 },
			],
			openPulls: async () => [],
			commit: async () => ({ title: "x", author: "ana", email: "", at: "", message: "x" }),
			failedLog: async () => "",
			rerun: async (_repo: string, run: number, which: { job?: number | null }) => {
				reruns.push({ run, job: which.job });
			},
			moveBranch: async () => {},
			dispatch: async () => {},
		} as unknown as ShipGitHub;
		const told: string[] = [];
		const store = new ShipStore(":memory:");
		let answering = true;
		const ship = new Ship({
			chat,
			github,
			store,
			notify: (_user, message) => told.push(message.title),
			fetcher: (async () =>
				new Response(null, { status: answering ? 200 : 503 })) as unknown as typeof fetch,
		});
		return {
			ship,
			folder,
			store,
			deployments,
			reruns,
			told,
			down: () => {
				answering = false;
			},
		};
	}
	const who = { userId: "u1", workspace: "w" };

	it("lists the environments, staging ahead of production", async () => {
		const { ship } = setup();
		const overview = await ship.overview(who, "app");
		expect(overview.repository).toBe("acme/app");
		expect(
			overview.environments.map((env) => [env.name, env.version, env.state, env.ahead]),
		).toEqual([
			["production", "v0.8.3", "healthy", null],
			["staging", "4444444", "healthy", 2],
		]);
		expect(overview.pipelines[0]).toMatchObject({ id: "main", state: "passing" });
	});

	it("shows what promoting would ship, as the next release tag, and each deploy's history", async () => {
		const { ship } = setup();
		const production = await ship.environment(who, "app", "production");
		expect(production.promotion).toMatchObject({
			from: { name: "staging", sha: sha("4") },
			ahead: 2,
			version: "v0.8.4",
			migrations: ["0042_eta_rounding.sql"],
			checks: { total: 1, passed: 1, failed: 0, pending: 0 },
			ready: true,
		});
		expect(production.promotion?.commits.map((commit) => commit.agent)).toEqual(["claude", null]);
		expect(production.method).toBe("A vx.y.z release tag starts cd.yml");
		expect(production.history.map((item) => [item.version, item.state, item.canRollback])).toEqual([
			["v0.8.3", "live", false],
			["5555555", "failed", false],
			["v0.8.2", "success", true],
		]);
		expect(production.history[0]?.seconds).toBe(112);
	});

	it("promotes with a person's command, and rolls back by running the old deploy again", async () => {
		const { ship, folder, reruns } = setup();
		ship.setSettings(who, "app", "production", {
			promote: 'echo "$GRID_SHA $GRID_VERSION" > promoted',
		});
		expect((await ship.environment(who, "app", "production")).method).toBe(
			'Runs echo "$GRID_SHA $GRID_VERSION" > promoted',
		);
		await ship.promote(who, "app", "production", { watch: false });
		expect(readFileSync(join(folder, "promoted"), "utf8").trim()).toBe(`${sha("4")} 4444444`);
		await ship.rollback(who, "app", "production", 20);
		expect(reruns).toEqual([{ run: 21, job: 22 }]);
		await expect(ship.rollback(who, "app", "production", 40)).rejects.toThrow("not in this");
	});

	it("refuses people whose role may not deploy to production", async () => {
		const { ship } = setup();
		const member = { ...who, role: "member" as const };
		await expect(ship.promote(member, "app", "production", { watch: false })).rejects.toThrow(
			"can't do this",
		);
		expect((await ship.environment(member, "app", "production")).allowed).toBe(false);
	});

	it("rolls back on its own when the site stops answering after a promotion", async () => {
		const { ship, store, deployments, reruns, told, down } = setup();
		ship.setSettings(who, "app", "production", { promote: "true", url: "https://acme.dev" });
		await ship.promote(who, "app", "production", { watch: true });
		const watch = store.watch("w", "app", "production");
		expect(watch).toMatchObject({ outcome: "watching", previous: { id: 30, version: "v0.8.3" } });
		deployments.unshift({
			...deployments[1],
			id: 50,
			sha: sha("4"),
			createdAt: new Date().toISOString(),
			finishedAt: new Date().toISOString(),
		} as Deployment);
		down();
		for (let check = 0; check < 3; check++) await ship.tick();
		expect(store.watch("w", "app", "production")?.outcome).toBe("rolled-back");
		expect(reruns).toEqual([{ run: 11, job: 12 }]);
		expect(told).toEqual(["Rolled back production to v0.8.3"]);
	});
});
