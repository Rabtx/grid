import type {
	ApprovalOption,
	ChatEvent,
	Choice,
	PlanEntry,
	ToolKind,
	ToolStatus,
} from "../types/chat.types";

/** One row of the conversation as the screen draws it. */
export type Block =
	| { kind: "user"; key: string; text: string }
	| { kind: "assistant"; key: string; text: string }
	| { kind: "reasoning"; key: string; text: string }
	| {
			kind: "tool";
			key: string;
			id: string;
			title: string;
			tool: ToolKind;
			status: ToolStatus;
			input?: string;
			output?: string;
	  }
	| {
			kind: "approval";
			key: string;
			id: string;
			title: string;
			detail?: string;
			options: ApprovalOption[];
			/** undefined while waiting; the chosen option, or null when dismissed. */
			resolved?: string | null;
	  }
	| { kind: "plan"; key: string; entries: PlanEntry[] }
	| { kind: "notice"; key: string; tone: "error" | "muted"; text: string };

export type Transcript = {
	blocks: Block[];
	models: Choice[];
	model: string | null;
	modes: Choice[];
	mode: string | null;
	/** The latest usage the agent reported. */
	usage: Extract<ChatEvent, { type: "usage" }> | null;
};

export function emptyTranscript(): Transcript {
	return { blocks: [], models: [], model: null, modes: [], mode: null, usage: null };
}

/**
 * Fold one event into the transcript, returning a new one. Text and reasoning deltas extend the
 * block they continue; tools and approvals update their earlier block by id; a plan replaces the
 * current turn's plan. Pure, so the whole log can be replayed with `reduce`.
 */
export function applyEvent(transcript: Transcript, event: ChatEvent): Transcript {
	const blocks = transcript.blocks;
	const last = blocks.at(-1);
	const key = `b${blocks.length}`;

	switch (event.type) {
		case "user":
			return { ...transcript, blocks: [...blocks, { kind: "user", key, text: event.text }] };
		case "message":
		case "reasoning": {
			const kind = event.type === "message" ? "assistant" : "reasoning";
			if (last?.kind === kind) {
				return {
					...transcript,
					blocks: [...blocks.slice(0, -1), { ...last, text: last.text + event.text }],
				};
			}
			return { ...transcript, blocks: [...blocks, { kind, key, text: event.text }] };
		}
		case "tool": {
			const index = blocks.findIndex((block) => block.kind === "tool" && block.id === event.id);
			if (index >= 0) {
				const earlier = blocks[index] as Extract<Block, { kind: "tool" }>;
				const updated: Block = {
					...earlier,
					title: event.title ?? earlier.title,
					tool: event.kind ?? earlier.tool,
					status: event.status ?? earlier.status,
					input: event.input ?? earlier.input,
					output: event.output ?? earlier.output,
				};
				return { ...transcript, blocks: blocks.map((block, i) => (i === index ? updated : block)) };
			}
			return {
				...transcript,
				blocks: [
					...blocks,
					{
						kind: "tool",
						key,
						id: event.id,
						title: event.title ?? "Tool",
						tool: event.kind ?? "other",
						status: event.status ?? "running",
						input: event.input,
						output: event.output,
					},
				],
			};
		}
		case "approval":
			return {
				...transcript,
				blocks: [
					...blocks,
					{
						kind: "approval",
						key,
						id: event.id,
						title: event.title,
						detail: event.detail,
						options: event.options,
					},
				],
			};
		case "approval_resolved":
			return {
				...transcript,
				blocks: blocks.map((block) =>
					block.kind === "approval" && block.id === event.id
						? { ...block, resolved: event.optionId }
						: block,
				),
			};
		case "plan": {
			// One plan per turn: a newer version replaces the one shown since the last message.
			const since = lastIndexOf(blocks, (block) => block.kind === "user");
			const planIndex = lastIndexOf(blocks, (block) => block.kind === "plan");
			if (planIndex > since) {
				return {
					...transcript,
					blocks: blocks.map((block, i) =>
						i === planIndex ? ({ ...block, entries: event.entries } as Block) : block,
					),
				};
			}
			return { ...transcript, blocks: [...blocks, { kind: "plan", key, entries: event.entries }] };
		}
		case "usage":
			return { ...transcript, usage: { ...transcript.usage, ...event } };
		case "info":
			return {
				...transcript,
				models: event.models?.length ? event.models : transcript.models,
				model: event.model ?? transcript.model,
				modes: event.modes?.length ? event.modes : transcript.modes,
				mode: event.mode ?? transcript.mode,
			};
		case "turn_end":
			if (event.reason === "error") {
				return {
					...transcript,
					blocks: [
						...blocks,
						{
							kind: "notice",
							key,
							tone: "error",
							text: event.error ?? "The agent stopped with an error.",
						},
					],
				};
			}
			if (event.reason === "cancelled") {
				return {
					...transcript,
					blocks: [...blocks, { kind: "notice", key, tone: "muted", text: "Stopped." }],
				};
			}
			// Tools still marked running when the turn ends did finish; the agent just never said.
			return {
				...transcript,
				blocks: blocks.map((block) =>
					block.kind === "tool" && (block.status === "running" || block.status === "pending")
						? { ...block, status: "completed" }
						: block,
				),
			};
		case "error":
			return {
				...transcript,
				blocks: [...blocks, { kind: "notice", key, tone: "error", text: event.message }],
			};
		default:
			return transcript;
	}
}

export function replay(events: ChatEvent[]): Transcript {
	return events.reduce(applyEvent, emptyTranscript());
}

function lastIndexOf<T>(items: T[], test: (item: T) => boolean): number {
	for (let i = items.length - 1; i >= 0; i--) if (test(items[i])) return i;
	return -1;
}

/** Approvals still waiting for an answer. */
export function pendingApprovals(transcript: Transcript): Extract<Block, { kind: "approval" }>[] {
	return transcript.blocks.filter(
		(block): block is Extract<Block, { kind: "approval" }> =>
			block.kind === "approval" && block.resolved === undefined,
	);
}
