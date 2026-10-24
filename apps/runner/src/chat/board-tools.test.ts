import { describe, expect, it } from "bun:test";

import { gridToolTitle } from "../agents/grid-titles";
import { boardTools } from "./board-tools";
import type { ChatSessionRow } from "./store";

const session = {
	id: "t1",
	ownerId: "11111111-1111-4111-8111-111111111111",
	workspaceId: "w1",
	project: "kestrel",
	provider: "claude",
} as ChatSessionRow;

describe("board tools", () => {
	it("act as the thread's person in its project, and say what they did", async () => {
		const seen: { url: string; method: string; body: unknown; auth: string | null }[] = [];
		const fetcher = async (url: string, init: RequestInit = {}) => {
			seen.push({
				url,
				method: init.method ?? "GET",
				body: init.body ? JSON.parse(String(init.body)) : null,
				auth: new Headers(init.headers).get("authorization"),
			});
			if (init.method === "POST")
				return Response.json(
					{ data: { number: 7, key: "GRID-7", title: "Fix login", status: "backlog" } },
					{ status: 201 },
				);
			if (init.method === "PATCH")
				return Response.json({
					data: { number: 7, key: "GRID-7", title: "Fix login", status: "review" },
				});
			return Response.json({
				data: [
					{ number: 7, key: "GRID-7", title: "Fix login", status: "review" },
					{ number: 8, key: "GRID-8", title: "Docs", status: "done" },
				],
			});
		};
		const tools = Object.fromEntries(
			boardTools({ url: "http://api", key: "k" }, fetcher).map((tool) => [tool.name, tool]),
		);
		expect(await tools.board_create_task?.run(session, { title: "Fix login" })).toBe(
			"Added GRID-7 [backlog] Fix login",
		);
		expect(seen[0]).toMatchObject({
			url: "http://api/api/v1/runner/tasks/w1/kestrel",
			method: "POST",
			auth: "Runner k",
			body: { user: session.ownerId, task: { title: "Fix login", ownerKind: "agent" } },
		});
		expect(await tools.board_update_task?.run(session, { number: 7, status: "review" })).toContain(
			"[review]",
		);
		expect(seen[1]?.url).toBe("http://api/api/v1/runner/tasks/w1/kestrel/7");
		expect(await tools.board_list_tasks?.run(session, { status: "done" })).toBe(
			"GRID-8 [done] Docs",
		);
		await expect(
			tools.board_update_task?.run(session, { number: 7, status: "shipped" }) ??
				Promise.resolve(""),
		).rejects.toThrow("status must be one of");
	});

	it("are not offered without a way to the API", () => {
		expect(boardTools(null)).toEqual([]);
	});

	it("read as plain steps in a transcript", () => {
		expect(gridToolTitle("mcp__grid__board_create_task", { title: "Fix login" })).toBe(
			"Added a board task: Fix login",
		);
		expect(gridToolTitle("grid.board_update_task", { number: 3, status: "done" })).toBe(
			"Updated task 3 → done",
		);
		expect(gridToolTitle("Bash")).toBeNull();
	});
});
