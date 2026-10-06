import { render } from "@solidjs/web";
import { flush } from "solid-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SkillsScreen } from "./skills-screen";
import { skillsService } from "../services/skills.service";
import type { Skill, SkillsView } from "../types/skill.types";

vi.mock("@/modules/auth", () => ({ useAuth: () => ({ token: () => "token" }) }));
vi.mock("@/modules/settings", () => ({
	SettingsPage: (props: { title: string; actions?: unknown; children: unknown }) => (
		<div>
			<h1>{props.title}</h1>
			{props.actions}
			{props.children}
		</div>
	),
}));

const providers = [
	{ id: "fake", name: "Fake agent", available: true, delivery: "message-context" as const },
	{ id: "offline", name: "Offline agent", available: false, delivery: "message-context" as const },
];
const skill = (enabled = true): Skill => ({
	id: "skill-1",
	workspace: "workspace-1",
	name: "review-prs",
	description: "Review each change",
	enabled,
	scope: { type: "workspace" },
	source: { type: "written", label: "Written in Grid" },
	skillMarkdown: "---\nname: review-prs\ndescription: Review each change\n---\n\nCheck edge cases.",
	files: [],
	createdAt: "2026-10-07T00:00:00.000Z",
	updatedAt: "2026-10-07T00:00:00.000Z",
});

async function settle(): Promise<void> {
	for (let index = 0; index < 8; index++) {
		await new Promise((resolve) => setTimeout(resolve, 0));
		flush();
	}
}

describe("SkillsScreen", () => {
	let container: HTMLElement;
	let dispose: () => void;
	let current: SkillsView;
	let failLoad: boolean;

	beforeEach(() => {
		HTMLDialogElement.prototype.showModal = function () {
			this.setAttribute("open", "");
		};
		HTMLDialogElement.prototype.close = function () {
			this.removeAttribute("open");
		};
		current = { skills: [], projects: ["website"], providers, canManage: true };
		failLoad = false;
		vi.spyOn(skillsService, "view").mockImplementation(async () => {
			if (failLoad) throw new Error("Runner unavailable");
			return current;
		});
		vi.spyOn(skillsService, "write").mockImplementation(async (_token, input) => {
			const added = { ...skill(), skillMarkdown: input.skillMarkdown };
			current = { ...current, skills: [added] };
			return added;
		});
		vi.spyOn(skillsService, "update").mockImplementation(async (_token, id, patch) => {
			const updated = { ...current.skills.find((item) => item.id === id)!, ...patch } as Skill;
			current = {
				...current,
				skills: current.skills.map((item) => (item.id === id ? updated : item)),
			};
			return updated;
		});
		container = document.createElement("div");
		document.body.append(container);
		dispose = render(() => <SkillsScreen />, container);
	});

	afterEach(() => {
		dispose();
		container.remove();
		vi.restoreAllMocks();
	});

	it("shows the empty state and each agent's delivery status", async () => {
		await settle();
		expect(container.textContent).toContain("No skills yet");
		expect(container.textContent).toContain("Fake agent");
		expect(container.textContent).toContain("Offline agent · not installed");
		expect(container.textContent).toContain("How skills reach agents");
	});

	it("writes a skill in place, scopes it, and toggles delivery", async () => {
		await settle();
		[...container.querySelectorAll<HTMLButtonElement>("button")]
			.find((button) => button.textContent === "Write a skill")
			?.click();
		await settle();
		const fields = [...container.querySelectorAll<HTMLInputElement>("input")];
		const name = fields.find((field) => field.getAttribute("maxlength") === "64");
		const description = fields.find((field) => field.getAttribute("maxlength") === "300");
		const instructions = container.querySelector<HTMLTextAreaElement>("textarea");
		for (const [field, value] of [
			[name, "review-prs"],
			[description, "Review every pull request"],
		] as const) {
			if (!field) throw new Error("A skill field was not rendered");
			field.value = value;
			field.dispatchEvent(new Event("input", { bubbles: true }));
			await settle();
		}
		if (!instructions) throw new Error("Instructions were not rendered");
		instructions.value = "Check edge cases and tests.";
		instructions.dispatchEvent(new Event("input", { bubbles: true }));
		await settle();
		container.querySelector<HTMLButtonElement>("dialog footer button:last-child")?.click();
		await settle();
		expect(skillsService.write).toHaveBeenCalledWith("token", {
			skillMarkdown: expect.stringContaining('description: "Review every pull request"'),
			scope: { type: "workspace" },
		});
		expect(container.textContent).toContain("review-prs");
		expect(container.textContent).toContain("Written in Grid");

		container.querySelector<HTMLButtonElement>('[role="switch"]')?.click();
		await settle();
		expect(skillsService.update).toHaveBeenCalledWith("token", "skill-1", { enabled: false });
		expect(container.textContent).toContain("Off");
	});

	it("shows a retry action when the runner cannot load skills", async () => {
		dispose();
		container.innerHTML = "";
		failLoad = true;
		dispose = render(() => <SkillsScreen />, container);
		await settle();
		expect(container.textContent).toContain("Skills could not be loaded");
		expect(container.textContent).toContain("Runner unavailable");
		failLoad = false;
		[...container.querySelectorAll<HTMLButtonElement>("button")]
			.find((button) => button.textContent === "Try again")
			?.click();
		await settle();
		expect(container.textContent).toContain("No skills yet");
	});
});
