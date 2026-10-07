import { afterAll, describe, expect, it } from "bun:test";
import { chmodSync, mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { ChatStore } from "./chat/store";
import { openPrivateDatabase } from "./private-database";

const dir = mkdtempSync(join(tmpdir(), "grid-private-db-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const mode = (path: string) => statSync(path).mode & 0o777;

describe("runner databases", () => {
	it("are created readable by their owner only, journal files included", () => {
		const path = join(dir, "chat.db");
		const store = new ChatStore(path);
		// A write, so SQLite has made its write-ahead log and shared-memory files.
		store.setProjectFolder("u1", "shop", "/tmp/shop");
		expect(mode(path)).toBe(0o600);
		expect(mode(`${path}-wal`)).toBe(0o600);
		expect(mode(`${path}-shm`)).toBe(0o600);
	});

	it("tighten a database an older runner left world-readable", () => {
		const path = join(dir, "old.db");
		writeFileSync(path, "");
		chmodSync(path, 0o644);
		const db = openPrivateDatabase(path);
		db.exec("CREATE TABLE t (x)");
		db.close();
		expect(mode(path)).toBe(0o600);
	});

	it("leave in-memory databases alone", () => {
		expect(() => openPrivateDatabase(":memory:").exec("SELECT 1")).not.toThrow();
	});
});
