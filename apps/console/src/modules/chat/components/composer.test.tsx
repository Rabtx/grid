import { createRouter, memoryHistory } from "@solidjs/router";
import { render } from "@solidjs/web";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AuthProvider } from "@/modules/auth";
import { WorkspaceProvider } from "@/modules/projects";

import { GRID_COMMANDS, type SlashCommand } from "../lib/slash-commands";

import { Composer, type ComposerControl } from "./composer";

const projects = [{ slug: "alpha", name: "Alpha" }].map((project) => ({
	...project,
	summary: null,
	repoUrl: null,
	status: "active",
	createdAt: "2026-09-23T00:00:00.000Z",
	updatedAt: "2026-09-23T00:00:00.000Z",
}));

const mockFiles = ["src/app.ts", "src/components/composer.tsx", "src/index.ts", "README.md"];

function json(data: unknown, status = 200): Response {
	return new Response(JSON.stringify({ success: status < 400, statusCode: status, data }), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}

async function settle(): Promise<void> {
	for (let i = 0; i < 25; i++) await new Promise((resolve) => setTimeout(resolve, 10));
}

function typeInto(textarea: HTMLTextAreaElement, value: string, cursorPosition?: number): void {
	textarea.value = value;
	const pos = cursorPosition ?? value.length;
	textarea.setSelectionRange(pos, pos);
	textarea.dispatchEvent(new Event("input", { bubbles: true }));
	textarea.dispatchEvent(new Event("keyup", { bubbles: true }));
}

function pressKey(element: HTMLElement, key: string, extra: KeyboardEventInit = {}): void {
	element.dispatchEvent(
		new KeyboardEvent("keydown", {
			key,
			bubbles: true,
			cancelable: true,
			...extra,
		}),
	);
}

describe("Composer", () => {
	let container: HTMLElement;
	let dispose: () => void;
	let sentText: string | null;

	beforeEach(() => {
		sentText = null;
		vi.stubGlobal(
			"fetch",
			vi.fn(async (input: string | URL | Request) => {
				const url = input.toString();
				if (url.endsWith("/auth/refresh")) {
					return json({
						accessToken: "test-token",
						accessTokenExpiresAt: "2026-09-23T01:00:00.000Z",
						user: { id: "u1", email: "person@example.com", username: "person" },
					});
				}
				if (url.endsWith("/projects")) return json(projects);
				if (url.includes("/environments/placements")) return json({});
				if (url.includes("/projects/files/alpha/search")) {
					const parsed = new URL(url, "http://localhost");
					const q = (parsed.searchParams.get("q") ?? "").toLowerCase();
					const filtered = q ? mockFiles.filter((f) => f.toLowerCase().includes(q)) : mockFiles;
					return json(filtered);
				}
				return json(null, 404);
			}),
		);
	});

	afterEach(() => {
		dispose?.();
		container?.remove();
		vi.unstubAllGlobals();
	});

	function mount(
		onSend = vi.fn().mockImplementation((text: string) => {
			sentText = text;
			return true;
		}),
		control?: (control: ComposerControl) => void,
		slash?: {
			commands?: readonly SlashCommand[];
			onCommand?: (command: SlashCommand, argument: string) => boolean;
			running?: boolean;
		},
	): void {
		const Router = createRouter({
			routes: [
				{
					path: "/chat/:project",
					component: () => (
						<Composer
							project="alpha"
							running={slash?.running ?? false}
							onSend={onSend}
							control={control}
							commands={slash?.commands}
							onCommand={slash?.onCommand}
						/>
					),
				},
			],
			history: memoryHistory("/chat/alpha"),
		});

		container = document.createElement("div");
		document.body.append(container);
		dispose = render(
			() => (
				<AuthProvider>
					<Router>{(route) => <WorkspaceProvider>{route.children}</WorkspaceProvider>}</Router>
				</AuthProvider>
			),
			container,
		);
	}

	it("takes text from outside, ready to edit and send", async () => {
		let composer: ComposerControl | undefined;
		mount(undefined, (control) => {
			composer = control;
		});
		await settle();

		composer?.fill("Find and fix a bug in ");
		await settle();

		const textarea = container.querySelector<HTMLTextAreaElement>("textarea");
		expect(textarea?.value).toBe("Find and fix a bug in ");
		expect(document.activeElement).toBe(textarea);
		expect(container.querySelector<HTMLButtonElement>('[aria-label="Send"]')?.disabled).toBe(false);
	});

	it("opens the file mention popup when typing @", async () => {
		mount();
		await settle();

		const textarea = container.querySelector<HTMLTextAreaElement>("textarea");
		expect(textarea).not.toBeNull();
		if (!textarea) return;

		typeInto(textarea, "@");
		await settle();

		const popup = container.querySelector('[aria-label="File mentions"]');
		expect(popup).not.toBeNull();
		expect(container.textContent).toContain("app.ts");
		expect(container.textContent).toContain("composer.tsx");
	});

	it("filters the file list as user types query after @", async () => {
		mount();
		await settle();

		const textarea = container.querySelector<HTMLTextAreaElement>("textarea");
		if (!textarea) return;

		typeInto(textarea, "@comp");
		await settle();

		expect(container.textContent).toContain("composer.tsx");
		expect(container.textContent).not.toContain("README.md");
	});

	it("navigates options with ArrowDown / ArrowUp and selects with Enter", async () => {
		mount();
		await settle();

		const textarea = container.querySelector<HTMLTextAreaElement>("textarea");
		if (!textarea) return;

		typeInto(textarea, "@");
		await settle();

		const options = container.querySelectorAll('[aria-label="File mentions"] [role="option"]');
		expect(options.length).toBeGreaterThan(1);
		expect(options[0].getAttribute("aria-selected")).toBe("true");

		// Press ArrowDown
		pressKey(textarea, "ArrowDown");
		await settle();

		const afterDown = container.querySelectorAll('[aria-label="File mentions"] [role="option"]');
		expect(afterDown[1].getAttribute("aria-selected")).toBe("true");

		// Press Enter to select second option: src/components/composer.tsx
		pressKey(textarea, "Enter");
		await settle();

		// Popup closes
		expect(container.querySelector('[aria-label="File mentions"]')).toBeNull();
		// Selected mention token is inserted
		expect(textarea.value).toBe("@src/components/composer.tsx ");
	});

	it("selects with Tab key", async () => {
		mount();
		await settle();

		const textarea = container.querySelector<HTMLTextAreaElement>("textarea");
		if (!textarea) return;

		typeInto(textarea, "Please review @app");
		await settle();

		pressKey(textarea, "Tab");
		await settle();

		expect(container.querySelector('[aria-label="File mentions"]')).toBeNull();
		expect(textarea.value).toBe("Please review @src/app.ts ");
	});

	it("closes the popup when pressing Escape", async () => {
		mount();
		await settle();

		const textarea = container.querySelector<HTMLTextAreaElement>("textarea");
		if (!textarea) return;

		typeInto(textarea, "@");
		await settle();

		expect(container.querySelector('[aria-label="File mentions"]')).not.toBeNull();

		pressKey(textarea, "Escape");
		await settle();

		expect(container.querySelector('[aria-label="File mentions"]')).toBeNull();
		expect(textarea.value).toBe("@");
	});

	it("allows mouse/touch selection of an item from the popup", async () => {
		mount();
		await settle();

		const textarea = container.querySelector<HTMLTextAreaElement>("textarea");
		if (!textarea) return;

		typeInto(textarea, "Check @");
		await settle();

		const itemButton = [
			...container.querySelectorAll<HTMLElement>('[aria-label="File mentions"] [role="option"]'),
		].find((b) => b.textContent?.includes("README.md"));
		expect(itemButton).toBeDefined();

		itemButton?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
		await settle();

		expect(container.querySelector('[aria-label="File mentions"]')).toBeNull();
		expect(textarea.value).toBe("Check @README.md ");
	});

	it("opens the command list when typing / at the start", async () => {
		mount(undefined, undefined, { commands: GRID_COMMANDS, onCommand: () => true });
		await settle();

		const textarea = container.querySelector<HTMLTextAreaElement>("textarea");
		if (!textarea) return;

		typeInto(textarea, "/");
		await settle();

		expect(container.querySelector('[aria-label="Commands"]')).not.toBeNull();
		expect(container.textContent).toContain("/new");
		expect(container.textContent).toContain("/task");
	});

	it("filters the commands as the query is typed", async () => {
		mount(undefined, undefined, { commands: GRID_COMMANDS, onCommand: () => true });
		await settle();

		const textarea = container.querySelector<HTMLTextAreaElement>("textarea");
		if (!textarea) return;

		typeInto(textarea, "/tas");
		await settle();

		expect(container.textContent).toContain("Commands · 1");
		expect(container.textContent).toContain("/task");
		expect(container.textContent).not.toContain("/new");
	});

	it("runs a command picked with Enter and clears the field", async () => {
		const onCommand = vi.fn().mockReturnValue(true);
		mount(undefined, undefined, { commands: GRID_COMMANDS, onCommand });
		await settle();

		const textarea = container.querySelector<HTMLTextAreaElement>("textarea");
		if (!textarea) return;

		typeInto(textarea, "/new");
		await settle();
		pressKey(textarea, "Enter");
		await settle();

		expect(onCommand).toHaveBeenCalledWith(
			GRID_COMMANDS.find((command) => command.name === "new"),
			"",
		);
		expect(container.querySelector('[aria-label="Commands"]')).toBeNull();
		expect(textarea.value).toBe("");
	});

	it("writes out a command that needs an argument, cursor after it", async () => {
		mount(undefined, undefined, { commands: GRID_COMMANDS, onCommand: () => true });
		await settle();

		const textarea = container.querySelector<HTMLTextAreaElement>("textarea");
		if (!textarea) return;

		typeInto(textarea, "/ta");
		await settle();
		pressKey(textarea, "Enter");
		await settle();

		expect(textarea.value).toBe("/task ");
		expect(textarea.selectionStart).toBe(6);
	});

	it("closes the command list with Escape", async () => {
		mount(undefined, undefined, { commands: GRID_COMMANDS, onCommand: () => true });
		await settle();

		const textarea = container.querySelector<HTMLTextAreaElement>("textarea");
		if (!textarea) return;

		typeInto(textarea, "/");
		await settle();
		expect(container.querySelector('[aria-label="Commands"]')).not.toBeNull();

		pressKey(textarea, "Escape");
		await settle();

		expect(container.querySelector('[aria-label="Commands"]')).toBeNull();
		expect(textarea.value).toBe("/");
	});

	it("runs a typed Grid command instead of sending it to the agent", async () => {
		const onSend = vi.fn().mockReturnValue(true);
		const onCommand = vi.fn().mockReturnValue(true);
		mount(onSend, undefined, { commands: GRID_COMMANDS, onCommand });
		await settle();

		const textarea = container.querySelector<HTMLTextAreaElement>("textarea");
		if (!textarea) return;

		typeInto(textarea, "/task buy milk");
		await settle();
		container
			.querySelector("form")
			?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
		await settle();

		expect(onCommand).toHaveBeenCalledWith(
			GRID_COMMANDS.find((command) => command.name === "task"),
			"buy milk",
		);
		expect(onSend).not.toHaveBeenCalled();
		expect(textarea.value).toBe("");
	});

	it("runs a typed Grid command while the agent's turn is running", async () => {
		const onSend = vi.fn().mockReturnValue(true);
		const onCommand = vi.fn().mockReturnValue(true);
		mount(onSend, undefined, { commands: GRID_COMMANDS, onCommand, running: true });
		await settle();

		const textarea = container.querySelector<HTMLTextAreaElement>("textarea");
		if (!textarea) return;

		typeInto(textarea, "/note check the logs");
		await settle();
		container
			.querySelector("form")
			?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
		await settle();

		expect(onCommand).toHaveBeenCalledWith(
			GRID_COMMANDS.find((command) => command.name === "note"),
			"check the logs",
		);
		expect(textarea.value).toBe("");

		// A message for the agent still waits for the turn to end.
		typeInto(textarea, "and then this");
		await settle();
		container
			.querySelector("form")
			?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
		await settle();
		expect(onSend).not.toHaveBeenCalled();
		expect(textarea.value).toBe("and then this");
	});

	it("sends words after a command that takes none to the agent as typed", async () => {
		const onSend = vi.fn().mockReturnValue(true);
		const onCommand = vi.fn().mockReturnValue(true);
		mount(onSend, undefined, { commands: GRID_COMMANDS, onCommand });
		await settle();

		const textarea = container.querySelector<HTMLTextAreaElement>("textarea");
		if (!textarea) return;

		typeInto(textarea, "/new landing page ideas");
		await settle();
		container
			.querySelector("form")
			?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
		await settle();

		expect(onCommand).not.toHaveBeenCalled();
		expect(onSend).toHaveBeenCalledWith("/new landing page ideas", []);
	});

	it("answers a Grid command that is not listed here instead of sending it", async () => {
		const onSend = vi.fn().mockReturnValue(true);
		const onCommand = vi.fn().mockReturnValue(false);
		const idle = GRID_COMMANDS.filter((command) => command.name !== "stop");
		mount(onSend, undefined, { commands: idle, onCommand });
		await settle();

		const textarea = container.querySelector<HTMLTextAreaElement>("textarea");
		if (!textarea) return;

		typeInto(textarea, "/stop");
		await settle();
		container
			.querySelector("form")
			?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
		await settle();

		expect(onCommand).toHaveBeenCalledWith(
			GRID_COMMANDS.find((command) => command.name === "stop"),
			"",
		);
		expect(onSend).not.toHaveBeenCalled();
		expect(textarea.value).toBe("/stop");
	});

	it("leaves the keyboard with the picker /model opened", async () => {
		const picker = document.createElement("button");
		const onCommand = vi.fn(() => {
			// What the picker does: take the focus.
			document.body.append(picker);
			picker.focus();
			return true;
		});
		mount(undefined, undefined, { commands: GRID_COMMANDS, onCommand });
		await settle();

		const textarea = container.querySelector<HTMLTextAreaElement>("textarea");
		if (!textarea) return;

		textarea.focus();
		typeInto(textarea, "/model");
		await settle();
		pressKey(textarea, "Enter");
		await settle();

		expect(onCommand).toHaveBeenCalled();
		expect(textarea.value).toBe("");
		expect(document.activeElement).toBe(picker);
		picker.remove();
	});

	it("leaves Enter to an input method that is composing", async () => {
		const onCommand = vi.fn().mockReturnValue(true);
		mount(undefined, undefined, { commands: GRID_COMMANDS, onCommand });
		await settle();

		const textarea = container.querySelector<HTMLTextAreaElement>("textarea");
		if (!textarea) return;

		typeInto(textarea, "/new");
		await settle();
		pressKey(textarea, "Enter", { isComposing: true });
		await settle();

		expect(onCommand).not.toHaveBeenCalled();
		expect(container.querySelector('[aria-label="Commands"]')).not.toBeNull();
	});

	it("points the field at the open list and its picked command", async () => {
		mount(undefined, undefined, { commands: GRID_COMMANDS, onCommand: () => true });
		await settle();

		const textarea = container.querySelector<HTMLTextAreaElement>("textarea");
		if (!textarea) return;
		expect(textarea.getAttribute("aria-controls")).toBeNull();

		typeInto(textarea, "/");
		await settle();

		const list = container.querySelector('[role="listbox"]');
		expect(list).not.toBeNull();
		expect(textarea.getAttribute("aria-controls")).toBe(list?.id);
		const active = textarea.getAttribute("aria-activedescendant");
		expect(active && document.getElementById(active)?.getAttribute("aria-selected")).toBe("true");

		pressKey(textarea, "ArrowDown");
		await settle();
		expect(textarea.getAttribute("aria-activedescendant")).toBe(`${list?.id}-1`);
	});

	it("writes an agent's own command out and sends it as typed", async () => {
		const onSend = vi.fn().mockReturnValue(true);
		const onCommand = vi.fn().mockReturnValue(true);
		const agent: SlashCommand = {
			id: "claude:compact",
			name: "compact",
			description: "Summarise the conversation",
			group: "Claude",
			kind: "agent",
		};
		mount(onSend, undefined, { commands: [...GRID_COMMANDS, agent], onCommand });
		await settle();

		const textarea = container.querySelector<HTMLTextAreaElement>("textarea");
		if (!textarea) return;

		typeInto(textarea, "/compact");
		await settle();
		pressKey(textarea, "Enter");
		await settle();
		expect(textarea.value).toBe("/compact ");

		container
			.querySelector("form")
			?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
		await settle();

		expect(onCommand).not.toHaveBeenCalled();
		expect(onSend).toHaveBeenCalledWith("/compact", []);
	});

	it("sends plain text containing the mention tokens to the agent", async () => {
		const onSend = vi.fn().mockImplementation((text: string) => {
			sentText = text;
			return true;
		});
		mount(onSend);
		await settle();

		const textarea = container.querySelector<HTMLTextAreaElement>("textarea");
		if (!textarea) return;

		typeInto(textarea, "@app");
		await settle();

		pressKey(textarea, "Enter");
		await settle();

		expect(textarea.value).toBe("@src/app.ts ");

		// Submit the form
		const form = container.querySelector("form");
		form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
		await settle();

		expect(onSend).toHaveBeenCalledWith("@src/app.ts", []);
		expect(sentText).toBe("@src/app.ts");
	});
	function attach(files: File[], type = "change"): void {
		const event = new Event(type, { bubbles: true, cancelable: true });
		if (type === "change") {
			const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;
			Object.defineProperty(input, "files", { value: files, configurable: true });
			input.dispatchEvent(event);
		} else {
			Object.defineProperty(event, type === "paste" ? "clipboardData" : "dataTransfer", {
				value: { files, types: ["Files"] },
			});
			container.querySelector(type === "paste" ? "textarea" : "form")!.dispatchEvent(event);
		}
	}

	it("picks, pastes and removes attachments, retains them on failure, then clears on send", async () => {
		const send = vi.fn().mockResolvedValue(false);
		mount(send);
		await settle();
		const text = new File(["read me"], "notes.txt", { type: "text/plain" });
		const image = new File(["png"], "shot.png", { type: "image/png" });
		attach([text]);
		attach([image], "paste");
		await settle();
		expect(container.querySelector('img[alt="shot.png"]')).not.toBeNull();
		expect(container.textContent).toContain("notes.txt");
		container.querySelector<HTMLButtonElement>('[aria-label="Remove notes.txt"]')!.click();
		await settle();
		container.querySelector<HTMLButtonElement>('[aria-label="Send"]')!.click();
		await settle();
		expect(send).toHaveBeenLastCalledWith("", [image]);
		expect(container.querySelector('img[alt="shot.png"]')).not.toBeNull();
		send.mockResolvedValue(true);
		container.querySelector<HTMLButtonElement>('[aria-label="Send"]')!.click();
		await settle();
		expect(container.querySelector('img[alt="shot.png"]')).toBeNull();
		expect(container.querySelector<HTMLButtonElement>('[aria-label="Send"]')!.disabled).toBe(true);
	});

	it("drops twenty files and rejects excess count and size without losing the draft", async () => {
		mount();
		await settle();
		const files = Array.from({ length: 20 }, (_, index) => new File(["ok"], `${index}.txt`));
		attach(files, "drop");
		await settle();
		expect(container.querySelectorAll('[aria-label^="Remove "]').length).toBe(20);
		attach([new File(["extra"], "extra.txt")], "drop");
		await settle();
		expect(container.textContent).toContain("up to 20");
		container.querySelector<HTMLButtonElement>('[aria-label="Remove 0.txt"]')!.click();
		await settle();
		attach([new File([new Uint8Array(10 * 1024 * 1024 + 1)], "large.txt")]);
		await settle();
		expect(container.textContent).toContain("10 MB");
		expect(container.querySelectorAll('[aria-label^="Remove "]').length).toBe(19);
	});
});
