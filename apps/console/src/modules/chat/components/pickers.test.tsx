import { render } from "@solidjs/web";
import { createSignal } from "solid-js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { favoritesStore } from "../stores/favorites";
import type { ChatProvider, Choice } from "../types/chat.types";

import { ModelPicker } from "./pickers";

const claude: Choice[] = [
	{ id: "claude-opus-5-5", name: "Opus 5.5", group: "Anthropic" },
	{ id: "claude-sonnet-5", name: "Sonnet 5", group: "Anthropic" },
];
const codex: Choice[] = [{ id: "gpt-5.5", name: "GPT-5.5", group: "OpenAI" }];

const agents = [
	{ id: "claude", name: "Claude Code", models: claude },
	{ id: "codex", name: "Codex", models: codex },
] as unknown as ChatProvider[];

async function settle(): Promise<void> {
	for (let i = 0; i < 5; i++) await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("ModelPicker", () => {
	let container: HTMLElement;
	let dispose: () => void;
	let picked: { agent: string; model: string };

	beforeEach(() => {
		localStorage.clear();
		for (const key of favoritesStore.all()) {
			const [agent, model] = key.split(":");
			favoritesStore.toggle(agent, model);
		}
		container = document.createElement("div");
		document.body.append(container);
		dispose = render(() => {
			const [agent, setAgent] = createSignal("claude");
			const [model, setModel] = createSignal("claude-sonnet-5");
			picked = { agent: agent(), model: model() };
			return (
				<ModelPicker
					agents={agents}
					agent={agent()}
					onAgent={(id) => {
						setAgent(id);
						picked = { ...picked, agent: id };
					}}
					models={agents.find((item) => item.id === agent())?.models ?? []}
					model={model()}
					onModel={(id) => {
						setModel(id);
						picked = { ...picked, model: id };
					}}
					efforts={[]}
					effort={null}
					onEffort={() => {}}
				/>
			);
		}, container);
	});

	afterEach(() => {
		dispose();
		document.body.replaceChildren();
	});

	async function open(): Promise<void> {
		document.querySelector<HTMLButtonElement>('button[aria-label="Agent and model"]')?.click();
		await settle();
	}

	function rows(): string[] {
		return [...document.querySelectorAll("[data-model-list] button[aria-pressed]")]
			.map((button) => button.getAttribute("aria-label") ?? "")
			.filter((label) => !label.includes("favourites"));
	}

	it("names the agent and the model on its chip", () => {
		const chip = document.querySelector('button[aria-label="Agent and model"]');
		expect(chip?.textContent).toContain("Claude Code · Sonnet 5");
	});

	it("lists the agents, then the current agent's models", async () => {
		await open();
		const agentRows = [...document.querySelectorAll('[role="radiogroup"] [role="radio"]')];
		expect(agentRows.map((row) => row.textContent)).toEqual([
			"Claude CodeAnthropic",
			"CodexOpenAI",
		]);
		expect(agentRows[0].getAttribute("aria-checked")).toBe("true");
		expect(rows()).toEqual(["Opus 5.5", "Sonnet 5"]);
	});

	it("switches agent from the list and keeps the panel open to pick its model", async () => {
		await open();
		[...document.querySelectorAll<HTMLButtonElement>('[role="radio"]')]
			.find((row) => row.textContent?.startsWith("Codex"))
			?.click();
		await settle();
		expect(rows()).toEqual(["GPT-5.5"]);
		document.querySelector<HTMLButtonElement>('button[aria-label="GPT-5.5"]')?.click();
		await settle();
		expect(picked).toEqual({ agent: "codex", model: "gpt-5.5" });
	});

	it("keeps a starred model as a favourite", async () => {
		await open();
		document
			.querySelector<HTMLButtonElement>('button[aria-label="Add Opus 5.5 to favourites"]')
			?.click();
		await settle();
		expect(favoritesStore.has("claude", "claude-opus-5-5")).toBe(true);
		expect(
			document.querySelector('button[aria-label="Remove Opus 5.5 from favourites"]'),
		).not.toBeNull();
	});

	it("gives a long list a search, its favourites first and its labs as headings", async () => {
		dispose();
		document.body.replaceChildren();
		const many: Choice[] = Array.from({ length: 10 }, (_, index) => ({
			id: `m${index}`,
			name: `Model ${index}`,
			group: index < 5 ? "Lab A" : "Lab B",
		}));
		favoritesStore.toggle("opencode", "m7");
		const host = document.createElement("div");
		document.body.append(host);
		dispose = render(
			() => (
				<ModelPicker
					agent="opencode"
					agentName="opencode"
					models={many}
					model="m0"
					onModel={() => {}}
					efforts={[]}
					effort={null}
					onEffort={() => {}}
				/>
			),
			host,
		);
		await open();
		expect(document.querySelector('input[aria-label="Search models"]')).not.toBeNull();
		expect(rows()[0]).toBe("Model 7");
		const headings = [...document.querySelectorAll("[data-model-list] section")].map((section) =>
			section.getAttribute("aria-label"),
		);
		expect(headings).toEqual(["Favourites", "Lab A", "Lab B"]);
	});
});
