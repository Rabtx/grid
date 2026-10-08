import { afterEach, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { machineRunnerKey } from "./runner-key";

const dirs: string[] = [];
afterEach(() => {
	for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("machineRunnerKey", () => {
	it("makes one key per machine, private, and reads the same one after", () => {
		const home = mkdtempSync(join(tmpdir(), "grid-api-key-"));
		dirs.push(home);
		const env = { XDG_DATA_HOME: home };
		const key = machineRunnerKey(env);
		expect(key).toMatch(/^[0-9a-f]{64}$/);
		expect(machineRunnerKey(env)).toBe(key);
		expect(statSync(join(home, "grid", "runner.key")).mode & 0o777).toBe(0o600);
	});
});
