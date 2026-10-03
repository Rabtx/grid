import { describe, expect, it } from "vitest";

import type { TerminalInfo } from "../types/terminal.types";

import { detailOf, shortPath, stateOf } from "./terminal-look";

const terminal = (overrides: Partial<TerminalInfo> = {}): TerminalInfo => ({
	id: "t1",
	title: "zsh",
	cwd: "/home/sam/grid",
	cols: 80,
	rows: 24,
	createdAt: "2026-10-03T00:00:00.000Z",
	exitCode: null,
	...overrides,
});
const status = (overrides: Partial<NonNullable<TerminalInfo["status"]>> = {}) => ({
	cwd: "/home/sam/grid",
	command: null,
	ports: [],
	branch: null,
	ahead: null,
	preview: [],
	...overrides,
});

describe("terminal look", () => {
	it("says a served port first, then the command, then the folder it waits in", () => {
		expect(
			detailOf(terminal({ status: status({ command: "bun run dev", ports: [5173, 24678] }) })),
		).toBe("localhost:5173 +1");
		expect(stateOf(terminal({ status: status({ ports: [5173] }) }))).toBe("serving");
		expect(detailOf(terminal({ status: status({ command: "bun test --watch" }) }))).toBe(
			"bun test --watch",
		);
		expect(stateOf(terminal({ status: status({ command: "bun test --watch" }) }))).toBe("running");
		expect(detailOf(terminal({ status: status() }))).toBe("~/grid");
		expect(stateOf(terminal())).toBe("idle");
	});

	it("says how an ended terminal ended", () => {
		expect(detailOf(terminal({ exitCode: 130 }))).toBe("exit 130");
		expect(stateOf(terminal({ exitCode: 130 }))).toBe("failed");
		expect(stateOf(terminal({ exitCode: 0 }))).toBe("idle");
	});

	it("writes the home folder as ~", () => {
		expect(shortPath("/home/sam/Projects/grid")).toBe("~/Projects/grid");
		expect(shortPath("/Users/sam")).toBe("~");
		expect(shortPath("/srv/app")).toBe("/srv/app");
	});
});
