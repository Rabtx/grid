import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { createDatabase, schema } from "@grid/db";
import { hashSecret, randomSecret } from "@grid/db/instance";
import { createPersonalWorkspace } from "@grid/db/workspaces";
import { eq, inArray } from "drizzle-orm";

import { call, demoToken, json, SIGN_IN_TIMEOUT, stable } from "./client";

// These tests set up and clean their own rows.
const database = createDatabase(process.env.DATABASE_URL);
const tag = crypto.randomUUID().slice(0, 8);
const origin = { origin: "http://localhost:3001", "x-requested-with": "XMLHttpRequest" };
/** The invited account's password; a test value, not a secret. */
const PASSWORD = "contract-password-1";
const invitedEmail = `invited-${tag}@grid.test`;
let token: string;
let demoWorkspace: string;
let foreignUserId: string;
let foreignWorkspace: { id: string; slug: string };
/** Invites this suite made in the demo workspace. */
const demoInvites: string[] = [];

const authed = (path: string, init: RequestInit = {}) =>
	call(path, { ...init, headers: { authorization: `Bearer ${token}`, ...init.headers } });
const payload = <T = Record<string, unknown>>(reply: Awaited<ReturnType<typeof call>>) =>
	(stable(reply.body) as { data: T }).data;

/** An invite to the foreign workspace, written straight to the database. */
async function foreignInvite(email: string | null) {
	const secret = randomSecret();
	await database.db.insert(schema.workspaceInvites).values({
		workspaceId: foreignWorkspace.id,
		tokenHash: hashSecret(secret),
		email,
		role: "member",
		expiresAt: new Date(Date.now() + 60_000),
	});
	return secret;
}

beforeAll(async () => {
	token = await demoToken();
	const listed = payload<{ slug: string; role: string }[]>(await authed("/api/v1/workspaces"));
	const own = listed.find((w) => w.role === "owner");
	if (!own) throw new Error("The demo account owns no workspace");
	demoWorkspace = own.slug;
	const [foreign] = await database.db
		.insert(schema.users)
		.values({ email: `foreign-${tag}@example.test`, username: `foreign-${tag}` })
		.returning();
	if (!foreign) throw new Error("Foreign user insert failed");
	foreignUserId = foreign.id;
	foreignWorkspace = await createPersonalWorkspace(database.db, foreign);
}, SIGN_IN_TIMEOUT);

afterAll(async () => {
	await database.db.delete(schema.users).where(eq(schema.users.email, invitedEmail));
	if (demoInvites.length > 0)
		await database.db
			.delete(schema.workspaceInvites)
			.where(inArray(schema.workspaceInvites.id, demoInvites));
	if (foreignWorkspace)
		await database.db
			.delete(schema.workspaces)
			.where(inArray(schema.workspaces.id, [foreignWorkspace.id]));
	if (foreignUserId)
		await database.db.delete(schema.users).where(eq(schema.users.id, foreignUserId));
	await database.close();
});

describe("instance", () => {
	it("says it is set up, and refuses a second setup", async () => {
		const status = payload<{ setupNeeded: boolean; signupOpen: boolean }>(
			await call("/api/v1/instance"),
		);
		expect(status).toEqual({ setupNeeded: false, signupOpen: expect.any(Boolean) });
		const again = await call(
			"/api/v1/instance/setup",
			json(
				{
					code: "nope",
					email: `setup-${tag}@grid.test`,
					username: `setup-${tag}`,
					password: PASSWORD,
					workspace: { name: "Again", slug: `again-${tag}` },
				},
				{ headers: origin },
			),
		);
		expect(again.status).toBe(409);
		expect(stable(again.body)).toMatchObject({ code: "SETUP_DONE" });
	});

	it("closes signup without an invite (unless the owner opened it)", async () => {
		const { signupOpen } = payload<{ signupOpen: boolean }>(await call("/api/v1/instance"));
		if (signupOpen) return;
		const reply = await call(
			"/api/v1/auth/register",
			json(
				{ email: `closed-${tag}@grid.test`, username: `closed-${tag}`, password: PASSWORD },
				{ headers: origin },
			),
		);
		expect(reply.status).toBe(403);
		expect(stable(reply.body)).toMatchObject({ code: "SIGNUP_CLOSED" });
	});
});

describe("invites", () => {
	it("invites by email; the invite page shows it; signing up with it joins, verified", async () => {
		const created = await authed(
			`/api/v1/workspaces/${demoWorkspace}/invites`,
			json({ email: invitedEmail, role: "admin" }),
		);
		expect(created.status).toBe(201);
		const invite = payload<{ id: string; token: string; url: string; role: string }>(created);
		demoInvites.push(invite.id);
		expect(invite).toMatchObject({ email: invitedEmail, role: "admin" });
		expect(invite.url).toEndWith(`/invite/${invite.token}`);

		const pending = payload<{ id: string }[]>(
			await authed(`/api/v1/workspaces/${demoWorkspace}/invites`),
		);
		expect(pending.map((p) => p.id)).toContain(invite.id);

		const preview = await call(`/api/v1/invites/${invite.token}`);
		expect(payload(preview)).toMatchObject({
			workspace: { slug: demoWorkspace },
			role: "admin",
			email: invitedEmail,
		});

		const joined = await call(
			"/api/v1/auth/register",
			json(
				{
					email: invitedEmail,
					username: `invited-${tag}`,
					password: PASSWORD,
					inviteToken: invite.token,
				},
				{ headers: origin },
			),
		);
		expect(joined.status).toBe(201);
		expect(payload(joined)).toMatchObject({
			accepted: true,
			message: "Your account is ready.",
			user: { email: invitedEmail, emailVerified: true },
		});
		const members = payload<{ username: string; role: string }[]>(
			await authed(`/api/v1/workspaces/${demoWorkspace}/members`),
		);
		expect(members).toContainEqual(
			expect.objectContaining({ username: `invited-${tag}`, role: "admin" }),
		);

		const used = await call(`/api/v1/invites/${invite.token}`);
		expect(used.status).toBe(404);
		expect(stable(used.body)).toMatchObject({ code: "INVITE_INVALID" });
	});

	it("accepts a link invite as a signed-in user, once, and checks the email", async () => {
		const mismatch = await foreignInvite(`someone-else-${tag}@grid.test`);
		const refused = await authed(`/api/v1/invites/${mismatch}/accept`, { method: "POST" });
		expect(refused.status).toBe(403);
		expect(stable(refused.body)).toMatchObject({ code: "INVITE_EMAIL_MISMATCH" });

		const link = await foreignInvite(null);
		expect((await call(`/api/v1/invites/${link}/accept`, { method: "POST" })).status).toBe(401);
		const accepted = await authed(`/api/v1/invites/${link}/accept`, { method: "POST" });
		expect(accepted.status).toBe(200);
		expect(payload<unknown>(accepted)).toEqual({
			slug: foreignWorkspace.slug,
			name: expect.any(String),
			role: "member",
		});
		expect((await authed(`/api/v1/workspaces/${foreignWorkspace.slug}`)).status).toBe(200);
		expect((await authed(`/api/v1/invites/${link}/accept`, { method: "POST" })).status).toBe(404);
	});

	it("revokes invites, keeps owners out of invites, and rejects bad tokens", async () => {
		const created = payload<{ id: string }>(
			await authed(`/api/v1/workspaces/${demoWorkspace}/invites`, json({})),
		);
		demoInvites.push(created.id);
		expect(
			(
				await authed(`/api/v1/workspaces/${demoWorkspace}/invites/${created.id}`, {
					method: "DELETE",
				})
			).status,
		).toBe(204);
		const owner = await authed(
			`/api/v1/workspaces/${demoWorkspace}/invites`,
			json({ role: "owner" }),
		);
		expect(owner.status).toBe(400);
		const bad = await call("/api/v1/invites/not-a-token");
		expect(bad.status).toBe(404);
		expect(stable(bad.body)).toMatchObject({ code: "INVITE_INVALID" });
	});
});
