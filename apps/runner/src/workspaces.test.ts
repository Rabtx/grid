import { Database } from "bun:sqlite";
import { afterAll, describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { Provider } from "./agents/provider";
import { ChatHub } from "./chat/hub";
import { ChatStore } from "./chat/store";
import { EnvironmentStore } from "./environments/registry";

const root = mkdtempSync(join(tmpdir(), "grid-workspaces-"));
mkdirSync(join(root, "shop"));
mkdirSync(join(root, "old-shop"));
afterAll(() => rmSync(root, { recursive: true, force: true }));

const provider: Provider = {
	info: () => ({ id: "fake", name: "Fake", available: true, models: [], modes: [] }),
	start: async () => {
		throw new Error("not used");
	},
};

describe("chats and folders belong to the workspace", () => {
	it("shares a project's chats and folder with teammates, and hides them from others", () => {
		const hub = new ChatHub(new ChatStore(":memory:"), new Map([["fake", provider]]), root);
		const ana = { userId: "ana", workspace: "acme" };
		const ben = { userId: "ben", workspace: "acme" };
		const cy = { userId: "cy", workspace: "other" };

		hub.linkProjectFolder(ana.workspace, "shop", join(root, "shop"));
		expect(hub.projectFolders(ben.workspace)).toEqual({ shop: join(root, "shop") });
		expect(hub.projectFolders(cy.workspace)).toEqual({});

		const chat = hub.create(ana, { project: "shop", provider: "fake" });
		expect(chat).toMatchObject({ ownerId: "ana", workspaceId: "acme", cwd: join(root, "shop") });
		expect(hub.list(ben.workspace, "shop").map((row) => row.id)).toEqual([chat.id]);
		expect(hub.list(cy.workspace, "shop")).toEqual([]);

		hub.rename(ben.workspace, chat.id, "Ben's name for it");
		expect(() => hub.rename(cy.workspace, chat.id, "nope")).toThrow("does not exist");
		expect(() => hub.delete(cy.workspace, chat.id)).toThrow("does not exist");
		expect(hub.list(ana.workspace, "shop")[0]?.title).toBe("Ben's name for it");
		hub.closeAll();
	});
});

describe("adopting what was kept per person", () => {
	it("moves a database from before workspaces into the person's default workspace", () => {
		const path = join(root, "old.db");
		// The shape a runner kept before workspaces: chats and folders keyed by the person.
		const old = new Database(path, { create: true });
		old.exec(`
			CREATE TABLE sessions (
				id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, project TEXT NOT NULL, provider TEXT NOT NULL,
				title TEXT NOT NULL, cwd TEXT NOT NULL, model TEXT, mode TEXT, resume_token TEXT,
				created_at TEXT NOT NULL, updated_at TEXT NOT NULL
			);
			CREATE TABLE project_folders (
				owner_id TEXT NOT NULL, project TEXT NOT NULL, path TEXT NOT NULL,
				PRIMARY KEY (owner_id, project)
			);
			CREATE TABLE environments (
				id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, label TEXT NOT NULL, url TEXT NOT NULL,
				peer_id TEXT NOT NULL, secret TEXT NOT NULL, created_at TEXT NOT NULL
			);
			CREATE TABLE project_environments (
				owner_id TEXT NOT NULL, project TEXT NOT NULL, environment_id TEXT NOT NULL,
				PRIMARY KEY (owner_id, project)
			);
			INSERT INTO sessions VALUES ('s1', 'ana', 'shop', 'fake', 'Old chat', '/tmp', NULL, NULL, NULL, '2026-01-01', '2026-01-01');
			INSERT INTO project_folders VALUES ('ana', 'shop', '${join(root, "old-shop")}');
			INSERT INTO project_folders VALUES ('ana', 'blog', '/srv/blog');
			INSERT INTO environments VALUES ('e1', 'ana', 'Box', 'http://box.ts.net:4100', 'p1', 'x', '2026-01-01');
			INSERT INTO project_environments VALUES ('ana', 'shop', 'e1');
		`);
		old.close();

		const store = new ChatStore(path);
		const environments = new EnvironmentStore(path);
		// Before adopting, the old rows stay under the person's own key.
		expect(store.list("ana", "shop").map((row) => row.id)).toEqual(["s1"]);

		// The workspace already linked its own folder for "shop": that one wins.
		store.setProjectFolder("acme", "shop", join(root, "shop"));
		store.adopt("ana", "acme");
		environments.adopt("ana", "acme");

		expect(store.list("acme", "shop")[0]).toMatchObject({ id: "s1", ownerId: "ana" });
		expect(store.list("ana", "shop")).toEqual([]);
		expect(store.projectFolders("acme")).toEqual({ shop: join(root, "shop"), blog: "/srv/blog" });
		expect(store.projectFolders("ana")).toEqual({});
		expect(environments.list("acme").map((env) => env.id)).toEqual(["e1"]);
		expect(environments.placements("acme")).toEqual({ shop: "e1" });

		// Adopting again finds nothing left to move.
		store.adopt("ana", "acme");
		expect(store.list("acme", "shop")).toHaveLength(1);
		store.close();
	});
});
