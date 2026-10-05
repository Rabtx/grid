import { createRouter, memoryHistory } from "@solidjs/router";
import { render } from "@solidjs/web";
import { createSignal, flush } from "solid-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RunnerError } from "@/lib/runner-client";
import { ShellProvider } from "@/modules/shell";
import { operateService } from "../services/operate.service";
import type { LogTail, OperateCostsOverview } from "../types/operate.types";
import { OperateScreen } from "./operate-screen";
const identity = vi.hoisted(() => ({ token: (): string => "token", placement: (): string => "" }));
vi.mock("@/modules/auth", () => ({ useAuth: () => identity }));
vi.mock("@/modules/environments", () => ({
	placementsStore: { placements: () => identity.placement(), scopeOf: () => identity.placement() },
}));
vi.mock("../services/operate.service", () => ({
	operateService: {
		overview: vi.fn(),
		save: vi.fn(),
		remove: vi.fn(),
		logs: vi.fn(),
		tail: vi.fn(),
		saveLog: vi.fn(),
		removeLog: vi.fn(),
		costs: vi.fn(),
		recordCharge: vi.fn(),
		removeCharge: vi.fn(),
	},
}));
async function settle() {
	for (let i = 0; i < 10; i++) {
		await Promise.resolve();
		flush();
	}
}
const reading = (): LogTail => ({
	name: "Application",
	path: "logs/app.log",
	text: "<script>unsafe()</script>\nreal output",
	readAt: new Date().toISOString(),
	truncated: true,
	bytes: 123,
	lines: 2,
});
const summary = (): OperateCostsOverview => ({
	project: "grid",
	allowed: true,
	currency: "USD",
	agents: {
		costUsd: 0,
		reportedSessions: 1,
		totalSessions: 3,
		providers: [
			{ provider: "Reported", costUsd: 0, reportedSessions: 1, totalSessions: 1 },
			{ provider: "Missing", costUsd: null, reportedSessions: 0, totalSessions: 2 },
		],
	},
	hosting: { totalCents: null, charges: [] },
});
describe("Operate logs and costs", () => {
	let container: HTMLElement;
	let dispose: () => void;
	let changeToken: (value: string) => void;
	let changePlacement: (value: string) => void;
	beforeEach(() => {
		const [token, setToken] = createSignal("token");
		identity.token = token;
		changeToken = setToken;
		const [placement, setPlacement] = createSignal("");
		identity.placement = placement;
		changePlacement = setPlacement;
		vi.mocked(operateService.overview).mockResolvedValue({
			project: "grid",
			intervalSeconds: 60,
			allowed: true,
			checkedAt: null,
			services: [],
			incidents: [],
		});
		vi.mocked(operateService.logs).mockResolvedValue({
			project: "grid",
			allowed: true,
			sources: [{ name: "Application", path: "logs/app.log" }],
		});
		vi.mocked(operateService.tail).mockResolvedValue(reading());
		vi.mocked(operateService.costs).mockResolvedValue(summary());
		container = document.createElement("div");
		document.body.append(container);
	});
	afterEach(() => {
		dispose?.();
		container.remove();
		vi.useRealTimers();
		vi.resetAllMocks();
	});
	function mount() {
		const Router = createRouter({
			routes: [{ path: "/operate/:slug", component: OperateScreen }],
			history: memoryHistory("/operate/grid"),
		});
		dispose = render(
			() => <Router>{(route) => <ShellProvider>{route.children}</ShellProvider>}</Router>,
			container,
		);
	}
	function click(text: string, root: ParentNode = container) {
		const button = [...root.querySelectorAll<HTMLButtonElement>("button")].find(
			(button) => button.textContent?.trim() === text,
		);
		expect(button, text).toBeTruthy();
		button!.click();
	}
	function input(label: string, value: string) {
		const field = [...container.querySelectorAll<HTMLLabelElement>("label")].find(
			(el) => el.textContent === label,
		);
		expect(field, label).toBeTruthy();
		const element = container.querySelector<HTMLInputElement>(`#${field!.htmlFor}`)!;
		element.value = value;
		element.dispatchEvent(new Event("input", { bubbles: true }));
	}
	it("reads only the active tab, safely renders the tail and stops polling on leave", async () => {
		vi.useFakeTimers();
		mount();
		await settle();
		expect(operateService.logs).not.toHaveBeenCalled();
		expect(operateService.costs).not.toHaveBeenCalled();
		click("Logs");
		await settle();
		expect(container.textContent).toContain("real output");
		expect(container.querySelector("script")).toBeNull();
		expect(container.textContent).toContain("latest bounded tail");
		await vi.advanceTimersByTimeAsync(15000);
		await settle();
		expect(operateService.tail).toHaveBeenCalledTimes(2);
		click("Costs");
		await settle();
		await vi.advanceTimersByTimeAsync(30000);
		expect(operateService.tail).toHaveBeenCalledTimes(2);
		expect(operateService.costs).toHaveBeenCalledTimes(1);
	});
	it("shows production permission refusal without source actions", async () => {
		vi.mocked(operateService.logs).mockRejectedValue(new RunnerError("Denied", 403));
		mount();
		await settle();
		click("Logs");
		await settle();
		expect(container.textContent).toContain("Production permission required");
		expect(container.textContent).not.toContain("Add log source");
		expect(operateService.tail).not.toHaveBeenCalled();
	});
	it("shows empty and missing files and clears a previously readable tail on failure", async () => {
		mount();
		await settle();
		click("Logs");
		await settle();
		expect(container.textContent).toContain("real output");
		vi.mocked(operateService.tail).mockRejectedValue(new RunnerError("Log file is missing", 404));
		container.querySelector<HTMLButtonElement>('button[aria-label="Refresh logs"]')!.click();
		await settle();
		expect(container.textContent).toContain("Log file is missing");
		expect(container.textContent).not.toContain("real output");
		vi.mocked(operateService.tail).mockResolvedValue({
			...reading(),
			text: "",
			bytes: 0,
			truncated: false,
			lines: 0,
		});
		click("Try again");
		await settle();
		expect(container.textContent).toContain("This log file is empty.");
	});
	it("rejects late tails after an account or placement change", async () => {
		let answer!: (value: LogTail) => void;
		vi.mocked(operateService.tail).mockImplementationOnce(
			() =>
				new Promise((resolve) => {
					answer = resolve;
				}),
		);
		mount();
		await settle();
		click("Logs");
		await settle();
		changeToken("other");
		changePlacement("/env/remote");
		await settle();
		answer({ ...reading(), text: "OLD SECRET" });
		await settle();
		expect(container.textContent).not.toContain("OLD SECRET");
		expect(operateService.tail).toHaveBeenLastCalledWith("other", "grid", "Application");
	});
	it("adds a log source, exposes mutation failure and removes only after confirmation", async () => {
		mount();
		await settle();
		click("Logs");
		await settle();
		click("Add log source");
		await settle();
		input("Source name", "Worker");
		input("Project-relative log path", "logs/worker.log");
		await settle();
		vi.mocked(operateService.saveLog).mockRejectedValueOnce(new Error("Source file is missing"));
		click("Save log source");
		await settle();
		expect(container.textContent).toContain("Source file is missing");
		expect(container.querySelector("dialog[open]")).toBeTruthy();
		vi.mocked(operateService.saveLog).mockResolvedValue();
		click("Save log source");
		await settle();
		expect(operateService.saveLog).toHaveBeenLastCalledWith(
			"token",
			"grid",
			"Worker",
			"logs/worker.log",
		);
		container
			.querySelector<HTMLButtonElement>('button[aria-label="Remove log source Application"]')!
			.click();
		await settle();
		expect(operateService.removeLog).not.toHaveBeenCalled();
		click("Remove source");
		await settle();
		expect(operateService.removeLog).toHaveBeenCalledWith("token", "grid", "Application");
	});
	it("distinguishes reported zero from missing provider and hosting data", async () => {
		mount();
		await settle();
		click("Costs");
		await settle();
		expect(container.textContent).toContain("$0.00");
		expect(container.textContent).toContain("Unknown");
		expect(container.textContent).toContain("1 / 3");
		expect(container.textContent).toContain("not a provider invoice");
		expect(container.textContent).toContain("No hosting charges recorded");
	});
	it("withholds hosting mutations from members and clears stale totals on failed refresh", async () => {
		const view = summary();
		view.allowed = false;
		view.agents.costUsd = 12.34;
		vi.mocked(operateService.costs).mockResolvedValue(view);
		mount();
		await settle();
		click("Costs");
		await settle();
		expect(container.textContent).not.toContain("Record hosting charge");
		expect(container.textContent).toContain("$12.34");
		vi.mocked(operateService.costs).mockRejectedValue(new Error("Costs unavailable"));
		container.querySelector<HTMLButtonElement>('button[aria-label="Refresh costs"]')!.click();
		await settle();
		expect(container.textContent).toContain("Costs unavailable");
		expect(container.textContent).not.toContain("$12.34");
	});
	it("records exact cents and keeps validation and mutation failures reviewable", async () => {
		mount();
		await settle();
		click("Costs");
		await settle();
		click("Record hosting charge");
		await settle();
		input("Service", "API");
		input("Hosting provider", "Host");
		input("Amount (USD)", "0.291");
		input("Charge date", "2026-10-06");
		await settle();
		expect(
			[...container.querySelectorAll<HTMLButtonElement>("dialog button")].find(
				(button) => button.textContent === "Record charge",
			)!.disabled,
		).toBe(true);
		input("Amount (USD)", "0.29");
		await settle();
		vi.mocked(operateService.recordCharge).mockRejectedValueOnce(new Error("Charge limit reached"));
		click("Record charge");
		await settle();
		expect(container.textContent).toContain("Charge limit reached");
		expect(operateService.recordCharge).toHaveBeenCalledWith("token", "grid", {
			service: "API",
			provider: "Host",
			amountCents: 29,
			date: "2026-10-06",
		});
		vi.mocked(operateService.recordCharge).mockResolvedValue({
			id: "new",
			createdAt: new Date().toISOString(),
			service: "API",
			provider: "Host",
			amountCents: 29,
			date: "2026-10-06",
		});
		click("Record charge");
		await settle();
		expect(container.querySelector("dialog[open]")).toBeNull();
	});
	it("deletes a recorded charge only after confirmation", async () => {
		const view = summary();
		view.hosting = {
			totalCents: 0,
			charges: [
				{
					id: "charge",
					service: "API",
					provider: "Host",
					amountCents: 0,
					date: "2026-10-06",
					createdAt: new Date().toISOString(),
				},
			],
		};
		vi.mocked(operateService.costs).mockResolvedValue(view);
		mount();
		await settle();
		click("Costs");
		await settle();
		container
			.querySelector<HTMLButtonElement>(
				'button[aria-label="Delete hosting charge API 2026-10-06"]',
			)!
			.click();
		await settle();
		expect(operateService.removeCharge).not.toHaveBeenCalled();
		click("Delete charge");
		await settle();
		expect(operateService.removeCharge).toHaveBeenCalledWith("token", "grid", "charge");
	});
	it("discards costs arriving from a previous account", async () => {
		let answer!: (value: OperateCostsOverview) => void;
		vi.mocked(operateService.costs).mockImplementationOnce(
			() =>
				new Promise((resolve) => {
					answer = resolve;
				}),
		);
		mount();
		await settle();
		click("Costs");
		await settle();
		changeToken("other");
		await settle();
		const old = summary();
		old.agents.providers[0]!.provider = "PRIVATE OLD PROVIDER";
		answer(old);
		await settle();
		expect(container.textContent).not.toContain("PRIVATE OLD PROVIDER");
	});
	it("does not poll when no sources exist", async () => {
		vi.useFakeTimers();
		vi.mocked(operateService.logs).mockResolvedValue({
			project: "grid",
			allowed: true,
			sources: [],
		});
		mount();
		await settle();
		click("Logs");
		await settle();
		expect(container.textContent).toContain("No log sources");
		await vi.advanceTimersByTimeAsync(45000);
		expect(operateService.tail).not.toHaveBeenCalled();
	});
	it("invalidates a tail when the configured path changes under the same source name", async () => {
		let answer!: (value: LogTail) => void;
		vi.mocked(operateService.tail).mockImplementationOnce(
			() =>
				new Promise((resolve) => {
					answer = resolve;
				}),
		);
		mount();
		await settle();
		click("Logs");
		await settle();
		vi.mocked(operateService.logs).mockResolvedValue({
			project: "grid",
			allowed: true,
			sources: [{ name: "Application", path: "logs/new.log" }],
		});
		vi.mocked(operateService.tail).mockResolvedValue({
			...reading(),
			path: "logs/new.log",
			text: "NEW FILE",
		});
		container.querySelector<HTMLButtonElement>('button[aria-label="Refresh logs"]')!.click();
		await settle();
		answer({ ...reading(), text: "OLD FILE" });
		await settle();
		expect(container.textContent).toContain("logs/new.log");
		expect(container.textContent).toContain("NEW FILE");
		expect(container.textContent).not.toContain("OLD FILE");
	});
	it("does not leak late mutation errors after account changes", async () => {
		let reject!: (cause: Error) => void;
		vi.mocked(operateService.recordCharge).mockImplementationOnce(
			() =>
				new Promise((_, fail) => {
					reject = fail;
				}),
		);
		mount();
		await settle();
		click("Costs");
		await settle();
		click("Record hosting charge");
		await settle();
		input("Service", "PRIVATE SERVICE");
		input("Hosting provider", "Host");
		input("Amount (USD)", "1.00");
		input("Charge date", "2026-10-06");
		await settle();
		click("Record charge");
		await settle();
		changeToken("other");
		await settle();
		reject(new Error("PRIVATE ERROR"));
		await settle();
		expect(container.textContent).not.toContain("PRIVATE ERROR");
		expect(container.textContent).not.toContain("PRIVATE SERVICE");
		expect(container.querySelector("dialog[open]")).toBeNull();
	});
	it("polls only the selected source and ignores the previous source's late tail", async () => {
		vi.useFakeTimers();
		let answer!: (value: LogTail) => void;
		vi.mocked(operateService.logs).mockResolvedValue({
			project: "grid",
			allowed: true,
			sources: [
				{ name: "Application", path: "logs/app.log" },
				{ name: "Worker", path: "logs/worker.log" },
			],
		});
		vi.mocked(operateService.tail)
			.mockImplementationOnce(
				() =>
					new Promise((resolve) => {
						answer = resolve;
					}),
			)
			.mockResolvedValue({
				...reading(),
				name: "Worker",
				path: "logs/worker.log",
				text: "WORKER OUTPUT",
			});
		mount();
		await settle();
		click("Logs");
		await settle();
		click("Application");
		await settle();
		[...document.body.querySelectorAll<HTMLButtonElement>("button")]
			.find(
				(button) =>
					button.textContent?.includes("Worker") && button.textContent?.includes("logs/worker.log"),
			)!
			.click();
		await settle();
		answer({ ...reading(), text: "OLD APPLICATION" });
		await settle();
		expect(container.textContent).toContain("WORKER OUTPUT");
		expect(container.textContent).not.toContain("OLD APPLICATION");
		await vi.advanceTimersByTimeAsync(15000);
		expect(operateService.tail).toHaveBeenLastCalledWith("token", "grid", "Worker");
	});
	it("distinguishes a truncated long line from an empty file", async () => {
		vi.mocked(operateService.tail).mockResolvedValue({
			...reading(),
			text: "",
			truncated: true,
			bytes: 65536,
			lines: 0,
		});
		mount();
		await settle();
		click("Logs");
		await settle();
		expect(container.textContent).toContain("No complete lines in the bounded tail.");
		expect(container.textContent).not.toContain("This log file is empty.");
	});
	it("does not close a newer form after the account switches away and back", async () => {
		let answer!: () => void;
		vi.mocked(operateService.saveLog).mockImplementationOnce(
			() =>
				new Promise((resolve) => {
					answer = resolve;
				}),
		);
		mount();
		await settle();
		click("Logs");
		await settle();
		click("Add log source");
		await settle();
		input("Source name", "Old save");
		input("Project-relative log path", "logs/old.log");
		await settle();
		click("Save log source");
		await settle();
		changeToken("other");
		await settle();
		changeToken("token");
		await settle();
		click("Add log source");
		await settle();
		input("Source name", "New unsaved source");
		await settle();
		answer();
		await settle();
		expect(container.querySelector("dialog[open]")).toBeTruthy();
		expect(
			[...container.querySelectorAll<HTMLInputElement>("dialog input")].some(
				(field) => field.value === "New unsaved source",
			),
		).toBe(true);
	});
});
