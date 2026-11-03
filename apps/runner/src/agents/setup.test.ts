import { describe, expect, it } from "bun:test";

import { readConfig } from "../config";
import { type SpawnPty, TerminalStore } from "../terminals";
import {
	AGENT_SETUP,
	agyStatus,
	claudeStatus,
	codexStatus,
	cursorStatus,
	opencodeStatus,
	setupCommand,
	withAgentBins,
} from "./setup";

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
		expect(setupCommand("cursor", "install")).toBe("curl https://cursor.com/install -fsS | bash");
		expect(setupCommand("cursor", "sign-in")).toBe("NO_OPEN_BROWSER=1 cursor-agent login");
		expect(setupCommand("antigravity", "install")).toBe(
			"curl -fsSL https://antigravity.google/cli/install.sh | bash",
		);
		expect(setupCommand("antigravity", "sign-in")).toBe("agy");
		expect(setupCommand("nope", "sign-in")).toBeNull();
	});

	it("updates each agent with its own updater", () => {
		expect(setupCommand("claude", "update")).toBe("claude update");
		expect(setupCommand("opencode", "update")).toBe("opencode upgrade");
		expect(setupCommand("cursor", "update")).toBe("cursor-agent update");
		expect(setupCommand("antigravity", "update")).toBe("agy update");
		expect(setupCommand("codex", "update")).toBe(AGENT_SETUP.codex.install ?? "");
		expect(setupCommand("nope", "update")).toBeNull();
	});

	it("reads who each agent is signed in as", () => {
		expect(claudeStatus('{"loggedIn":true,"email":"me@x.dev","orgName":"Org"}', 0)).toEqual({
			signedIn: true,
			account: "me@x.dev",
		});
		expect(claudeStatus('{"loggedIn":false}', 1)).toEqual({ signedIn: false, account: null });
		expect(claudeStatus("", 127)).toEqual({ signedIn: null });

		expect(codexStatus("Logged in using ChatGPT\n", 0)).toEqual({
			signedIn: true,
			account: "Logged in using ChatGPT",
		});
		expect(codexStatus("Not logged in\n", 1)).toEqual({ signedIn: false, account: null });

		expect(
			opencodeStatus("OpenCode Console  Default   stored\nGitHub Copilot  oauth  stored\n"),
		).toEqual({
			signedIn: true,
			account: "OpenCode Console, GitHub Copilot",
		});
		expect(opencodeStatus("┌  Credentials\n│\n└  0 credentials\n")).toEqual({
			signedIn: false,
			account: null,
		});
		expect(opencodeStatus("")).toEqual({ signedIn: null });

		expect(cursorStatus('{"isAuthenticated":true,"email":"me@x.dev"}', 0)).toEqual({
			signedIn: true,
			account: "me@x.dev",
		});
		expect(cursorStatus("✓ Logged in as me@x.dev", 0)).toEqual({
			signedIn: true,
			account: "me@x.dev",
		});
		expect(cursorStatus("Not logged in", 1)).toEqual({ signedIn: false });
		expect(cursorStatus("", 127)).toEqual({ signedIn: null });

		expect(agyStatus("gemini-3.8-flash-high\tGemini 3.8 Flash (High)\n", 0)).toEqual({
			signedIn: true,
			account: null,
		});
		expect(agyStatus("Please sign in to continue", 1)).toEqual({ signedIn: false });
		expect(agyStatus("", 127)).toEqual({ signedIn: null });
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
