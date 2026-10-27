import { afterEach, describe, expect, it } from "bun:test";

import type { ChatEvent } from "../agents/events";
import { RunnerProcess, threadIn } from "./runner-process";

/**
 * Chaos: the real runner, killed outright (`kill -9`) at the worst moments and started again on
 * the same database. Work in flight must be carried on or handed back to the person, once, and
 * nothing must be lost or done twice.
 */

const running: RunnerProcess[] = [];
afterEach(async () => {
	for (const runner of running.splice(0)) await runner.stop();
});

async function runner(
	env: Record<string, string> = {},
	before?: (runner: RunnerProcess) => void,
): Promise<RunnerProcess> {
	const made = new RunnerProcess(env);
	running.push(made);
	before?.(made);
	await made.start();
	return made;
}

/** Killed outright and started again; the database must come back whole. */
async function restart(grid: RunnerProcess): Promise<void> {
	await grid.crash();
	expect(grid.integrity()).toBe("ok");
	await grid.start();
}

const fromGrid = (events: ChatEvent[]) =>
	ofType(events, "user").filter((user) => user.origin?.kind === "grid");

const ofType = <T extends ChatEvent["type"]>(events: ChatEvent[], type: T) =>
	events.filter((event): event is Extract<ChatEvent, { type: T }> => event.type === type);
/** A turn is going on: started, and not ended (an agent's words are saved when its turn ends). */
const started = (events: ChatEvent[]) =>
	events.findLastIndex((event) => event.type === "turn_start") >
	events.findLastIndex((event) => event.type === "turn_end");
const said = (events: ChatEvent[]) =>
	ofType(events, "message")
		.map((event) => event.text)
		.join("");

describe("chaos: the runner killed and started again", () => {
	it("carries on a turn it was killed in, once", async () => {
		const grid = await runner();
		const thread = threadIn(await grid.tool("thread_start", { prompt: "SLOW:20000 build it" }));
		await grid.until(() => started(grid.events(thread)));
		await Bun.sleep(500);
		await grid.crash();
		await grid.start();
		await grid.until(() => said(grid.events(thread)).includes("carried on"));
		const events = grid.events(thread);
		const notices = ofType(events, "turn_end");
		expect(notices.some((end) => end.reason !== "done")).toBe(true);
		const carried = ofType(events, "user").filter((user) => user.origin?.kind === "grid");
		expect(carried).toHaveLength(1);
		expect(carried[0]?.origin).toEqual({ kind: "grid", reason: "restart" });
		// Started again with nothing in flight: nothing more is carried on.
		await grid.crash();
		await grid.start();
		await Bun.sleep(1500);
		expect(
			ofType(grid.events(thread), "user").filter((user) => user.origin?.kind === "grid"),
		).toHaveLength(1);
	}, 60_000);

	it("hands a turn that waited on an approval back to the person, and carries nothing on", async () => {
		const grid = await runner();
		const thread = threadIn(await grid.tool("thread_start", { prompt: "APPROVE then run it" }));
		await grid.until(() => ofType(grid.events(thread), "approval").length > 0);
		await restart(grid);
		await grid.until(() => ofType(grid.events(thread), "approval_resolved").length > 0);
		const events = grid.events(thread);
		expect(ofType(events, "approval_resolved")[0]?.optionId).toBeNull();
		expect(ofType(events, "turn_end").at(-1)?.error).toContain("waiting on your answer");
		await Bun.sleep(1500);
		expect(fromGrid(grid.events(thread))).toHaveLength(0);
		// The person carries on: the thread works again.
		await grid.tool("thread_send", { thread, message: "carry on please" });
		await grid.until(() => said(grid.events(thread)).includes("carry on please"));
	}, 60_000);

	it("keeps a message queued during the turn and sends it, once, after carrying on", async () => {
		const grid = await runner();
		const thread = threadIn(await grid.tool("thread_start", { prompt: "SLOW:20000 build it" }));
		await grid.until(() => started(grid.events(thread)));
		await grid.tool("thread_send", { thread, message: "QUEUED next step", delivery: "queue" });
		await Bun.sleep(300);
		await restart(grid);
		await grid.until(() => said(grid.events(thread)).includes("QUEUED next step"), 30_000);
		const sent = ofType(grid.events(thread), "user").filter(
			(user) => user.text === "QUEUED next step",
		);
		expect(sent).toHaveLength(1);
		expect(fromGrid(grid.events(thread))).toHaveLength(1);
	}, 60_000);

	it("stops carrying a turn on when the runner keeps crashing", async () => {
		const grid = await runner({ FAKE_CLAUDE_CONTINUE_MS: "30000" });
		const thread = threadIn(await grid.tool("thread_start", { prompt: "SLOW:30000 build it" }));
		await grid.until(() => started(grid.events(thread)));
		for (let carried = 1; carried <= 3; carried++) {
			await restart(grid);
			await grid.until(
				() => fromGrid(grid.events(thread)).length === carried && started(grid.events(thread)),
			);
		}
		await restart(grid);
		await grid.until(() => !started(grid.events(thread)));
		expect(fromGrid(grid.events(thread))).toHaveLength(3);
		expect(ofType(grid.events(thread), "turn_end").at(-1)?.error).toContain("kept stopping");
	}, 90_000);

	it("runs a webhook delivery once across a crash, and its run follows the thread carried on", async () => {
		let hook = { id: "", secret: "" };
		const grid = await runner({}, (made) => {
			hook = made.webhookAutomation("SLOW:20000 triage the alert");
		});
		const alert = { level: "error", title: "Checkout returns 500" };
		expect((await grid.deliver(hook, alert, "delivery-1")).status).toBe(202);
		await grid.until(() => Boolean(grid.runs(hook.id)[0]?.session_id));
		const thread = grid.runs(hook.id)[0]?.session_id ?? "";
		await grid.until(() => started(grid.events(thread)));
		await restart(grid);
		// Sent again (a service retrying after the crash): not run again.
		expect(await grid.deliver(hook, alert, "delivery-1")).toEqual({
			status: 200,
			message: "This delivery already ran",
		});
		expect(grid.runs(hook.id)).toHaveLength(1);
		// Not failed for the crash: it ends as the thread carried on does.
		await grid.until(() => grid.runs(hook.id)[0]?.status === "succeeded", 30_000);
		expect(grid.runs(hook.id)).toHaveLength(1);
		expect(said(grid.events(thread))).toContain("carried on");
	}, 60_000);

	it("keeps rate limits across a restart", async () => {
		let hook = { id: "", secret: "" };
		const grid = await runner({}, (made) => {
			hook = made.webhookAutomation("triage");
		});
		for (let n = 0; n < 30; n++)
			expect((await grid.deliver(hook, { level: "info" }, `info-${n}`)).status).toBe(202);
		expect((await grid.deliver(hook, { level: "info" }, "info-30")).status).toBe(429);
		await restart(grid);
		expect((await grid.deliver(hook, { level: "info" }, "info-31")).status).toBe(429);
	}, 60_000);
});
