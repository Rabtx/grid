import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { Hono } from "hono";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { AppEnv } from "../../http/context";
import { uploadedFile } from "./routes";

const uploads = mkdtempSync(join(tmpdir(), "grid-uploads-"));
afterAll(() => rmSync(uploads, { recursive: true, force: true }));

const UUID = "11111111-2222-3333-4444-555555555555";
const OTHER = "99999999-8888-7777-6666-555555555555";

/** The API's own route for `/uploads/…`, pointed at the folder above. */
function app(): Hono<AppEnv> {
	const served = new Hono<AppEnv>();
	served.get("/uploads/*", (c) => uploadedFile(c, uploads));
	return served;
}

beforeAll(() => {
	for (const folder of ["avatars", "logos", "notes"]) mkdirSync(join(uploads, folder));
	writeFileSync(join(uploads, "avatars", `${UUID}.png`), "an avatar");
	writeFileSync(join(uploads, "notes", `${UUID}.webp`), "a note image");
	writeFileSync(join(uploads, "logos", `${UUID}.png`), "a logo");
	writeFileSync(join(uploads, "logos", `${OTHER}.svg`), "<svg><script>alert(1)</script></svg>");
	writeFileSync(join(uploads, "logos", `${OTHER}.txt`), "not an image");
});

describe("/uploads", () => {
	it("serves an avatar and a note's image", async () => {
		expect((await app().request(`/uploads/avatars/${UUID}.png`)).status).toBe(200);
		expect((await app().request(`/uploads/notes/${UUID}.webp`)).status).toBe(200);
	});

	it("serves a workspace's logo, which is what it is given", async () => {
		// Logos are uploaded to /uploads/logos and stored in the workspace as that path, so the
		// allowlist has to name them: without it every logo 404'd.
		const reply = await app().request(`/uploads/logos/${UUID}.png`);
		expect(reply.status).toBe(200);
		expect(await reply.text()).toBe("a logo");
	});

	it("hands out an SVG logo sandboxed, so it cannot script this origin", async () => {
		const reply = await app().request(`/uploads/logos/${OTHER}.svg`);
		expect(reply.status).toBe(200);
		expect(reply.headers.get("content-security-policy")).toContain("sandbox");
	});

	it("still refuses anything outside what it uploads", async () => {
		const served = app();
		expect((await served.request(`/uploads/logos/${OTHER}.txt`)).status).toBe(404);
		expect((await served.request("/uploads/logos/not-a-uuid.png")).status).toBe(404);
		expect((await served.request(`/uploads/secrets/${UUID}.png`)).status).toBe(404);
		expect((await served.request(`/uploads/logos/${UUID}.png.bak`)).status).toBe(404);
		expect((await served.request("/uploads/logos/../../etc/passwd")).status).toBe(404);
	});

	it("404s a file that is not there", async () => {
		expect(
			(await app().request("/uploads/logos/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.png")).status,
		).toBe(404);
	});
});
