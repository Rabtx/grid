import { render } from "@solidjs/web";
import { createSignal } from "solid-js";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ChatProvider } from "@/modules/chat/types/chat.types";

vi.mock("@/modules/auth", () => ({ useAuth: () => ({ token: () => "token" }) }));
vi.mock("@/modules/skills/services/skills.service", () => ({
	skillsService: {
		view: async () => ({
			skills: [{ id: "sk1", name: "Design system", description: "Tokens and components" }],
		}),
	},
}));
vi.mock("@/modules/connectors/services/connectors.service", () => ({
	connectorsService: {
		view: async () => ({
			connections: [
				{ id: "c1", name: "GitHub", enabled: true },
				{ id: "c2", name: "Figma", enabled: true },
			],
		}),
	},
}));

import { TeammateDialog } from "./teammate-dialog";

const providers = [
	{
		id: "claude",
		name: "Claude Code",
		available: true,
		modes: [],
		models: [{ id: "claude-opus-5-5", name: "Opus 5.5" }],
	},
] as unknown as ChatProvider[];

async function settle(): Promise<void> {
	for (let i = 0; i < 8; i++) await new Promise((resolve) => setTimeout(resolve, 0));
}
const button = (text: RegExp) =>
	[...document.querySelectorAll<HTMLButtonElement>("dialog button")].find((item) =>
		text.test(item.textContent || item.getAttribute("aria-label") || ""),
	);

describe("TeammateDialog", () => {
	let dispose = () => {};
	afterEach(() => {
		dispose();
		document.body.replaceChildren();
	});

	it("makes a teammate from a template, with its skills, chosen tools and board habits", async () => {
		HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
			this.setAttribute("open", "");
		};
		const onSave = vi.fn(async () => {});
		const [open, setOpen] = createSignal(false);
		const host = document.createElement("div");
		document.body.append(host);
		dispose = render(
			() => (
				<TeammateDialog
					open={open()}
					target={null}
					agents={providers}
					team={[]}
					onClose={() => setOpen(false)}
					onSave={onSave}
				/>
			),
			host,
		);
		setOpen(true);
		await settle();
		button(/^Frontend engineer$/)?.click();
		await settle();
		button(/^Design system$/)?.click();
		// Only GitHub, not every connector.
		document
			.querySelector<HTMLButtonElement>(
				'dialog button[role="switch"][aria-label="Every connector"]',
			)
			?.click();
		await settle();
		button(/^GitHub$/)?.click();
		document
			.querySelector<HTMLButtonElement>(
				'dialog button[role="switch"][aria-label="Start cards by itself"]',
			)
			?.click();
		await settle();
		document.querySelector<HTMLButtonElement>('dialog button[type="submit"]')?.click();
		await settle();
		expect(onSave).toHaveBeenCalledWith(
			expect.objectContaining({
				name: "Riley",
				icon: "design",
				specialty: "Frontend engineer",
				provider: "claude",
				skills: ["sk1"],
				connectors: ["c1"],
				autoStart: true,
				planFirst: true,
				parallel: 1,
				handoffTo: null,
			}),
		);
		expect((onSave.mock.calls[0] as unknown as [{ brief: string }])[0].brief).toContain(
			"design tokens",
		);
	});
});
