import { expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { AutomationStore, DEFAULT_OPTIONS, type AutomationInput } from "./store";

test("saved jobs and interrupted runs survive reopening a separate SQLite file", () => {
	const folder = mkdtempSync(join(tmpdir(), "grid-automations-db-"));
	try {
		const path = join(folder, "runner-copy.db");
		const input: AutomationInput = {
			name: "Daily",
			prompt: "Check",
			provider: "claude",
			model: null,
			effort: null,
			mode: null,
			project: "grid",
			workspaceMode: "folder",
			enabled: true,
			triggers: [{ kind: "schedule", cadence: "daily", time: "09:00", timezone: "UTC" }],
		};
		const first = new AutomationStore(path);
		const item = first.create("alpha", "alice", input);
		first.start(item.id, "manual", null, null);
		const reopened = new AutomationStore(path);
		expect(reopened.get("alpha", item.id)?.name).toBe("Daily");
		expect(reopened.recover()).toHaveLength(1);
		expect(reopened.runs("alpha", item.id)[0].status).toBe("failed");
		expect(reopened.recover()).toHaveLength(0);
	} finally {
		rmSync(folder, { recursive: true, force: true });
	}
});

test("options and what a run came to are kept, and older rows read as defaults", () => {
	const store = new AutomationStore(":memory:");
	const item = store.create("alpha", "alice", {
		name: "Docs",
		prompt: "Sync docs",
		provider: "claude",
		model: null,
		effort: null,
		mode: null,
		project: "grid",
		workspaceMode: "worktree",
		enabled: true,
		triggers: [{ kind: "event", event: "pull_opened" }],
		options: { ...DEFAULT_OPTIONS, branch: "main", minutes: 20, offLimits: [".env"] },
	});
	expect(item.options).toMatchObject({ branch: "main", minutes: 20, offLimits: [".env"] });
	const run = store.start(item.id, "manual", null, null);
	store.finish(run?.id ?? "", "succeeded", null, "thread", {
		summary: "Updated the README",
		pullNumber: 12,
		costUsd: 0.4,
		steps: [{ title: "Edit README.md", detail: null }],
	});
	expect(store.runs("alpha", item.id)[0]).toMatchObject({
		summary: "Updated the README",
		pullNumber: 12,
		costUsd: 0.4,
		steps: [{ title: "Edit README.md", detail: null }],
	});
	const { options: _, ...withoutOptions } = item;
	const updated = store.update(item, { ...withoutOptions, name: "Docs sync" });
	expect(updated.options.branch).toBe("main");
});
