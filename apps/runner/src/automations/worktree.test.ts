import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { Provider } from "../agents/provider";
import { ChatHub } from "../chat/hub";
import { ChatStore } from "../chat/store";

function git(cwd: string, ...args: string[]): void {
	const child = Bun.spawnSync(["git", "-C", cwd, ...args], { stderr: "pipe" });
	if (child.exitCode !== 0) throw new Error(child.stderr.toString());
}

test("an unattended run gets a real worktree and rejects a linked folder outside the projects root", async () => {
	const root = mkdtempSync(join(tmpdir(), "grid-automation-worktree-"));
	try {
		const project = join(root, "project");
		mkdirSync(project);
		git(project, "init", "-q");
		git(project, "config", "user.name", "Grid Test");
		git(project, "config", "user.email", "grid@example.test");
		writeFileSync(join(project, "README.md"), "test\n");
		git(project, "add", "README.md");
		git(project, "commit", "-qm", "initial");
		const provider: Provider = {
			info: () => ({ id: "fake", name: "Fake", available: true, models: [], modes: [] }),
			start: async () => {
				throw new Error("not used");
			},
		};
		const store = new ChatStore(":memory:");
		store.setProjectFolder("alpha", "project", project);
		const hub = new ChatHub(store, new Map([["fake", provider]]), root);
		const who = { userId: "alice", workspace: "alpha" };
		const session = await hub.createAutomation(who, {
			project: "project",
			provider: "fake",
			worktree: true,
		});
		if (!session.worktree) throw new Error("The run did not create a worktree");
		expect(session.worktree.path.startsWith(join(root, ".grid-worktrees"))).toBe(true);
		expect(session.cwd).toBe(session.worktree.path);
		expect(store.get(session.id)?.worktree?.branch).toBe(`grid/chat-${session.id.slice(0, 8)}`);
		const outside = mkdtempSync(join(tmpdir(), "grid-automation-outside-"));
		try {
			symlinkSync(outside, join(root, "escape"));
			store.setProjectFolder("alpha", "escape", join(root, "escape"));
			await expect(
				hub.createAutomation(who, { project: "escape", provider: "fake", worktree: false }),
			).rejects.toThrow("inside the projects directory");
		} finally {
			rmSync(outside, { recursive: true, force: true });
		}
		store.close();
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});
