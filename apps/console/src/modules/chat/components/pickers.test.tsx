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
		document.querySelector<HTMLButtonElement>('button[aria-label="Model"]')?.click();
		await settle();
	}

	function rows(): string[] {
		return [...document.querySelectorAll("[data-model-list] button[aria-pressed]")]
			.map((button) => button.getAttribute("aria-label") ?? "")
			.filter((label) => !label.includes("favourites"));
	}

	it("lists the current agent's models, with the other agents on the rail", async () => {
		await open();
		expect(rows()).toEqual(["Opus 5.5", "Sonnet 5"]);
		const rail = [...document.querySelectorAll('[aria-label="Show models from"] [role="tab"]')];
		expect(rail.map((tab) => tab.getAttribute("aria-label"))).toEqual(["Claude Code", "Codex"]);
	});

	it("switches agent when a model of another agent is picked", async () => {
		await open();
		document.querySelector<HTMLButtonElement>('[role="tab"][aria-label="Codex"]')?.click();
		await settle();
		expect(rows()).toEqual(["GPT-5.5"]);
		document.querySelector<HTMLButtonElement>('button[aria-label="GPT-5.5"]')?.click();
		await settle();
		expect(picked).toEqual({ agent: "codex", model: "gpt-5.5" });
	});

	it("keeps starred models under Favourites, across agents", async () => {
		await open();
		document
			.querySelector<HTMLButtonElement>('button[aria-label="Add Opus 5.5 to favourites"]')
			?.click();
		await settle();
		const favourites = document.querySelector<HTMLButtonElement>(
			'[role="tab"][aria-label="Favourites"]',
		);
		expect(favourites).not.toBeNull();
		favourites?.click();
		await settle();
		expect(rows()).toEqual(["Opus 5.5"]);
		expect(favoritesStore.has("claude", "claude-opus-5-5")).toBe(true);
	});
});
