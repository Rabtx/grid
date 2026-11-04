import { describe, expect, it } from "bun:test";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { acpProvider, GRID_MODES, probeCatalog } from "./acp";
import type { ChatEvent } from "./events";
import type { AgentSession } from "./provider";
import { type Spawn, spawnJsonProcess } from "./stdio";

/** The stand-in ACP agent (`chaos/fake-acp.ts`), as Gemini. */
const fakeGemini = [process.execPath, join(import.meta.dir, "..", "chaos", "fake-acp.ts")];
const asGemini: Spawn = (command, options) =>
	spawnJsonProcess(command, { ...options, env: { ...options.env, FAKE_ACP_AS: "gemini" } });

describe("an ACP agent with no model list of its own", () => {
	it("lists the models and modes it offers, read off a session opened for it", async () => {
		const found = await probeCatalog(fakeGemini, asGemini);
		expect(found.models.map((model) => model.id)).toEqual(["gemini-3-pro", "gemini-3-flash"]);
		expect(found.modes?.map((mode) => mode.id)).toEqual(["build", "plan"]);
	});

	it("is what its provider's catalog gives, so the picker has them before a thread", async () => {
		const provider = acpProvider({
			id: "gemini",
			name: "Gemini",
			command: fakeGemini,
			available: () => true,
			spawn: asGemini,
		});
		const catalog = await provider.catalog?.();
		expect(catalog?.models.map((model) => model.name)).toEqual(["Gemini 3 Pro", "Gemini 3 Flash"]);
	});
});

/** The stand-in ACP agent as Grok: no modes, levels highest first, each model's own in `_meta`. */
const asGrok: Spawn = (command, options) =>
	spawnJsonProcess(command, { ...options, env: { ...options.env, FAKE_ACP_AS: "grok" } });
const grok = () =>
	acpProvider({
		id: "grok",
		name: "Grok",
		command: fakeGemini,
		available: () => true,
		spawn: asGrok,
		gridModes: true,
	});

describe("an ACP agent with no modes and its own effort levels (Grok)", () => {
	it("lists each model's levels lowest first before a thread, with Grid's modes", async () => {
		const catalog = await grok().catalog?.();
		const [big, older] = catalog?.models ?? [];
		expect(big?.efforts?.map((level) => level.id)).toEqual(["low", "medium", "high", "xhigh"]);
		expect(big?.efforts?.at(-1)?.name).toBe("Extra High");
		expect(big?.defaultEffort).toBe("high");
		expect(older?.efforts?.map((level) => level.id)).toEqual(["low", "medium", "high"]);
		expect(catalog?.modes?.map((mode) => mode.id)).toEqual(GRID_MODES.map((mode) => mode.id));
		expect(grok().info().defaultMode).toBe("ask");
	});

	it("asks in Ask, answers edits itself in Accept edits, and everything in Full access", async () => {
		const events: ChatEvent[] = [];
		let session: AgentSession | null = null;
		session = await grok().start({
			cwd: tmpdir(),
			emit: (event) => {
				events.push(event);
				// Answer whatever reaches the person: allow once.
				if (event.type === "approval") session?.approve(event.id, "once");
			},
			onResumeToken: () => {},
		});
		try {
			const said = () =>
				events
					.filter((event) => event.type === "message")
					.map((event) => (event as { text: string }).text)
					.at(-1);
			const approvals = () => events.filter((event) => event.type === "approval").length;
			expect(events.some((event) => event.type === "info" && event.mode === "ask")).toBe(true);

			await session.prompt("ASK:edit");
			expect(approvals()).toBe(1);
			expect(said()).toBe("permission: once");

			await session.setMode?.("accept-edits");
			await session.prompt("ASK:edit");
			expect(approvals()).toBe(1);
			// Allowed once, never "always" on Grok's side.
			expect(said()).toBe("permission: once");
			await session.prompt("ASK:execute");
			expect(approvals()).toBe(2);

			await session.setMode?.("full-access");
			await session.prompt("ASK:execute");
			expect(approvals()).toBe(2);
			expect(said()).toBe("permission: once");
		} finally {
			session.close();
		}
	});
});
