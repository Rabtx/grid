import { afterAll, describe, expect, it } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { ChatStore } from "./store";

const dir = mkdtempSync(join(tmpdir(), "grid-catalog-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("kept model lists", () => {
	it("keeps an agent's list, and asks again for one kept by an older Grid", () => {
		const path = join(dir, "chat.db");
		const store = new ChatStore(path);
		store.setCatalog("grok", { models: [{ id: "grok-4.7", name: "Grok 4.7" }] });
		expect(store.catalog("grok")?.data.models.map((model) => model.id)).toEqual(["grok-4.7"]);
		// Kept before lists carried a version: read as not asked yet, so the agent is asked again.
		const db = new Database(path);
		db.query("UPDATE provider_catalogs SET data = ? WHERE provider = ?").run(
			JSON.stringify({ models: [{ id: "grok-4.7", name: "Grok 4.7" }] }),
			"grok",
		);
		db.close();
		expect(store.catalog("grok")).toBeNull();
	});
});
