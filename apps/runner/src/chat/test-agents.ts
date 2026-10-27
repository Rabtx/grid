import type { Choice } from "../agents/events";
import type { AgentContext, AgentSession, Provider, TurnResult } from "../agents/provider";

const MODES: Choice[] = [
	{ id: "plan", name: "Plan" },
	{ id: "default", name: "Ask" },
	{ id: "acceptEdits", name: "Auto-accept edits" },
	{ id: "bypassPermissions", name: "Full access" },
];

/** For tests: an agent whose turns wait until the test ends them, keeping what it was sent. */
export function heldAgent(id = "hand") {
	const seats: {
		context: AgentContext;
		prompts: string[];
		finish: ((result: TurnResult) => void) | null;
	}[] = [];
	const provider: Provider = {
		info: () => ({
			id,
			name: "Hand",
			available: true,
			models: [],
			modes: MODES,
			defaultMode: "default",
		}),
		start: async (context) => {
			const seat = {
				context,
				prompts: [] as string[],
				finish: null as ((result: TurnResult) => void) | null,
			};
			seats.push(seat);
			const session: AgentSession = {
				prompt: (text) =>
					new Promise<TurnResult>((resolve) => {
						seat.prompts.push(text);
						seat.finish = resolve;
					}),
				cancel: () => {
					seat.finish?.({ reason: "cancelled" });
					seat.finish = null;
				},
				approve: () => undefined,
				setModel: async () => undefined,
				setMode: async () => undefined,
				setEffort: async () => undefined,
				close: () => undefined,
			};
			return session;
		},
	};
	const prompts = () => seats.flatMap((seat) => seat.prompts);
	/** End every turn still going, after saying `reply`. */
	const finishAll = async (reply = "") => {
		for (const seat of seats) {
			if (!seat.finish) continue;
			if (reply) seat.context.emit({ type: "message", text: reply });
			const done = seat.finish;
			seat.finish = null;
			done({ reason: "done" });
		}
		await Bun.sleep(20);
	};
	return { provider, seats, prompts, finishAll };
}

export async function until(check: () => boolean, ms = 2_000): Promise<void> {
	const end = Date.now() + ms;
	while (!check()) {
		if (Date.now() > end) throw new Error("timed out waiting");
		await Bun.sleep(5);
	}
}
