import { afterAll, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { ChatSessionRow } from "../chat/store";
import { attentionMessage, isPushEndpoint, PushNotifier } from "./notifier";

// A real P-256 public key and auth secret (RFC 8291's), so encryption has something to work on.
const keys = {
	p256dh: "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4",
	auth: "BTBZMqHH6r4Tts7J_aSIgg",
};

const session = {
	id: "s1",
	ownerId: "me",
	project: "grid",
	title: "Fix the login",
} as ChatSessionRow;

function recorder(status: number) {
	const calls: string[] = [];
	const fetcher = (async (url: string) => {
		calls.push(url);
		return new Response(null, { status });
	}) as unknown as typeof fetch;
	return { calls, fetcher };
}

describe("isPushEndpoint", () => {
	it("only accepts the browsers' push services over https", () => {
		expect(isPushEndpoint("https://fcm.googleapis.com/fcm/send/x")).toBe(true);
		expect(isPushEndpoint("https://web.push.apple.com/abc")).toBe(true);
		expect(isPushEndpoint("https://updates.push.services.mozilla.com/wpush/v2/x")).toBe(true);
		expect(isPushEndpoint("http://fcm.googleapis.com/fcm/send/x")).toBe(false);
		expect(isPushEndpoint("https://evil.example/push.apple.com")).toBe(false);
		expect(isPushEndpoint("https://notpush.apple.com.evil.example/")).toBe(false);
		expect(isPushEndpoint("not a url")).toBe(false);
	});
});

describe("attentionMessage", () => {
	it("words a finished turn, a failure and an approval, and stays quiet on a cancel", () => {
		expect(attentionMessage(session, { type: "turn_end", reason: "done" })).toEqual({
			title: "Fix the login",
			body: "Finished — tap to see what it did.",
			url: "/chat/grid/s1",
			tag: "s1",
		});
		expect(
			attentionMessage(session, { type: "turn_end", reason: "error", error: "Out of credit" })
				?.body,
		).toBe("Stopped: Out of credit");
		expect(
			attentionMessage(session, {
				type: "approval",
				id: "a",
				title: "Run rm -rf dist",
				options: [],
			})?.body,
		).toBe("Needs your approval: Run rm -rf dist");
		expect(attentionMessage(session, { type: "turn_end", reason: "cancelled" })).toBeNull();
	});
});

describe("PushNotifier", () => {
	it("keeps its VAPID key across restarts", async () => {
		const dir = mkdtempSync(join(tmpdir(), "grid-push-"));
		afterAll(() => rmSync(dir, { recursive: true, force: true }));
		const path = join(dir, "chat.db");
		const first = await new PushNotifier(path).publicKey();
		expect(await new PushNotifier(path).publicKey()).toBe(first);
		expect(first).toHaveLength(87);
	});

	it("pushes to each of the person's devices and nobody else's", async () => {
		const { calls, fetcher } = recorder(201);
		const push = new PushNotifier(":memory:", fetcher);
		push.subscribe("me", { endpoint: "https://fcm.googleapis.com/a", ...keys }, "mailto:a@b.c");
		push.subscribe("me", { endpoint: "https://web.push.apple.com/b", ...keys }, "mailto:a@b.c");
		push.subscribe("you", { endpoint: "https://fcm.googleapis.com/c", ...keys }, "mailto:a@b.c");
		expect(await push.notify("me", { title: "t", body: "b", url: "/", tag: "x" })).toBe(2);
		expect(calls.sort()).toEqual(["https://fcm.googleapis.com/a", "https://web.push.apple.com/b"]);
		expect(push.count("me")).toBe(2);
	});

	it("forgets a device the browser has dropped", async () => {
		const { fetcher } = recorder(410);
		const push = new PushNotifier(":memory:", fetcher);
		push.subscribe("me", { endpoint: "https://fcm.googleapis.com/a", ...keys }, "mailto:a@b.c");
		await push.notify("me", { title: "t", body: "b", url: "/", tag: "x" });
		expect(push.count("me")).toBe(0);
	});
});
