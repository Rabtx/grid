import { render } from "@solidjs/web";
import { flush } from "solid-js";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CrewPanel, QuestionCard } from "./agent-work";
import { framedDocument, InlineVisual } from "./visual";

let dispose: (() => void) | undefined;
afterEach(() => {
	dispose?.();
	document.body.replaceChildren();
});

function mount(view: () => ReturnType<typeof QuestionCard>): HTMLElement {
	const root = document.createElement("div");
	document.body.append(root);
	dispose = render(view, root);
	return root;
}

describe("QuestionCard", () => {
	const questions = [
		{
			id: "db",
			header: "Database",
			question: "Which one?",
			options: [{ label: "Postgres" }, { label: "SQLite" }],
		},
	];

	it("answers with the option picked, or one's own words", () => {
		const onAnswer = vi.fn();
		const root = mount(() => <QuestionCard questions={questions} onAnswer={onAnswer} />);
		const answer = [...root.querySelectorAll("button")].find(
			(button) => button.textContent === "Answer",
		);
		expect(answer?.disabled).toBe(true);
		[...root.querySelectorAll("button")].find((button) => button.textContent === "SQLite")?.click();
		flush();
		expect(answer?.disabled).toBe(false);
		answer?.click();
		expect(onAnswer).toHaveBeenCalledWith({ db: ["SQLite"] });

		const own = root.querySelector<HTMLInputElement>("input");
		if (!own) throw new Error("no answer field");
		own.value = "DuckDB";
		own.dispatchEvent(new Event("input", { bubbles: true }));
		flush();
		answer?.click();
		expect(onAnswer).toHaveBeenLastCalledWith({ db: ["SQLite", "DuckDB"] });
	});

	it("shows what was answered once it has been", () => {
		const root = mount(() => <QuestionCard questions={questions} answers={{ db: ["Postgres"] }} />);
		expect(root.textContent).toContain("Postgres");
		expect(root.querySelector("input")).toBeNull();
	});
});

describe("InlineVisual", () => {
	it("draws each block and sends a choice as the next message", () => {
		const onChoose = vi.fn();
		const root = mount(() => (
			<InlineVisual
				title="Plan"
				markdown={(text) => <p>{text}</p>}
				onChoose={onChoose}
				blocks={[
					{ type: "stats", items: [{ label: "Tests", value: "128" }] },
					{
						type: "table",
						columns: [{ label: "Name" }, { label: "Share", format: "percent" }],
						rows: [["web", 40]],
					},
					{
						type: "calculator",
						inputs: [{ id: "seats", label: "Seats", value: 3 }],
						outputs: [{ label: "Yearly", formula: "seats * 12 * 10", prefix: "$" }],
					},
					{ type: "choices", options: [{ label: "Ship it", message: "Open the pull request" }] },
				]}
			/>
		));
		expect(root.textContent).toContain("128");
		expect(root.textContent).toContain("40%");
		expect(root.textContent).toContain("$360");
		[...root.querySelectorAll("button")]
			.find((button) => button.textContent?.includes("Ship it"))
			?.click();
		expect(onChoose).toHaveBeenCalledWith("Open the pull request");
	});

	it("puts a page behind a policy that blocks the network", () => {
		const page = framedDocument("<p>hi</p>", "");
		expect(page).toContain("default-src 'none'");
		expect(page.indexOf("Content-Security-Policy")).toBeLessThan(page.indexOf("<p>hi</p>"));
	});
});

describe("CrewPanel", () => {
	it("lists the members needing the person first, with Retry and Stop", () => {
		const onRetry = vi.fn();
		const onStop = vi.fn();
		const root = mount(() => (
			<CrewPanel
				name="Launch"
				parallel={2}
				paused={false}
				members={[
					{
						id: "a",
						key: "api",
						title: "API routes",
						state: "working",
						running: true,
						waiting: false,
					},
					{
						id: "b",
						key: "docs",
						title: "Docs",
						state: "needs_you",
						running: false,
						waiting: false,
					},
				]}
				onRetry={onRetry}
				onStop={onStop}
				onPause={() => undefined}
				onSettings={() => undefined}
			/>
		));
		expect(root.textContent).toContain("1 of 2 working");
		expect(root.textContent).toContain("1 needs you");
		const rows = [...root.querySelectorAll("li")].map((row) => row.textContent ?? "");
		expect(rows[0]).toContain("Docs");
		[...root.querySelectorAll("button")].find((button) => button.textContent === "Retry")?.click();
		expect(onRetry).toHaveBeenCalledWith("b");
		[...root.querySelectorAll("button")].find((button) => button.textContent === "Stop")?.click();
		expect(onStop).toHaveBeenCalledWith("a");
	});
});
