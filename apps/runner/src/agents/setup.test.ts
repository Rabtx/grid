import { describe, expect, it } from "bun:test";

import { readConfig } from "../config";
import { type SpawnPty, TerminalStore } from "../terminals";
import { AGENT_SETUP, setupCommand, withAgentBins } from "./setup";

describe("agent setup", () => {
	it("knows each vendor's own install and sign-in, and nothing for agents it cannot install", () => {
		expect(setupCommand("claude", "install")).toBe(
			"curl -fsSL https://claude.ai/install.sh | bash",
		);
		expect(setupCommand("claude", "sign-in")).toBe("claude auth login");
		expect(setupCommand("codex", "sign-in")).toBe("codex login --device-auth");
		expect(setupCommand("opencode", "install")).toBe(
			"curl -fsSL https://opencode.ai/install | bash",
		);
		expect(AGENT_SETUP.opencode.signInOptional).toBe(true);
		expect(setupCommand("antigravity", "install")).toBeNull();
		expect(setupCommand("nope", "sign-in")).toBeNull();
	});

	it("adds the installers' folders to PATH once, after what is already there", () => {
		const path = withAgentBins("/usr/bin:/home/me/.local/bin", "/home/me");
		expect(path.split(":")).toEqual([
			"/usr/bin",
			"/home/me/.local/bin",
			"/home/me/.opencode/bin",
			"/home/me/.bun/bin",
			"/home/me/.npm-global/bin",
		]);
		expect(withAgentBins(path, "/home/me")).toBe(path);
	});

	it("opens a terminal that types the setup command in, titled for it", () => {
		const writes: string[] = [];
		const spawn: SpawnPty = () => ({
			write: (data) => writes.push(String(data)),
			resize: () => {},
			kill: () => {},
		});
		const store = new TerminalStore({ ...readConfig({}), shell: "/bin/sh" }, spawn);
		const info = store.open("me", { cols: 80, rows: 24 }, undefined, {
			command: "codex login --device-auth",
			title: "Sign in codex",
		});
		expect(info?.title).toBe("Sign in codex");
		expect(writes).toEqual(["codex login --device-auth\r"]);
	});
});
