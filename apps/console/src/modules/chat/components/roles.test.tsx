import { render } from "@solidjs/web";
import { createSignal } from "solid-js";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ChatProvider, Role } from "../types/chat.types";

import { describeRole, RoleDialog, RoleMenu } from "./roles";

const providers = [
	{
		id: "claude",
		name: "Claude Code",
		available: true,
		modes: [],
		models: [
			{
				id: "claude-opus-5-5",
				name: "Opus 5.5",
				efforts: [
					{ id: "high", name: "High" },
					{ id: "max", name: "Max" },
				],
			},
			{ id: "claude-haiku-4-5", name: "Haiku 4.5" },
		],
	},
] as unknown as ChatProvider[];

const role = (over: Partial<Role> = {}): Role => ({
	id: "r1",
	name: "Engineer",
	icon: "code",
	brief: "Builds features end to end.",
	provider: "claude",
	model: "claude-opus-5-5",
	effort: "high",
	mode: null,
	createdAt: "2026-10-02T00:00:00.000Z",
	updatedAt: "2026-10-02T00:00:00.000Z",
	...over,
});

async function settle(): Promise<void> {
	for (let i = 0; i < 5; i++) await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("roles", () => {
	let dispose: (() => void) | undefined;
	afterEach(() => {
		dispose?.();
		document.body.replaceChildren();
	});

	function mount(view: () => ReturnType<typeof RoleMenu>): void {
		const host = document.createElement("div");
		document.body.append(host);
		dispose = render(view, host);
	}

	it("says what a role runs: agent, model and effort", () => {
		expect(describeRole(role(), providers)).toEqual({
			agent: "Claude Code",
			model: "Opus 5.5",
			effort: "High",
		});
		// A model that is gone falls back to the agent's first, with no effort to name.
		expect(describeRole(role({ model: "gone", effort: null }), providers)).toEqual({
			agent: "Claude Code",
			model: "Opus 5.5",
			effort: null,
		});
	});

	it("lists the team with the chosen one checked, and picks another", async () => {
		const onPick = vi.fn();
		mount(() => (
			<RoleMenu
				roles={[role(), role({ id: "r2", name: "Code reviewer", icon: "review" })]}
				providers={providers}
				usable={() => true}
				value="r1"
				onPick={onPick}
				onNew={() => {}}
				onEdit={() => {}}
			/>
		));
		const chip = document.querySelector<HTMLButtonElement>('button[aria-label="Role"]');
		expect(chip?.textContent).toContain("Engineer");
		chip?.click();
		await settle();
		const rows = [...document.querySelectorAll<HTMLButtonElement>('[role="radio"]')];
		expect(rows.map((row) => row.getAttribute("aria-checked"))).toEqual(["true", "false"]);
		expect(rows[0].textContent).toContain("Claude Code · Opus 5.5 · High");
		rows[1].click();
		expect(onPick).toHaveBeenCalledWith("r2");
	});

	it("makes a role from the dialog with the agent's model and effort", async () => {
		const onSave = vi.fn(async () => {});
		const [open, setOpen] = createSignal(false);
		mount(() => (
			<RoleDialog
				open={open()}
				target={null}
				agents={providers}
				onClose={() => setOpen(false)}
				onSave={onSave}
			/>
		));
		// jsdom has no showModal; the form renders all the same.
		HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
			this.setAttribute("open", "");
		};
		setOpen(true);
		await settle();
		const name = document.querySelector<HTMLInputElement>("dialog input");
		if (!name) throw new Error("no name field");
		name.value = "Design engineer";
		name.dispatchEvent(new InputEvent("input", { bubbles: true }));
		await settle();
		document.querySelector<HTMLButtonElement>('button[aria-label="Design"]')?.click();
		await settle();
		const submit = document.querySelector<HTMLButtonElement>('dialog button[type="submit"]');
		submit?.click();
		await settle();
		expect(onSave).toHaveBeenCalledWith({
			name: "Design engineer",
			icon: "design",
			brief: "",
			provider: "claude",
			model: null,
			effort: null,
			mode: null,
		});
	});
});
