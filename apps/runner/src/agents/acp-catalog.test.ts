import { describe, expect, it } from "bun:test";
import { join } from "node:path";

import { acpProvider, probeCatalog } from "./acp";
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
