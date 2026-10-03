import { afterAll, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { ChatSessionRow } from "../chat/store";
import { DEFAULT_PREFS } from "../prefs/store";
import { pushActRequest, pushRequest } from "./routes";
import {
	approvalActions,
	attentionMessage,
	isPushEndpoint,
	lastReply,
	notifyKind,
	PushNotifier,
} from "./notifier";

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
		expect(isPushEndpoint("https://jmt17.google.com/fcm/send/x")).toBe(true);
		expect(isPushEndpoint("https://google.com.evil.example/x")).toBe(false);
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

const PHONE =
	"Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit Mobile/15E148 Safari/604.1";
const LINUX = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/140.0 Safari/537.36";

describe("notification settings", () => {
	const both = () => {
		const { calls, fetcher } = recorder(201);
		const push = new PushNotifier(":memory:", fetcher);
		push.subscribe(
			"me",
			{ endpoint: "https://web.push.apple.com/phone", ...keys },
			"mailto:a@b.c",
			PHONE,
		);
		push.subscribe(
			"me",
			{ endpoint: "https://fcm.googleapis.com/desk", ...keys },
			"mailto:a@b.c",
			LINUX,
		);
		return { calls, push };
	};
	const message = { title: "t", body: "b", url: "/", tag: "x" };

	it("names devices and tells phones from desktops", () => {
		const { push } = both();
		expect(
			push
				.devices("me")
				.map((device) => [device.label, device.kind])
				.sort(),
		).toEqual([
			["Chrome on Linux", "desktop"],
			["Safari on iPhone", "phone"],
		]);
	});
	it("sends each kind only to the devices the person chose for it", async () => {
		const { calls, push } = both();
		const prefs = structuredClone(DEFAULT_PREFS.notify);
		push.setPrefs(() => prefs);
		// Runs reach the desktop only by default.
		expect(await push.notify("me", message, "runs")).toBe(1);
		expect(calls).toEqual(["https://fcm.googleapis.com/desk"]);
		prefs.channels.runs = { desktop: false, phone: false, email: true };
		expect(await push.notify("me", message, "runs")).toBe(0);
	});
	it("holds updates through quiet hours, lets approvals through, and sends them after", async () => {
		const { calls, push } = both();
		const prefs = structuredClone(DEFAULT_PREFS.notify);
		prefs.quiet = { ...prefs.quiet, on: true, from: "00:00", to: "23:59" };
		push.setPrefs(() => prefs);
		expect(await push.notify("me", message, "reviews")).toBe(0);
		expect(await push.notify("me", message, "questions")).toBe(0);
		expect(calls).toHaveLength(0);
		expect(await push.notify("me", message, "approvals")).toBe(2);
		calls.length = 0;
		expect(await push.flushHeld()).toBe(0);
		prefs.quiet.on = false;
		expect(await push.flushHeld()).toBe(1);
		expect(calls).toHaveLength(2);
		expect(await push.flushHeld()).toBe(0);
	});
	it("tests one device, and sends a review once however often it is seen", async () => {
		const { calls, push } = both();
		const phone = push.devices("me").find((device) => device.kind === "phone");
		expect(await push.notify("me", message, undefined, phone?.id)).toBe(1);
		expect(calls).toEqual(["https://web.push.apple.com/phone"]);
		calls.length = 0;
		push.setPrefs(() => DEFAULT_PREFS.notify);
		expect(await push.notifyOnce("me", "review:1", message, "reviews")).toBe(2);
		expect(await push.notifyOnce("me", "review:1", message, "reviews")).toBe(0);
	});
	it("spends an approval's notification token once", () => {
		const push = new PushNotifier(":memory:");
		const token = push.createAct({
			ownerId: "me",
			workspace: "w",
			sessionId: "s",
			approvalId: "a",
		});
		expect(push.takeAct(token)).toEqual({
			ownerId: "me",
			workspace: "w",
			sessionId: "s",
			approvalId: "a",
		});
		expect(push.takeAct(token)).toBeNull();
		expect(push.takeAct("nope")).toBeNull();
	});
	it("tells questions from runs, and offers allow and deny on an approval", () => {
		expect(notifyKind({ type: "turn_end", reason: "done" }, "Which one should I use?")).toBe(
			"questions",
		);
		expect(notifyKind({ type: "turn_end", reason: "done" }, "Done.")).toBe("runs");
		expect(notifyKind({ type: "approval", id: "a", title: "t", options: [] }, "")).toBe(
			"approvals",
		);
		expect(
			lastReply([
				{ type: "message", text: "old" },
				{ type: "turn_start" },
				{ type: "message", text: "Shall I " },
				{ type: "message", text: "go on?" },
			]),
		).toBe("Shall I go on?");
		expect(
			approvalActions([
				{ id: "always", label: "Always", kind: "allow_always" },
				{ id: "yes", label: "Allow", kind: "allow" },
				{ id: "no", label: "Deny", kind: "deny" },
			]),
		).toEqual([
			{ action: "yes", title: "Allow" },
			{ action: "no", title: "Deny" },
		]);
	});
});

describe("push routes", () => {
	it("answers an approval from a notification once, with its token", async () => {
		const push = new PushNotifier(":memory:");
		const answered: string[] = [];
		const approve = (workspace: string, session: string, approval: string, option: string) =>
			answered.push([workspace, session, approval, option].join("/"));
		const act = (body: unknown) =>
			pushActRequest(
				new Request("http://runner/push/act", { method: "POST", body: JSON.stringify(body) }),
				new URL("http://runner/push/act"),
				push,
				approve,
			);
		const token = push.createAct({
			ownerId: "me",
			workspace: "w",
			sessionId: "s",
			approvalId: "a",
		});
		expect((await act({ token, option: "yes" }))?.status).toBe(204);
		expect((await act({ token, option: "yes" }))?.status).toBe(410);
		expect((await act({ option: "yes" }))?.status).toBe(400);
		expect(answered).toEqual(["w/s/a/yes"]);
	});
	it("lists devices and tests one of them", async () => {
		const { calls, fetcher } = recorder(201);
		const push = new PushNotifier(":memory:", fetcher);
		push.subscribe(
			"me",
			{ endpoint: "https://fcm.googleapis.com/desk", ...keys },
			"mailto:a@b.c",
			LINUX,
		);
		const call = (method: string, path: string, body?: unknown) =>
			pushRequest(
				new Request(`http://runner${path}`, {
					method,
					body: body ? JSON.stringify(body) : undefined,
				}),
				new URL(`http://runner${path}`),
				"me",
				push,
			);
		const devices = (
			(await (await call("GET", "/push/devices"))?.json()) as { data: { id: string }[] }
		).data;
		expect(devices).toHaveLength(1);
		expect((await call("POST", "/push/test", { device: devices[0]?.id }))?.status).toBe(204);
		expect((await call("POST", "/push/test", { device: "gone" }))?.status).toBe(404);
		expect(calls).toHaveLength(1);
	});
});
