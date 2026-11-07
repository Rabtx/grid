import { describe, expect, it } from "bun:test";
import { schema } from "@grid/db";

import { createTaskSchema, updateProjectSchema } from "./schema";

const base = [...schema.DEFAULT_WORKFLOW];

describe("project workflow", () => {
	it("takes the built-ins renamed, reordered and hidden, plus a status of its own", () => {
		const workflow = [
			{ key: "triage", name: "Triage", category: "backlog" as const },
			...base.map((state) => (state.key === "ready" ? { ...state, name: "Up next" } : state)),
		];
		expect(updateProjectSchema.safeParse({ workflow }).success).toBe(true);
	});

	it("will not drop a built-in status, since agents move cards by it", () => {
		const workflow = base.filter((state) => state.key !== "review");
		expect(updateProjectSchema.safeParse({ workflow }).success).toBe(false);
	});

	it("refuses two statuses with one key, or every status hidden", () => {
		expect(updateProjectSchema.safeParse({ workflow: [...base, base[0]] }).success).toBe(false);
		const hidden = base.map((state) => ({ ...state, hidden: true }));
		expect(updateProjectSchema.safeParse({ workflow: hidden }).success).toBe(false);
	});

	it("lets a task take any well-formed status key; the project checks it is one of its own", () => {
		expect(createTaskSchema.safeParse({ title: "a", status: "triage" }).success).toBe(true);
		expect(createTaskSchema.safeParse({ title: "a", status: "Not A Key" }).success).toBe(false);
	});
});
