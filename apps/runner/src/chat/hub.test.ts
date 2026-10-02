import { afterAll, describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { Provider, TurnResult } from "../agents/provider";
import { ChatError, ChatHub } from "./hub";
import { ChatStore } from "./store";

const root = mkdtempSync(join(tmpdir(), "grid-hub-"));
mkdirSync(join(root, "shop"));
afterAll(() => rmSync(root, { recursive: true, force: true }));

function fakeProvider(): { provider: Provider; asked: () => number } {
	let asked = 0;
	const provider: Provider = {
		info: () => ({ id: "fake", name: "Fake", available: true, models: [], modes: [] }),
		catalog: async () => {
			asked++;
			return { models: [{ id: `m${asked}`, name: `Model ${asked}` }] };
		},
		start: async () => {
			throw new Error("not used");
		},
	};
	return { provider, asked: () => asked };
}

describe("ChatHub providers", () => {
	it("asks an agent for its models once, keeps them, and asks again on refresh", async () => {
		const { provider, asked } = fakeProvider();
		const hub = new ChatHub(new ChatStore(":memory:"), new Map([["fake", provider]]), root);

		const first = await hub.providerList("u1");
		const second = await hub.providerList("u1");
		expect(asked()).toBe(1);
		expect(second[0].models.map((model) => model.id)).toEqual(["m1"]);
		expect(first[0].refreshedAt).not.toBeNull();

		const fresh = await hub.refreshProvider("u1", "fake");
		expect(asked()).toBe(2);
		expect(fresh.models.map((model) => model.id)).toEqual(["m2"]);
		expect((await hub.providerList("u1"))[0].models[0].id).toBe("m2");
	});

	it("keeps each person's settings per agent", async () => {
		const { provider } = fakeProvider();
		const hub = new ChatHub(new ChatStore(":memory:"), new Map([["fake", provider]]), root);
		hub.setProviderSettings("u1", "fake", { enabled: false, model: "m1" });
		expect((await hub.providerList("u1"))[0].settings).toEqual({ enabled: false, model: "m1" });
		expect((await hub.providerList("u2"))[0].settings).toEqual({});
		expect(() => hub.setProviderSettings("u1", "nope", {})).toThrow(ChatError);
	});
});

describe("ChatHub project folders", () => {
	it("refuses a linked folder outside the projects directory", () => {
		const outside = mkdtempSync(join(tmpdir(), "grid-hub-outside-"));
		try {
			const hub = new ChatHub(new ChatStore(":memory:"), new Map(), root);
			expect(() => hub.linkProjectFolder("u1", "outside", outside)).toThrow(
				"outside the projects directory",
			);
		} finally {
			rmSync(outside, { recursive: true, force: true });
		}
	});

	it("works in the project's folder, and refuses to guess when there is none", () => {
		const store = new ChatStore(":memory:");
		const hub = new ChatHub(store, new Map(), root);
		expect(hub.defaultCwd("u1", "shop")).toBe(join(root, "shop"));
		store.setProjectFolder("u1", "grid", root);
		expect(hub.defaultCwd("u1", "grid")).toBe(root);
		expect(() => hub.defaultCwd("u1", "platform")).toThrow("Choose this project's folder first");
	});
});

/**
 * An agent whose turns fail with `error`. Its model list says `m1` and `m2`, or what `listed`
 * gives for the nth time it is asked.
 */
function failingProvider(
	error: string,
	listed: (asked: number) => string[] = () => ["m1", "m2"],
): { provider: Provider; asked: () => number; closed: () => number } {
	let asked = 0;
	let closed = 0;
	const provider: Provider = {
		info: () => ({ id: "fake", name: "Fake", available: true, models: [], modes: [] }),
		catalog: async () => {
			asked++;
			return { models: listed(asked).map((id) => ({ id, name: id })) };
		},
		start: async () => ({
			prompt: async () => ({ reason: "error", error }),
			cancel: () => undefined,
			approve: () => undefined,
			setModel: async () => undefined,
			setMode: async () => undefined,
			setEffort: async () => undefined,
			close: () => {
				closed++;
			},
		}),
	};
	return { provider, asked: () => asked, closed: () => closed };
}

/** Wait for work the hub does after a turn has ended, without holding the turn up. */
async function until(done: () => boolean): Promise<void> {
	for (let tries = 0; tries < 100 && !done(); tries++) await Bun.sleep(1);
	// One more pass, so anything after the last check has run too.
	await Bun.sleep(1);
}

describe("ChatHub failed turns", () => {
	/** The last turn's end as the log holds it: how it ended, and the words it ended with. */
	function turnEnd(
		store: ChatStore,
		id: string,
	): { reason: string; error?: string; retryable?: boolean } {
		const event = store.events(id).find((entry) => entry.type === "turn_end");
		if (!event || event.type !== "turn_end") throw new Error("the turn never ended");
		return event;
	}

	async function chatFailingWith(error: string, listed?: (asked: number) => string[]) {
		const store = new ChatStore(":memory:");
		const { provider, asked, closed } = failingProvider(error, listed);
		const hub = new ChatHub(store, new Map([["fake", provider]]), root);
		await hub.providerList("u1");
		const chat = hub.create(
			{ userId: "u1", workspace: "u1" },
			{ project: "shop", provider: "fake", model: "m1" },
		);
		await hub.prompt("u1", chat.id, "go");
		return { hub, store, chat, asked, closed };
	}

	it("says whose side capacity is on, keeps the model, and does not ask for models again", async () => {
		const detail = "Selected model is at capacity. Please try a different model.";
		const { hub, store, chat, asked } = await chatFailingWith(detail);
		hub.closeAll();
		const end = turnEnd(store, chat.id);
		expect(end.reason).toBe("error");
		expect(end.retryable).toBe(true);
		// The plain line first, the agent's own words after it, untouched.
		expect(end.error).toContain("on the provider's side, not yours");
		expect(end.error).toContain(detail);
		expect(store.get(chat.id)?.model).toBe("m1");
		expect(asked()).toBe(1);
	});

	it("ends the turn before asking for models, and takes a model the fresh list lost out of the chat", async () => {
		const detail = "model not found: m1";
		const { hub, store, chat, asked, closed } = await chatFailingWith(detail, (n) =>
			n === 1 ? ["m1", "m2"] : ["m2"],
		);
		// The turn has ended with the model still set: the list is asked for after it.
		const end = turnEnd(store, chat.id);
		expect(end.error).toContain("This model (m1) is no longer offered by Fake");
		expect(end.error).toContain(detail);
		expect(end.retryable).toBe(true);
		await until(() => store.get(chat.id)?.model === null);
		expect(asked()).toBe(2);
		expect(store.get(chat.id)?.model).toBeNull();
		expect(store.catalog("fake")?.data.models.map((model) => model.id)).toEqual(["m2"]);
		// The idle agent that held the model is closed, so the next message starts afresh.
		expect(closed()).toBe(1);
		hub.closeAll();
	});

	it("leaves a model the fresh list still has, when the refusal may not be about it", async () => {
		const { hub, store, chat, asked } = await chatFailingWith("model not found: m1");
		await until(() => asked() === 2);
		expect(store.get(chat.id)?.model).toBe("m1");
		expect(store.catalog("fake")?.data.models.map((model) => model.id)).toEqual(["m1", "m2"]);
		hub.closeAll();
	});

	it("drops a model the agent retired but still lists (opencode's notice)", async () => {
		const detail =
			"Internal error: Thank you for participating in the Stealth model testing period";
		const { hub, store, chat, asked } = await chatFailingWith(detail);
		await until(() => store.get(chat.id)?.model === null);
		expect(asked()).toBe(2);
		expect(store.get(chat.id)?.model).toBeNull();
		expect(store.catalog("fake")?.data.models.map((model) => model.id)).toEqual(["m2"]);
		hub.closeAll();
	});

	it("leaves a failure it cannot read, and the model list, alone", async () => {
		for (const detail of [
			"Exit code 1: something broke",
			"This model does not support images: unknown content type",
			"model output removed by content filter",
		]) {
			const { hub, store, chat, asked } = await chatFailingWith(detail);
			await Bun.sleep(2);
			hub.closeAll();
			const end = turnEnd(store, chat.id);
			expect(end.error).toBe(detail);
			expect(end.retryable).toBe(false);
			expect(store.get(chat.id)?.model).toBe("m1");
			expect(asked()).toBe(1);
		}
	});
});

describe("ChatHub running threads", () => {
	it("lists only this person's threads with a turn in flight", async () => {
		let finish: () => void = () => undefined;
		const provider: Provider = {
			info: () => ({ id: "fake", name: "Fake", available: true, models: [], modes: [] }),
			start: async () => ({
				prompt: () =>
					new Promise((resolve) => {
						finish = () => resolve({ reason: "done" });
					}),
				cancel: () => undefined,
				approve: () => undefined,
				setModel: async () => undefined,
				setMode: async () => undefined,
				setEffort: async () => undefined,
				close: () => undefined,
			}),
		};
		const store = new ChatStore(":memory:");
		const hub = new ChatHub(store, new Map([["fake", provider]]), root);
		const mine = hub.create(
			{ userId: "u1", workspace: "u1" },
			{ project: "shop", provider: "fake" },
		);
		hub.create({ userId: "u2", workspace: "u2" }, { project: "shop", provider: "fake" });
		const turn = hub.prompt("u1", mine.id, "go");
		await Bun.sleep(5);
		expect(hub.running("u1")).toEqual([{ id: mine.id, project: "shop" }]);
		expect(hub.running("u2")).toEqual([]);
		finish();
		await turn;
		expect(hub.running("u1")).toEqual([]);
		hub.closeAll();
	});

	it("tells the failed-turn listener once per failed turn", async () => {
		const provider: Provider = {
			info: () => ({ id: "fake", name: "Fake", available: true, models: [], modes: [] }),
			start: async () => ({
				prompt: async () => ({ reason: "error", error: "Out of credit" }),
				cancel: () => undefined,
				approve: () => undefined,
				setModel: async () => undefined,
				setMode: async () => undefined,
				setEffort: async () => undefined,
				close: () => undefined,
			}),
		};
		const store = new ChatStore(":memory:");
		const hub = new ChatHub(store, new Map([["fake", provider]]), root);
		const failed: string[] = [];
		hub.onTurnFailed((session) => failed.push(session.id));
		const session = hub.create(
			{ userId: "u1", workspace: "u1" },
			{ project: "shop", provider: "fake" },
		);
		await hub.prompt("u1", session.id, "go");
		expect(failed).toEqual([session.id]);
		hub.closeAll();
	});
});

describe("ChatHub session settings", () => {
	function hubWith(provider: Provider) {
		const store = new ChatStore(":memory:");
		return { store, hub: new ChatHub(store, new Map([["fake", provider]]), root) };
	}

	it("leaves model, mode and effort alone when a change leaves them out", async () => {
		// The console sends all three on every `configure`, as `undefined` for the ones it did
		// not change. Binding undefined writes NULL, so a configure with nothing in it used to
		// wipe the chat's saved choices while the running agent kept its own.
		const { store, hub } = hubWith({
			info: () => ({ id: "fake", name: "Fake", available: true, models: [], modes: [] }),
			catalog: async () => ({ models: [] }),
			start: async () => {
				throw new Error("not used");
			},
		});
		const chat = hub.create(
			{ userId: "u1", workspace: "u1" },
			{ project: "shop", provider: "fake", model: "gpt-5", mode: "plan", effort: "high" },
		);
		await hub.configure("u1", chat.id, {
			model: undefined,
			mode: undefined,
			effort: undefined,
		});
		expect(store.get(chat.id)).toMatchObject({ model: "gpt-5", mode: "plan", effort: "high" });

		// A change that is there still lands.
		await hub.configure("u1", chat.id, { model: "gpt-6", mode: undefined, effort: undefined });
		expect(store.get(chat.id)).toMatchObject({ model: "gpt-6", mode: "plan", effort: "high" });
	});
});

describe("ChatHub deleting a chat", () => {
	/** An agent whose turn only ends when the test says so. */
	function providerHoldingTurn(): { provider: Provider; finish: () => void } {
		let release: (result: TurnResult) => void = () => undefined;
		const provider: Provider = {
			info: () => ({ id: "fake", name: "Fake", available: true, models: [], modes: [] }),
			catalog: async () => ({ models: [] }),
			start: async () => ({
				prompt: () =>
					new Promise((resolve) => {
						release = resolve;
					}),
				cancel: () => undefined,
				approve: () => undefined,
				setModel: async () => undefined,
				setMode: async () => undefined,
				setEffort: async () => undefined,
				close: () => undefined,
			}),
		};
		return { provider, finish: () => release({ reason: "done" }) };
	}

	it("refuses to delete a chat whose agent is still working", async () => {
		// Deleting it anyway left the turn in flight writing events for a session row that was
		// gone (its events go with it, `turn_end` among them), and removed the worktree the
		// agent may still have been writing in.
		const { provider, finish } = providerHoldingTurn();
		const store = new ChatStore(":memory:");
		const hub = new ChatHub(store, new Map([["fake", provider]]), root);
		const chat = hub.create(
			{ userId: "u1", workspace: "u1" },
			{ project: "shop", provider: "fake" },
		);
		const prompting = hub.prompt("u1", chat.id, "go");
		await until(() => store.events(chat.id).some((event) => event.type === "turn_start"));

		expect(() => hub.delete("u1", chat.id)).toThrow("Stop the agent first");
		// Still there, and still safe to end the turn against.
		expect(store.get(chat.id)).not.toBeNull();
		finish();
		await prompting;
		await until(() => store.events(chat.id).some((event) => event.type === "turn_end"));

		hub.delete("u1", chat.id);
		expect(store.get(chat.id)).toBeNull();
	});
});

describe("ChatHub starting an agent", () => {
	it("keeps a newer agent when an earlier start fails late", async () => {
		// A start still in flight when the chat is parked (the idle timer, a worktree change)
		// and prompted again. Its late rejection used to clear whatever agent was current, so
		// the live one was no longer tracked: `closeAll` could not reach it and it stayed up
		// until the runner itself died.
		const store = new ChatStore(":memory:");
		let attempt = 0;
		const closed: string[] = [];
		const provider: Provider = {
			info: () => ({ id: "fake", name: "Fake", available: true, models: [], modes: [] }),
			catalog: async () => ({ models: [] }),
			start: async () => {
				attempt++;
				if (attempt === 1) {
					// The first start hangs, is given up on, and reports it afterwards.
					await Bun.sleep(40);
					throw new Error("the first start gave up");
				}
				return {
					prompt: async () => ({ reason: "done" as const }),
					cancel: () => undefined,
					approve: () => undefined,
					setModel: async () => undefined,
					setMode: async () => undefined,
					setEffort: async () => undefined,
					close: () => closed.push("second"),
				};
			},
		};
		const hub = new ChatHub(store, new Map([["fake", provider]]), root);
		const chat = hub.create(
			{ userId: "u1", workspace: "u1" },
			{ project: "shop", provider: "fake" },
		);
		// A device watching is what keeps the live entry alive across the park, so the stale
		// rejection lands on the same one the newer agent is now held in.
		hub.attach("u1", chat.id, { event: () => {}, state: () => {} });

		const first = hub.prompt("u1", chat.id, "go").catch(() => undefined);
		await Bun.sleep(5);
		hub.closeAll();
		await hub.prompt("u1", chat.id, "go again");
		await Bun.sleep(80);
		await first;

		hub.closeAll();
		await Bun.sleep(5);
		expect(closed).toEqual(["second"]);
	});

	it("does not take the runner down when cancel arrives before the agent exists", async () => {
		// An unhandled rejection is fatal here, and `agentFor` rejects when the agent will not
		// start. The derived promise from `.then()` needed a handler of its own.
		const store = new ChatStore(":memory:");
		const provider: Provider = {
			info: () => ({ id: "fake", name: "Fake", available: true, models: [], modes: [] }),
			catalog: async () => ({ models: [] }),
			start: async () => {
				throw new Error("this agent is not installed");
			},
		};
		const hub = new ChatHub(store, new Map([["fake", provider]]), root);
		const chat = hub.create(
			{ userId: "u1", workspace: "u1" },
			{ project: "shop", provider: "fake" },
		);
		await hub.prompt("u1", chat.id, "go").catch(() => undefined);
		hub.cancel("u1", chat.id);
		hub.approve("u1", chat.id, "a1", null);
		await Bun.sleep(20);
		expect(true).toBe(true);
	});
});

describe("ChatHub agent edits", () => {
	it("remembers which agent last edited each file, and not an edit that failed", async () => {
		const store = new ChatStore(":memory:");
		const provider: Provider = {
			info: () => ({ id: "fake", name: "Fake", available: true, models: [], modes: [] }),
			catalog: async () => ({ models: [{ id: "m1", name: "m1" }] }),
			start: async (context) => ({
				prompt: async () => {
					const diff = (path: string) => ({ path, patch: "", added: 1, removed: 0 });
					context.emit({ type: "tool", id: "t1", diffs: [diff("eta.ts")] });
					context.emit({
						type: "tool",
						id: "t2",
						status: "failed",
						diffs: [diff(join(root, "shop", "queue.ts"))],
					});
					return { reason: "done" } as TurnResult;
				},
				cancel: () => undefined,
				approve: () => undefined,
				setModel: async () => undefined,
				setMode: async () => undefined,
				setEffort: async () => undefined,
				close: () => undefined,
			}),
		};
		const hub = new ChatHub(store, new Map([["fake", provider]]), root);
		const chat = hub.create(
			{ userId: "u1", workspace: "u1" },
			{ project: "shop", provider: "fake", model: "m1" },
		);
		await hub.prompt("u1", chat.id, "go");
		hub.closeAll();
		const eta = join(chat.cwd, "eta.ts");
		const edits = hub.agentEdits([eta, join(root, "shop", "queue.ts")]);
		expect(edits.get(eta)).toMatchObject({ provider: "fake", sessionId: chat.id });
		expect(edits.size).toBe(1);
	});
});

describe("ChatHub note suggestions", () => {
	it("keeps what an agent suggests adding to a shared note, until it is dropped", async () => {
		const note = "6f1c2a3b-1d2e-4f50-8a9b-0c1d2e3f4a5b";
		const store = new ChatStore(":memory:");
		let prompted = "";
		const provider: Provider = {
			info: () => ({ id: "fake", name: "Fake", available: true, models: [], modes: [] }),
			catalog: async () => ({ models: [{ id: "m1", name: "m1" }] }),
			start: async (context) => ({
				prompt: async (text) => {
					prompted = text;
					context.emit({ type: "message", text: "Fixed.\n\n```grid-note " + note + "\n" });
					context.emit({ type: "message", text: "Under 2 minutes, say Arriving now.\n```" });
					return { reason: "done" } as TurnResult;
				},
				cancel: () => undefined,
				approve: () => undefined,
				setModel: async () => undefined,
				setMode: async () => undefined,
				setEffort: async () => undefined,
				close: () => undefined,
			}),
		};
		const hub = new ChatHub(store, new Map([["fake", provider]]), root);
		const chat = hub.create(
			{ userId: "u1", workspace: "u1" },
			{
				project: "shop",
				provider: "fake",
				model: "m1",
				notes: { text: `## ETA rules\nnote id: ${note}\n\nRound to 5.` },
			},
		);
		await hub.prompt("u1", chat.id, "go");
		hub.closeAll();
		// The agent was told how to suggest one.
		expect(prompted).toContain("```grid-note <note id>");
		const kept = hub.noteSuggestions("u1", "shop");
		expect(kept).toEqual([
			expect.objectContaining({
				noteId: note,
				provider: "fake",
				sessionId: chat.id,
				text: "Under 2 minutes, say Arriving now.",
			}),
		]);
		expect(hub.noteSuggestions("u2", "shop")).toEqual([]);
		expect(() => hub.dropNoteSuggestion("u2", kept[0].id)).toThrow(ChatError);
		hub.dropNoteSuggestion("u1", kept[0].id);
		expect(hub.noteSuggestions("u1", "shop")).toEqual([]);
	});
});
