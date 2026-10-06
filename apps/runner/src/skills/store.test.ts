import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { SkillStore } from "./store";
import { validateSkillInput } from "./validation";

/** The skills an index points to, read from disk: what an agent following it would read. */
function readIndexed(index: string): string {
	return [...index.matchAll(/Read (\S+SKILL\.md)/g)]
		.map((match) => readFileSync(match[1] ?? "", "utf8"))
		.join("\n");
}

const roots: string[] = [];
const markdown = (name: string, instructions = "Follow this guidance.") =>
	`---\nname: ${name}\ndescription: Guidance for ${name}\n---\n\n${instructions}`;
const source = { type: "written" as const };

function store(): SkillStore {
	const root = mkdtempSync(join(tmpdir(), "grid-skill-store-"));
	roots.push(root);
	return new SkillStore(root);
}

afterEach(() => {
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("runner skill store", () => {
	it("persists skills in its store and lists only the named workspace", async () => {
		const skills = store();
		const input = validateSkillInput(
			{
				skillMarkdown: markdown("review-prs"),
				files: [{ path: "references/checklist.md", content: "Check edge cases." }],
				source,
				scope: { type: "workspace" },
			},
			["web"],
		);
		const saved = await skills.add("workspace-a", input);

		expect((await skills.list("workspace-a")).map(({ name }) => name)).toEqual(["review-prs"]);
		expect(await skills.list("workspace-b")).toEqual([]);
		expect(await Bun.file(join(skills.root, saved.id, "references/checklist.md")).text()).toBe(
			"Check edge cases.",
		);
	});

	it("delivers enabled workspace and project skills with project overrides", async () => {
		const skills = store();
		await skills.add(
			"workspace-a",
			validateSkillInput(
				{
					skillMarkdown: markdown("review-prs", "Workspace instructions."),
					source,
					scope: { type: "workspace" },
				},
				["web"],
			),
		);
		const project = await skills.add(
			"workspace-a",
			validateSkillInput(
				{
					skillMarkdown: markdown("review-prs", "Project instructions."),
					source,
					scope: { type: "project", project: "web" },
				},
				["web"],
			),
		);
		const other = await skills.add(
			"workspace-a",
			validateSkillInput(
				{
					skillMarkdown: markdown("release-notes"),
					source,
					scope: { type: "project", project: "web" },
				},
				["web"],
			),
		);

		const web = await skills.instructions("workspace-a", "web");
		const mobile = await skills.instructions("workspace-a", "mobile");
		expect(readIndexed(web)).toContain("Project instructions.");
		expect(readIndexed(web)).not.toContain("Workspace instructions.");
		// An index, not the contents: an agent reads a skill when it applies.
		expect(web).not.toContain("Project instructions.");
		expect(web).toContain("release-notes");
		expect(readIndexed(mobile)).toContain("Workspace instructions.");
		expect(mobile).not.toContain("release-notes");

		await skills.update("workspace-a", project.id, { enabled: false }, ["web"]);
		expect(await skills.instructions("workspace-a", "web")).not.toContain("review-prs");
		await skills.update("workspace-a", other.id, { enabled: false }, ["web"]);
		expect(await skills.instructions("workspace-a", "web")).toBe("");
	});

	it("rejects traversal, duplicate scope/name pairs and cross-workspace edits", async () => {
		const skills = store();
		const input = validateSkillInput(
			{ skillMarkdown: markdown("safe-skill"), source, scope: { type: "workspace" } },
			["web"],
		);
		const saved = await skills.add("workspace-a", input);
		await expect(
			skills.add(
				"workspace-a",
				validateSkillInput(
					{ skillMarkdown: markdown("safe-skill"), source, scope: { type: "workspace" } },
					["web"],
				),
			),
		).rejects.toThrow("already exists");
		await expect(skills.remove("workspace-b", saved.id)).rejects.toMatchObject({ status: 404 });
		await expect(
			skills.update(
				"workspace-a",
				saved.id,
				{ files: [{ path: "../../outside", content: "escape" }] },
				["web"],
			),
		).rejects.toThrow("unsafe name");
		expect(await skills.list("workspace-a")).toHaveLength(1);
	});

	it("edits, changes scope, and removes a skill", async () => {
		const skills = store();
		const saved = await skills.add(
			"workspace-a",
			validateSkillInput(
				{ skillMarkdown: markdown("first-name"), source, scope: { type: "workspace" } },
				["web"],
			),
		);
		const updated = await skills.update(
			"workspace-a",
			saved.id,
			{
				skillMarkdown: markdown("second-name", "Updated guidance."),
				scope: { type: "project", project: "web" },
			},
			["web"],
		);
		expect(updated).toMatchObject({
			name: "second-name",
			scope: { type: "project", project: "web" },
		});
		await skills.remove("workspace-a", saved.id);
		expect(await skills.list("workspace-a")).toEqual([]);
	});
});
