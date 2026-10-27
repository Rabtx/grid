/** An event of a shared thread, as the runner shows guests it (`GET /runner/guest/<token>`). */
export type GuestEvent = { n: number } & (
	| { type: "user"; text: string; guest?: string; from?: string }
	| { type: "message"; text: string }
	| { type: "tool"; id: string; title?: string; status?: string }
	| { type: "turn_start"; at?: string }
	| { type: "turn_end"; reason: string }
	| { type: "guest_request"; id: string; name: string; text: string }
	| { type: "guest_request_resolved"; id: string; action: "sent" | "dismissed" }
);

export type GuestPage = {
	title: string;
	running: boolean;
	expiresAt: string;
	events: GuestEvent[];
	next: number;
};

/** What a guest reads: who said what, the agent's steps as lines, and their own questions. */
export type GuestBlock =
	| { kind: "user"; key: string; text: string; from: string }
	| { kind: "agent"; key: string; text: string }
	| { kind: "step"; key: string; id: string; title: string; done: boolean }
	| {
			kind: "asked";
			key: string;
			id: string;
			name: string;
			text: string;
			state: "waiting" | "sent" | "dismissed";
	  };

/** The blocks of a shared thread, from its events in order. */
export function guestBlocks(events: readonly GuestEvent[]): GuestBlock[] {
	const blocks: GuestBlock[] = [];
	for (const event of events) {
		const key = String(event.n);
		const last = blocks.at(-1);
		switch (event.type) {
			case "user":
				// A question a guest asked and the person sent on is already shown as theirs.
				if (event.guest) break;
				blocks.push({
					kind: "user",
					key,
					text: event.text,
					from: event.from ?? "The thread's person",
				});
				break;
			case "message":
				// The agent's words arrive in parts; they read as one answer until something else comes.
				if (last?.kind === "agent")
					blocks[blocks.length - 1] = { ...last, text: last.text + event.text };
				else blocks.push({ kind: "agent", key, text: event.text });
				break;
			case "tool": {
				const index = blocks.findIndex((block) => block.kind === "step" && block.id === event.id);
				const done = event.status === "completed" || event.status === "failed";
				if (index >= 0) {
					const step = blocks[index] as Extract<GuestBlock, { kind: "step" }>;
					blocks[index] = { ...step, title: event.title ?? step.title, done: done || step.done };
				} else
					blocks.push({ kind: "step", key, id: event.id, title: event.title ?? "A step", done });
				break;
			}
			case "guest_request":
				blocks.push({
					kind: "asked",
					key,
					id: event.id,
					name: event.name,
					text: event.text,
					state: "waiting",
				});
				break;
			case "guest_request_resolved": {
				const index = blocks.findIndex((block) => block.kind === "asked" && block.id === event.id);
				if (index >= 0)
					blocks[index] = {
						...(blocks[index] as Extract<GuestBlock, { kind: "asked" }>),
						state: event.action,
					};
				break;
			}
			default:
				break;
		}
	}
	return blocks;
}
