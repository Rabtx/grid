import { describe, expect, it } from "bun:test";

import type { Who } from "../auth";

import type { GithubInbox } from "./github";
import { inboxRequest, type InboxDeps } from "./routes";
import { InboxStore, type InboxDraft } from "./store";

/** The items a list carries, without the rows themselves. */
type InboxView = { items: unknown[]; unread: number; github: boolean };

const me: Who = { userId: "me", workspace: "acme" };

const draft = (over: Partial<InboxDraft> = {}): InboxDraft => ({
	id: "turn_done:s1:2026-09-28T09:00:00.000Z",
	workspaceId: "acme",
	kind: "turn_done",
	project: "grid",
	title: "Fix the login",
	body: "Finished — tap to see what it did.",
	url: "/chat/grid/s1",
	createdAt: "2026-09-28T09:00:00.000Z",
	...over,
});

/** A stand-in for the GitHub half that records what it was asked and when. */
function fakeGithub(
	worth: { stale: (workspace: string, forced: boolean) => boolean } = { stale: () => false },
) {
	const asked: { userId: string; workspace: string }[] = [];
	const github = {
		available: (userId: string) => userId === "me",
		stale: worth.stale,
		sync: async (userId: string, workspace: string) => {
			asked.push({ userId, workspace });
			return true;
		},
	} as unknown as GithubInbox;
	return { github, asked };
}

function deps(github: GithubInbox | null = fakeGithub().github) {
	const store = new InboxStore(":memory:");
	return { store, deps: { store, github, projectsDir: "/srv/projects" } satisfies InboxDeps };
}

const get = (path: string) => new Request(`http://runner.test${path}`);
const post = (path: string, body: unknown) =>
	new Request(`http://runner.test${path}`, {
		method: "POST",
		body: JSON.stringify(body),
		headers: { "content-type": "application/json" },
	});

describe("inboxRequest", () => {
	it("lists the workspace's items and its unread count", async () => {
		const { store, deps: d } = deps();
		store.keep(draft());
		store.keep(draft({ id: "approval:s1:a1", kind: "approval" }));
		store.keep(draft({ id: "turn_done:s9:x", workspaceId: "other" }));
		const response = await inboxRequest(get("/inbox"), new URL("http://runner.test/inbox"), me, d);
		expect(response?.status).toBe(200);
		const body = (await response?.json()) as { data: { items: { id: string }[] } & InboxView };
		expect(body.data.items.map((item) => item.id)).toEqual([draft().id, "approval:s1:a1"]);
		expect(body.data.unread).toBe(2);
		expect(body.data.github).toBe(true);
		store.close();
	});

	it("does not ask GitHub again until it is worth it, and does when asked to refresh", async () => {
		let stale = false;
		// Refresh clears a shorter floor than a plain visit; the GitHub half decides both.
		const { github, asked } = fakeGithub({ stale: (_workspace, forced) => stale || forced });
		const { store, deps: d } = deps(github);
		const list = (path: string) =>
			inboxRequest(get(path), new URL(`http://runner.test${path}`), me, d);

		await list("/inbox");
		expect(asked).toEqual([]);
		await list("/inbox?refresh=1");
		expect(asked).toEqual([{ userId: "me", workspace: "acme" }]);
		stale = true;
		await list("/inbox");
		expect(asked).toHaveLength(2);
		store.close();
	});

	it("says GitHub is not connected rather than failing", async () => {
		const { store, deps: d } = deps(null);
		const response = await inboxRequest(get("/inbox"), new URL("http://runner.test/inbox"), me, d);
		expect(await response?.json()).toEqual({ data: { items: [], unread: 0, github: false } });
		store.close();
	});

	it("answers the sidebar's count on its own, without asking GitHub anything", async () => {
		const { asked, github } = fakeGithub();
		const { store, deps: d } = deps(github);
		store.keep(draft());
		store.keep(draft({ id: "approval:s1:a1", kind: "approval" }));
		store.read("acme", "me", "approval:s1:a1");
		const response = await inboxRequest(
			get("/inbox/unread"),
			new URL("http://runner.test/inbox/unread"),
			me,
			d,
		);
		expect(await response?.json()).toEqual({ data: { unread: 1 } });
		expect(asked).toEqual([]);
		store.close();
	});

	it("marks one item, one page, or everything read", async () => {
		const { store, deps: d } = deps();
		store.keep(draft());
		store.keep(draft({ id: "pull_review:grid:12", kind: "pull_review", url: "/pulls/grid?pr=12" }));
		const read = (what: unknown) =>
			inboxRequest(post("/inbox/read", what), new URL("http://runner.test/inbox/read"), me, d);

		expect(await (await read({ id: "pull_review:grid:12" }))?.json()).toMatchObject({
			data: { changed: 1, unread: 1 },
		});
		// Opening the thread deals with everything waiting about it, not only the row tapped.
		expect(await (await read({ path: "/chat/grid/s1" }))?.json()).toMatchObject({
			data: { changed: 1, unread: 0 },
		});
		store.keep(draft({ id: "approval:s1:a1", kind: "approval" }));
		expect(await (await read({}))?.json()).toMatchObject({ data: { changed: 1, unread: 0 } });
		store.close();
	});

	it("refuses a read it cannot make sense of", async () => {
		const { store, deps: d } = deps();
		const read = (what: unknown) =>
			inboxRequest(post("/inbox/read", what), new URL("http://runner.test/inbox/read"), me, d);
		expect((await read({ id: 7 }))?.status).toBe(400);
		expect((await read({ path: 7 }))?.status).toBe(400);
		expect((await read({ id: "a", path: "/chat/grid/s1" }))?.status).toBe(400);
		// A page dressed up as something else cannot clear what points elsewhere.
		expect((await read({ path: "/chat/grid/s1' OR 1=1 --" }))?.status).toBe(400);
		store.close();
	});

	it("answers 405 on its own paths with the wrong method, and 404 on the rest", async () => {
		const { store, deps: d } = deps();
		const url = new URL("http://runner.test/inbox");
		expect((await inboxRequest(post("/inbox", {}), url, me, d))?.status).toBe(405);
		expect((await inboxRequest(get("/inbox/read"), new URL(url + "/read"), me, d))?.status).toBe(
			405,
		);
		expect(
			(await inboxRequest(get("/inbox/nothing"), new URL(url + "/nothing"), me, d))?.status,
		).toBe(404);
		// Not ours: null, so the server can try its other routes.
		expect(
			await inboxRequest(get("/health"), new URL("http://runner.test/health"), me, d),
		).toBeNull();
		store.close();
	});
});
