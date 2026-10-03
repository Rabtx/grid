import { describe, expect, it } from "bun:test";

import { AcpAgentStore, agentId, splitCommand } from "./acp-agents";
import { parseVersion } from "./versions";

describe("added ACP agents", () => {
	it("reads a command and makes an id from a name", () => {
		expect(splitCommand('gemini --experimental-acp --model "pro 2"')).toEqual([
			"gemini",
			"--experimental-acp",
			"--model",
			"pro 2",
		]);
		expect(agentId("Gemini CLI!")).toBe("gemini-cli");
	});
	it("keeps and forgets them", () => {
		const store = new AcpAgentStore(":memory:");
		store.add({ id: "gemini", name: "Gemini", command: ["gemini", "--acp"] });
		expect(store.list()).toMatchObject([{ id: "gemini", command: ["gemini", "--acp"] }]);
		expect(store.remove("gemini")).toBe(true);
		expect(store.remove("gemini")).toBe(false);
	});
	it("finds a version in what an agent prints", () => {
		expect(parseVersion("2.1.4 (Claude Code)")).toBe("v2.1.4");
		expect(parseVersion("codex-cli 0.48.0")).toBe("v0.48.0");
		expect(parseVersion("opencode v0.9")).toBe("v0.9");
		expect(parseVersion("no version here")).toBeNull();
	});
});
