import { describe, expect, it } from "bun:test";

import {
	normalizeSkillPath,
	parseSkillMarkdown,
	validateSkillFiles,
	validateSkillInput,
} from "./validation";

const markdown = `---\nname: code-review\ndescription: Review changes before committing\n---\n\nLook for correctness issues.`;

describe("skill validation", () => {
	it("reads required frontmatter and permits quoted descriptions", () => {
		expect(parseSkillMarkdown(markdown)).toEqual({
			name: "code-review",
			description: "Review changes before committing",
		});
		expect(
			parseSkillMarkdown(
				markdown.replace(
					"description: Review changes before committing",
					'description: "Review: changes before committing"',
				),
			).description,
		).toBe("Review: changes before committing");
	});

	it("requires a kebab-case name and a description", () => {
		expect(() => parseSkillMarkdown(markdown.replace("code-review", "CodeReview"))).toThrow(
			"lowercase letters",
		);
		expect(() =>
			parseSkillMarkdown(markdown.replace("description: Review changes before committing", "")),
		).toThrow("description");
		expect(() => parseSkillMarkdown("Write a skill without frontmatter")).toThrow("frontmatter");
	});

	it("rejects paths that could escape the store or replace its metadata", () => {
		for (const path of ["../outside", "folder/../../outside", "/absolute", "folder\\outside"])
			expect(() => normalizeSkillPath(path)).toThrow();
		expect(() => validateSkillFiles([{ path: "metadata.json", content: "replace me" }])).toThrow(
			"reserved",
		);
		expect(() =>
			validateSkillInput(
				{
					skillMarkdown: markdown,
					files: [{ path: "../outside", content: "no" }],
					source: { type: "written" },
					scope: { type: "workspace" },
				},
				["website"],
			),
		).toThrow("unsafe name");
	});

	it("only accepts project scopes linked to the workspace", () => {
		expect(() =>
			validateSkillInput(
				{
					skillMarkdown: markdown,
					source: { type: "written" },
					scope: { type: "project", project: "other" },
				},
				["website"],
			),
		).toThrow("project linked to this workspace");
	});
});
