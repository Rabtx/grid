import { expect, test } from "bun:test";
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { ChatHub } from "../chat/hub";
import { ChatStore } from "../chat/store";
import { folderRequest } from "./routes";

test("shared project folders expose agent attribution only to the session's workspace", async () => {
	const root = realpathSync(mkdtempSync(join(tmpdir(), "grid-attribution-")));
	const store = new ChatStore(":memory:");
	try {
		const git = (...args: string[]) => {
			const result = Bun.spawnSync(["git", "-C", root, ...args], {
				env: {
					...process.env,
					GIT_AUTHOR_NAME: "Fixture",
					GIT_AUTHOR_EMAIL: "fixture@example.test",
					GIT_COMMITTER_NAME: "Fixture",
					GIT_COMMITTER_EMAIL: "fixture@example.test",
					GIT_AUTHOR_DATE: "2020-01-01T00:00:00Z",
					GIT_COMMITTER_DATE: "2020-01-01T00:00:00Z",
				},
			});
			expect(result.exitCode).toBe(0);
		};
		git("init", "-q", "-b", "main");
		const file = join(root, "file.ts");
		writeFileSync(file, "export const value = 1;\n");
		git("add", "file.ts");
		git("commit", "-q", "-m", "fixture");
		writeFileSync(file, "export const value = 2;\n");
		const hub = new ChatHub(store, new Map(), root);
		for (const workspace of ["alpha", "beta"]) {
			store.setProjectFolder(workspace, "app", root);
			store.create({
				id: `thread-${workspace}`,
				ownerId: "same-person",
				workspaceId: workspace,
				project: "app",
				provider: `agent-${workspace}`,
				title: `Private ${workspace} thread`,
				cwd: root,
				model: null,
				mode: null,
				effort: null,
				worktree: null,
			});
		}
		const read = async (workspace: string, path: string) => {
			const url = new URL(`http://runner${path}`);
			const response = await folderRequest(new Request(url.href), url, workspace, hub, root);
			expect(response?.status).toBe(200);
			return (await response!.json()) as {
				data: {
					git: {
						changes: { agent: string | null; thread: unknown }[];
						change: { agent: string | null; thread: unknown };
					};
					commits: { sha: string | null; agent?: string | null }[];
				};
			};
		};
		for (const latest of ["alpha", "beta", "alpha"]) {
			store.recordAgentEdits(`thread-${latest}`, `agent-${latest}`, [file]);
			for (const workspace of ["alpha", "beta"]) {
				const visible = workspace === latest;
				const listing = await read(workspace, "/projects/files/app?git=1");
				const content = await read(workspace, "/projects/files/app/content?path=file.ts");
				for (const change of [listing.data.git.changes[0], content.data.git.change]) {
					expect(change?.agent).toBe(visible ? `agent-${latest}` : null);
					expect(change?.thread).toEqual(
						visible ? { id: `thread-${latest}`, title: `Private ${latest} thread` } : null,
					);
				}
				const blame = await read(workspace, "/projects/files/app/blame?path=file.ts");
				expect(blame.data.commits.find((commit) => commit.sha === null)?.agent ?? null).toBe(
					visible ? `agent-${latest}` : null,
				);
			}
		}
	} finally {
		store.close();
		rmSync(root, { recursive: true, force: true });
	}
});
