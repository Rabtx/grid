import { describe, expect, it } from "bun:test";
import type { Database } from "@grid/db";
import { SignJWT } from "jose";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createApp } from "../../app";
import { createConfig } from "../../config/config";
import { parseEnv } from "../../config/env";

const jwtKey = "test-secret-that-is-at-least-32-characters";
const app = createApp({
	config: createConfig(parseEnv({ NODE_ENV: "test", JWT_SECRET: jwtKey })),
	db: {} as Database,
	send: async () => {},
	sessions: {
		session: async () => ({
			userId: "u1",
			revokedAt: null,
			expiresAt: new Date(Date.now() + 60_000),
		}),
		userIsActive: async () => true,
	},
});
const token = await new SignJWT({ sid: "s1" })
	.setProtectedHeader({ alg: "HS256" })
	.setSubject("u1")
	.setExpirationTime("5m")
	.sign(new TextEncoder().encode(jwtKey));
const authorization = `Bearer ${token}`;

describe("ported route parsing with app.request", () => {
	it("rejects a nonnumeric task number before database access", async () => {
		const reply = await app.request("/api/v1/projects/grid/tasks/nope", {
			method: "DELETE",
			headers: { authorization },
		});
		expect(reply.status).toBe(400);
		expect(await reply.json()).toMatchObject({
			code: "BAD_REQUEST",
			message: "Validation failed (numeric string is expected)",
		});
	});

	it("rejects a bad note UUID before database access", async () => {
		const reply = await app.request("/api/v1/projects/grid/notes/nope", {
			method: "DELETE",
			headers: { authorization },
		});
		expect(reply.status).toBe(400);
		expect(await reply.json()).toMatchObject({
			code: "BAD_REQUEST",
			message: "Validation failed (uuid is expected)",
		});
	});

	it("checks missing, unsupported and oversized avatar files", async () => {
		for (const [form, status, message] of [
			[new FormData(), 400, "Avatar image is required"],
			[
				(() => {
					const form = new FormData();
					form.set("file", new File(["x"], "x.txt", { type: "text/plain" }));
					return form;
				})(),
				400,
				"Avatar must be a JPEG, PNG, or WebP image",
			],
			[
				(() => {
					const form = new FormData();
					form.set(
						"file",
						new File([new Uint8Array(2 * 1024 * 1024 + 1)], "x.png", { type: "image/png" }),
					);
					return form;
				})(),
				413,
				"File too large",
			],
		] as const) {
			const reply = await app.request("/api/v1/users/me/avatar", {
				method: "POST",
				headers: { authorization },
				body: form,
			});
			expect(reply.status).toBe(status);
			expect(await reply.json()).toMatchObject({ message });
		}
	});

	it("serves an avatar already present in the uploads directory", async () => {
		const uploadsDir = await mkdtemp(join(tmpdir(), "grid-avatar-contract-"));
		try {
			await mkdir(join(uploadsDir, "avatars"));
			const filename = "123e4567-e89b-42d3-a456-426614174000.png";
			const bytes = new Uint8Array([137, 80, 78, 71]);
			await Bun.write(join(uploadsDir, "avatars", filename), bytes);
			const staticApp = createApp({
				config: createConfig(
					parseEnv({ NODE_ENV: "test", JWT_SECRET: jwtKey, GRID_UPLOADS_DIR: uploadsDir }),
				),
				db: {} as Database,
				send: async () => {},
				sessions: { session: async () => null, userIsActive: async () => false },
			});
			const response = await staticApp.request(`/uploads/avatars/${filename}`);
			expect(response.status).toBe(200);
			expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes);
		} finally {
			await rm(uploadsDir, { recursive: true, force: true });
		}
	});
});
