import { describe, expect, it } from "vitest";
import type { Task, TaskStatus } from "../types/project.types";
import { buildUpdateTaskInput, parsePosition, toTaskFormValues } from "./task-form";

function task(overrides: Partial<Task> = {}): Task {
	return {
		key: "TASK-7",
		number: 7,
		title: "Ship the detail panel",
		description: "Open, edit, delete.",
		status: "in_progress",
		owner: { kind: "agent", name: "web agent" },
		branch: "agent/web/task-detail",
		position: 3,
		createdAt: "2026-09-01T00:00:00.000Z",
		updatedAt: "2026-09-01T00:00:00.000Z",
		...overrides,
	};
}

describe("toTaskFormValues", () => {
	it("maps every task field onto the form shape", () => {
		expect(toTaskFormValues(task())).toEqual({
			title: "Ship the detail panel",
			description: "Open, edit, delete.",
			status: "in_progress",
			ownerKind: "agent",
			ownerName: "web agent",
			branch: "agent/web/task-detail",
			position: "3",
		});
	});

	it("renders nullables as empty strings", () => {
		expect(
			toTaskFormValues(task({ description: null, branch: null, owner: null, status: "backlog" })),
		).toMatchObject({
			description: "",
			branch: "",
			ownerName: "",
			status: "backlog",
		});
	});

	it("defaults an unowned task to the agent owner kind", () => {
		expect(toTaskFormValues(task({ owner: null })).ownerKind).toBe("agent");
		expect(toTaskFormValues(task({ owner: { kind: "human", name: "Ada" } })).ownerKind).toBe(
			"human",
		);
	});
});

describe("parsePosition", () => {
	it("accepts integers the API allows", () => {
		expect(parsePosition("0")).toBe(0);
		expect(parsePosition(" 12 ")).toBe(12);
		expect(parsePosition("1000000")).toBe(1000000);
	});

	it("rejects anything that is not a plain in-range integer", () => {
		expect(parsePosition("")).toBeNull();
		expect(parsePosition("-1")).toBeNull();
		expect(parsePosition("1.5")).toBeNull();
		expect(parsePosition("12abc")).toBeNull();
		expect(parsePosition("abc")).toBeNull();
		expect(parsePosition("1000001")).toBeNull();
	});
});

describe("buildUpdateTaskInput", () => {
	it("sends every editable field with trimmed values", () => {
		const input = buildUpdateTaskInput({
			title: "  Renamed  ",
			description: "  Body  ",
			status: "review" as TaskStatus,
			ownerKind: "human",
			ownerName: "  Ada  ",
			branch: "  feature/x  ",
			position: "4",
		});
		expect(input).toEqual({
			title: "Renamed",
			description: "Body",
			status: "review",
			ownerKind: "human",
			ownerName: "Ada",
			branch: "feature/x",
			position: 4,
		});
	});

	it("clears nullable fields when the form value is blank", () => {
		const input = buildUpdateTaskInput({
			title: "Keep",
			description: "   ",
			status: "backlog",
			ownerKind: "agent",
			ownerName: "",
			branch: "",
			position: "0",
		});
		expect(input.description).toBeNull();
		expect(input.ownerKind).toBeNull();
		expect(input.ownerName).toBeNull();
		expect(input.branch).toBeNull();
	});

	it("omits position when it is not a valid integer", () => {
		const input = buildUpdateTaskInput({
			title: "Keep",
			description: "",
			status: "backlog",
			ownerKind: "agent",
			ownerName: "",
			branch: "",
			position: "nope",
		});
		expect(input).not.toHaveProperty("position");
		expect(input.title).toBe("Keep");
	});
});
