import { readFileSync } from "node:fs";
import { afterAll, describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { Provider } from "../agents/provider";
import { signedOut } from "../auth";
import { ChatHub } from "../chat/hub";
import { ChatStore } from "../chat/store";
import { readConfig } from "../config";
import { spawnPty } from "../pty";
import { startServer } from "../server";
import { TerminalStore } from "../terminals";
import { SkillStore } from "./store";

/** The skills an index points to, read from disk: what an agent following it would read. */
function readIndexed(index: string): string {
	return [...index.matchAll(/Read (\S+SKILL\.md)/g)]
		.map((match) => readFileSync(match[1] ?? "", "utf8"))
		.join("\n");
}

const data = mkdtempSync(join(tmpdir(), "grid-skills-runner-"));
const projectsDir = join(data, "projects");
mkdirSync(join(projectsDir, "website"), { recursive: true });
const config = {
	...readConfig({
		RUNNER_PROJECTS_DIR: projectsDir,
		RUNNER_CWD: projectsDir,
		RUNNER_CHAT_DB: join(data, "chat.db"),
	}),
	port: 0,
	shell: "/bin/sh",
};
const provider: Provider = {
	info: () => ({ id: "fake", name: "Fake agent", available: true, models: [], modes: [] }),
	start: async () => {
		throw new Error("This HTTP test must not start an agent");
	},
};
const chats = new ChatStore(":memory:");
chats.setProjectFolder("workspace-1", "website", join(projectsDir, "website"));
const hub = new ChatHub(chats, new Map([["fake", provider]]), projectsDir);
const skills = new SkillStore(join(data, "skills"));
hub.setSkills((workspace, project) => skills.instructions(workspace, project));
const terminals = new TerminalStore(config, spawnPty);
const server = startServer(
	config,
	terminals,
	async (token) => {
		if (token === "owner")
			return { who: { userId: "owner", workspace: "workspace-1", role: "owner" } };
		if (token === "member")
			return { who: { userId: "member", workspace: "workspace-1", role: "member" } };
		return signedOut;
	},
	hub,
	{ skills },
);
const base = `http://127.0.0.1:${server.port}`;
const auth = { Authorization: "Bearer owner" };
const skillMarkdown = `---\nname: review-prs\ndescription: Review pull requests carefully\n---\n\nCheck the changed paths.`;

afterAll(() => {
	terminals.closeAll();
	void server.stop(true);
	rmSync(data, { recursive: true, force: true });
});

describe("runner skills API", () => {
	it("authenticates reads and reports providers and linked projects", async () => {
		expect((await fetch(`${base}/skills`)).status).toBe(401);
		const response = await fetch(`${base}/skills`, { headers: auth });
		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({
			data: {
				skills: [],
				projects: ["website"],
				providers: [
					{ id: "fake", name: "Fake agent", available: true, delivery: "message-context" },
				],
			},
		});
	});

	it("creates, scopes, disables, edits and removes a skill through the HTTP routes", async () => {
		const created = await fetch(`${base}/skills`, {
			method: "POST",
			headers: { ...auth, "Content-Type": "application/json" },
			body: JSON.stringify({
				skillMarkdown,
				scope: { type: "project", project: "website" },
				source: { type: "written" },
			}),
		});
		expect(created.status).toBe(201);
		const skill = ((await created.json()) as { data: { id: string; enabled: boolean } }).data;
		expect(skill.enabled).toBe(true);
		expect(readIndexed(await skills.instructions("workspace-1", "website"))).toContain(
			"Check the changed paths",
		);
		expect(await skills.instructions("workspace-1", "other")).toBe("");

		const disabled = await fetch(`${base}/skills/${skill.id}`, {
			method: "PATCH",
			headers: { ...auth, "Content-Type": "application/json" },
			body: JSON.stringify({ enabled: false }),
		});
		expect(disabled.status).toBe(200);
		expect(await skills.instructions("workspace-1", "website")).toBe("");

		const edited = await fetch(`${base}/skills/${skill.id}`, {
			method: "PATCH",
			headers: { ...auth, "Content-Type": "application/json" },
			body: JSON.stringify({
				skillMarkdown: skillMarkdown.replace("changed paths", "new paths"),
				enabled: true,
			}),
		});
		expect(edited.status).toBe(200);
		expect(readIndexed(await skills.instructions("workspace-1", "website"))).toContain(
			"Check the new paths",
		);

		expect(
			(
				await fetch(`${base}/skills/${skill.id}`, {
					method: "DELETE",
					headers: auth,
				})
			).status,
		).toBe(204);
		expect(await skills.list("workspace-1")).toEqual([]);
	});

	it("uploads a folder as files, rejects unsafe paths and protects writes by role", async () => {
		const form = new FormData();
		form.set("scope", JSON.stringify({ type: "workspace" }));
		form.set("paths", JSON.stringify(["code-review/SKILL.md", "code-review/notes.md"]));
		form.append("files", new File([skillMarkdown], "SKILL.md"));
		form.append("files", new File(["Read the note."], "notes.md"));
		const uploaded = await fetch(`${base}/skills/import/upload`, {
			method: "POST",
			headers: auth,
			body: form,
		});
		expect(uploaded.status).toBe(201);
		const skill = (
			(await uploaded.json()) as {
				data: { id: string; files: { path: string; content: string }[] };
			}
		).data;
		expect(skill.files).toEqual([{ path: "notes.md", content: "Read the note." }]);

		const unsafe = new FormData();
		unsafe.set("scope", JSON.stringify({ type: "workspace" }));
		unsafe.set("paths", JSON.stringify(["../SKILL.md"]));
		unsafe.append("files", new File([skillMarkdown], "SKILL.md"));
		const rejected = await fetch(`${base}/skills/import/upload`, {
			method: "POST",
			headers: auth,
			body: unsafe,
		});
		expect(rejected.status).toBe(400);

		const forbidden = await fetch(`${base}/skills`, {
			method: "POST",
			headers: { Authorization: "Bearer member", "Content-Type": "application/json" },
			body: JSON.stringify({
				skillMarkdown,
				scope: { type: "workspace" },
				source: { type: "written" },
			}),
		});
		expect(forbidden.status).toBe(403);
	});
});
