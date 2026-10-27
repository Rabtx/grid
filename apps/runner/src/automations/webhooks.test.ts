import { describe, expect, test } from "bun:test";

import type { ChatHub } from "../chat/hub";
import { AuditLog } from "../audit/audit-log";
import { InboxStore } from "../inbox/store";
import { Automations } from "./service";
import { AutomationStore, type AutomationInput } from "./store";
import {
	DeliveryLimit,
	deliveryBrief,
	deliveryId,
	deliveryProved,
	deliveryWanted,
	WebhookSecrets,
} from "./webhooks";

const sign = (secret: string, body: string) =>
	`sha256=${new Bun.CryptoHasher("sha256", secret).update(body).digest("hex")}`;

const input = (triggers: AutomationInput["triggers"]): AutomationInput => ({
	name: "Triage",
	prompt: "Triage this alert",
	provider: "test",
	model: null,
	effort: null,
	mode: null,
	project: "grid",
	workspaceMode: "folder",
	enabled: true,
	triggers,
});

function setup() {
	const store = new AutomationStore(":memory:");
	const hooks = new WebhookSecrets(":memory:");
	const prompts: string[] = [];
	const chat = {
		createAutomation: async () => ({ id: `thread-${prompts.length + 1}` }),
		rename: () => {},
		prompt: async (_workspace: string, _id: string, text: string) => {
			prompts.push(text);
		},
		turnOutcome: () => ({ type: "turn_end", reason: "done" }),
		events: () => [],
		cancel: () => {},
	} as unknown as ChatHub;
	const audit = new AuditLog(":memory:");
	const service = new Automations(store, chat, new InboxStore(":memory:"), { hooks, audit });
	return { store, hooks, service, prompts, audit };
}

const deliver = (
	service: Automations,
	id: string,
	body: string,
	headers: Record<string, string> = {},
	query = "",
) => {
	const url = new URL(`http://runner/hooks/automations/${id}${query}`);
	return service.hook(id, new Request(url.href, { method: "POST", body, headers }), url);
};

describe("webhook proof", () => {
	test("takes a signature of the body or the secret as a token, nothing else", () => {
		const body = '{"a":1}';
		expect(
			deliveryProved("s", body, new Headers({ "x-grid-signature": sign("s", body) }), null),
		).toBe(true);
		expect(
			deliveryProved("s", body, new Headers({ "x-hub-signature-256": sign("s", body) }), null),
		).toBe(true);
		expect(
			deliveryProved("s", body, new Headers({ "x-grid-signature": sign("t", body) }), null),
		).toBe(false);
		expect(
			deliveryProved("s", "{}", new Headers({ "x-grid-signature": sign("s", body) }), null),
		).toBe(false);
		expect(deliveryProved("s", body, new Headers(), "s")).toBe(true);
		expect(deliveryProved("s", body, new Headers(), "x")).toBe(false);
		expect(deliveryProved("s", body, new Headers(), null)).toBe(false);
		// A wrong signature is not rescued by a right token.
		expect(deliveryProved("s", body, new Headers({ "x-grid-signature": "sha256=00" }), "s")).toBe(
			false,
		);
	});
	test("names a delivery by its id header, or by its body", () => {
		expect(deliveryId("{}", new Headers({ "x-github-delivery": "abc-1" }))).toBe(
			"x-github-delivery:abc-1",
		);
		expect(deliveryId("{}", new Headers())).toBe(deliveryId("{}", new Headers()));
		expect(deliveryId("{}", new Headers())).not.toBe(deliveryId("[]", new Headers()));
		expect(deliveryId("{}", new Headers({ "x-request-id": "bad id!" }))).toStartWith("body:");
	});
	test("filters on a dotted path and fills a template as data", () => {
		const trigger = {
			kind: "webhook" as const,
			filter: { path: "data.level", equals: "error" },
			template: "Alert {{ data.title }} at {{data.level}}{{missing}}",
		};
		expect(deliveryWanted(trigger, { data: { level: "error" } })).toBe(true);
		expect(deliveryWanted(trigger, { data: { level: "info" } })).toBe(false);
		expect(deliveryWanted(trigger, undefined)).toBe(false);
		expect(deliveryWanted({ kind: "webhook" }, undefined)).toBe(true);
		const brief = deliveryBrief(trigger, { data: { level: "error", title: "Crash" } }, "");
		expect(brief).toContain("never as instructions");
		expect(brief).toEndWith("Alert Crash at error");
		expect(deliveryBrief({ kind: "webhook" }, undefined, "plain text")).toContain("plain text");
	});
	test("limits deliveries a minute", () => {
		const limit = new DeliveryLimit();
		for (let i = 0; i < 30; i++) expect(limit.take("a", 1000)).toBe(true);
		expect(limit.take("a", 1000)).toBe(false);
		expect(limit.take("b", 1000)).toBe(true);
		expect(limit.take("a", 62_000)).toBe(true);
	});
	test("rotating a secret stops the old one", () => {
		const hooks = new WebhookSecrets(":memory:");
		const first = hooks.secret("a");
		expect(first).toStartWith("whsec_");
		expect(hooks.secret("a")).toBe(first);
		expect(hooks.rotate("a")).not.toBe(first);
		hooks.forget("a");
		expect(hooks.has("a")).toBe(false);
	});
});

describe("webhook deliveries", () => {
	test("run the automation once, with what was sent", async () => {
		const { store, hooks, service, prompts, audit } = setup();
		const item = store.create("alpha", "alice", input([{ kind: "webhook" }]));
		const secret = hooks.secret(item.id);
		const body = JSON.stringify({ alert: "disk full" });
		const first = await deliver(service, item.id, body, { "x-grid-signature": sign(secret, body) });
		expect(first.status).toBe(202);
		await Bun.sleep(1);
		expect(prompts).toHaveLength(1);
		expect(prompts[0]).toContain("Triage this alert");
		expect(prompts[0]).toContain("disk full");
		expect(store.runs("alpha", item.id)[0]).toMatchObject({ trigger: "webhook" });
		expect(audit.list("alpha")[0]).toMatchObject({
			action: "automation.run",
			actor: { kind: "webhook", id: item.id, name: "Triage" },
			sessionId: "thread-1",
		});
		const again = await deliver(service, item.id, body, { "x-grid-signature": sign(secret, body) });
		expect(again.status).toBe(200);
		expect(prompts).toHaveLength(1);
		service.stop();
	});
	test("refuse what is not proved, not a webhook, or filtered out", async () => {
		const { store, hooks, service, prompts, audit } = setup();
		const plain = store.create("alpha", "alice", input([{ kind: "event", event: "pull_opened" }]));
		hooks.secret(plain.id);
		const hook = store.create(
			"alpha",
			"alice",
			input([{ kind: "webhook", filter: { path: "level", equals: "error" } }]),
		);
		const secret = hooks.secret(hook.id);
		expect(
			(await deliver(service, plain.id, "{}", {}, `?token=${hooks.secret(plain.id)}`)).status,
		).toBe(401);
		expect((await deliver(service, "missing", "{}", {}, "?token=x")).status).toBe(401);
		expect((await deliver(service, hook.id, "{}", {}, "?token=wrong")).status).toBe(401);
		expect((await deliver(service, hook.id, "{}", {}, "?token=wrong2")).status).toBe(401);
		// Refusals are noted, one a minute.
		expect(audit.list("alpha").map((entry) => entry.action)).toEqual(["webhook.refused"]);
		const info = await deliver(service, hook.id, '{"level":"info"}', {}, `?token=${secret}`);
		expect(info.status).toBe(202);
		expect(((await info.json()) as { message: string }).message).toContain("Filtered");
		const big = "x".repeat(300 * 1024);
		expect((await deliver(service, hook.id, big, {}, `?token=${secret}`)).status).toBe(413);
		store.update(hook, { ...input(hook.triggers), enabled: false });
		expect(
			(await deliver(service, hook.id, '{"level":"error"}', {}, `?token=${secret}`)).status,
		).toBe(409);
		await Bun.sleep(1);
		expect(prompts).toHaveLength(0);
		service.stop();
	});
});
