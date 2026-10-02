import { afterAll, describe, expect, it } from "bun:test";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createGh } from "./gh";

// `gh` is spawned as a bare binary, so the fake needs a name the OS will run. It is a wrapper
// that hands the fixture to bun, the way the other fake CLI in the runner's tests is run.
const dir = mkdtempSync(join(tmpdir(), "grid-fake-gh-"));
const FAKE = join(import.meta.dir, "testing", "fake-gh.ts");
const binary = join(dir, "gh");
writeFileSync(binary, `#!/bin/sh\nexec bun "${FAKE}" "$@"\n`);
chmodSync(binary, 0o755);

afterAll(() => rmSync(dir, { recursive: true, force: true }));

/** Everything the fake printed, once it is done. */
async function printed(): Promise<string> {
	const child = createGh(binary).spawn(["auth", "login"]);
	let seen = "";
	child.output((chunk) => {
		seen += chunk;
	});
	expect(await child.exited).toBe(0);
	// Give the final flush a moment to reach the listener.
	await Bun.sleep(20);
	return seen;
}

describe("gh sign-in output", () => {
	it("keeps a character whole when it arrives in two reads", async () => {
		// The device code and the paste-back token are read off this output and typed by hand.
		// Decoding each chunk on its own turned a character that straddled two reads into U+FFFD.
		process.env.FAKE_GH_TEXT = "code: ABCD-1234\npaste this back: café-ü→ok\n";
		const seen = await printed();
		expect(seen).toBe(process.env.FAKE_GH_TEXT);
		expect(seen).not.toContain("\ufffd");
		delete process.env.FAKE_GH_TEXT;
	});

	it("holds back a character until the rest of it arrives", async () => {
		process.env.FAKE_GH_TEXT = "→ done\n";
		const child = createGh(binary).spawn(["auth", "login"]);
		let seen = "";
		child.output((chunk) => {
			seen += chunk;
		});
		// Nothing may be handed over as a broken character: the person is reading it to type it.
		await Bun.sleep(10);
		expect(seen).not.toContain("\ufffd");
		expect(await child.exited).toBe(0);
		await Bun.sleep(20);
		expect(seen).toBe("→ done\n");
		delete process.env.FAKE_GH_TEXT;
	});
});
