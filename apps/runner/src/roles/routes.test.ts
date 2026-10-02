import { describe, expect, it } from "bun:test";

import type { Who } from "../auth";

import { roleRequest, type RoleDeps } from "./routes";
import { type Role, RoleStore } from "./store";

const me: Who = { userId: "me", workspace: "acme" };
const other: Who = { userId: "them", workspace: "elsewhere" };

function deps(): RoleDeps {
	return {
		store: new RoleStore(":memory:"),
		knownProvider: (id) => id === "claude" || id === "codex",
	};
}

async function call(
	d: RoleDeps,
	method: string,
	path: string,
	body?: unknown,
	who: Who = me,
): Promise<{ status: number; data: unknown; message?: string }> {
	const request = new Request(`http://runner${path}`, {
		method,
		headers: body === undefined ? undefined : { "content-type": "application/json" },
		body: body === undefined ? undefined : JSON.stringify(body),
	});
	const response = await roleRequest(request, new URL(request.url), who, d);
	if (!response) throw new Error("not handled");
	const text = await response.text();
	const json = text ? (JSON.parse(text) as { data?: unknown; message?: string }) : {};
	return { status: response.status, data: json.data, message: json.message };
}

const engineer = {
	name: "  Engineer ",
	icon: "code",
	brief: "Builds features end to end.",
	provider: "claude",
	model: "claude-opus-5-5",
	effort: "high",
};

describe("roles", () => {
	it("makes a role and lists it for the workspace only", async () => {
		const d = deps();
		const made = await call(d, "POST", "/roles", engineer);
		expect(made.status).toBe(201);
		const role = made.data as Role;
		expect(role.name).toBe("Engineer");
		expect(role.mode).toBeNull();
		expect((await call(d, "GET", "/roles")).data).toEqual([role]);
		expect((await call(d, "GET", "/roles", undefined, other)).data).toEqual([]);
	});

	it("refuses a role with no name, an unknown agent or icon", async () => {
		const d = deps();
		expect((await call(d, "POST", "/roles", { ...engineer, name: " " })).status).toBe(400);
		expect((await call(d, "POST", "/roles", { ...engineer, provider: "nope" })).message).toBe(
			"Choose an agent this machine has",
		);
		expect((await call(d, "POST", "/roles", { ...engineer, icon: "skull" })).status).toBe(400);
	});

	it("changes only what an edit sends, and clears a model sent as null", async () => {
		const d = deps();
		const role = (await call(d, "POST", "/roles", engineer)).data as Role;
		const edited = await call(d, "PATCH", `/roles/${role.id}`, { effort: "max", model: null });
		expect(edited.status).toBe(200);
		expect(edited.data).toMatchObject({ name: "Engineer", effort: "max", model: null });
	});

	it("keeps another workspace's role out of reach", async () => {
		const d = deps();
		const role = (await call(d, "POST", "/roles", engineer)).data as Role;
		expect((await call(d, "PATCH", `/roles/${role.id}`, { name: "Mine" }, other)).status).toBe(404);
		await call(d, "DELETE", `/roles/${role.id}`, undefined, other);
		expect(((await call(d, "GET", "/roles")).data as Role[]).length).toBe(1);
		expect((await call(d, "DELETE", `/roles/${role.id}`)).status).toBe(204);
		expect((await call(d, "GET", "/roles")).data).toEqual([]);
	});

	it("leaves other paths to the rest of the runner", async () => {
		const request = new Request("http://runner/chat/providers");
		expect(await roleRequest(request, new URL(request.url), me, deps())).toBeNull();
	});
});
