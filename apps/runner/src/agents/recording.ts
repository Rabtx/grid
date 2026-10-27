import { acpProvider } from "./acp";
import { antigravityProvider } from "./antigravity";
import { claudeProvider } from "./claude";
import { codexProvider } from "./codex";
import type { ChatEvent } from "./events";
import type { AgentSession, Provider, TurnResult } from "./provider";
import type { Recording } from "./replay";
import type { Spawn } from "./stdio";

/**
 * The scenarios every agent is recorded doing (`bun run record:agents`) and replayed doing in
 * tests (`recorded.test.ts`): what Grid asks, how it answers what the agent asks back, and what
 * Grid made of the agent's output, kept beside the recording as its expectation.
 */

/** Each agent Grid drives, built on a given spawn: the real CLI to record, a replay to test. */
export const RECORDED_AGENTS: Record<string, (spawn: Spawn) => Provider> = {
	claude: (spawn) => claudeProvider({ binary: "claude", available: () => true, spawn }),
	codex: (spawn) => codexProvider({ binary: "codex", available: () => true, spawn }),
	opencode: (spawn) =>
		acpProvider({
			id: "opencode",
			name: "opencode",
			command: ["opencode", "acp"],
			available: () => true,
			spawn,
		}),
	antigravity: (spawn) =>
		antigravityProvider({
			binary: "agy",
			available: () => true,
			spawn,
			loadModels: async () => [],
		}),
};

export type Scenario = {
	name: string;
	prompt: string;
	/** Carries on the conversation the named scenario recorded. */
	resumes?: string;
	/** Stopped once the agent starts answering. */
	cancel?: boolean;
	/** Only these agents have what it needs (Claude Code's AskUserQuestion, say). */
	agents?: readonly string[];
};

export const SCENARIOS: readonly Scenario[] = [
	{ name: "simple", prompt: "Reply with exactly the word: hello" },
	{
		name: "approval",
		prompt:
			"Use your shell tool to run exactly this command: echo grid-replay > note.txt . Then reply done.",
	},
	{
		name: "question",
		prompt:
			"Use the AskUserQuestion tool to ask me one question, 'Which color?', with the options Red and Blue. Then reply with the color I chose.",
		agents: ["claude"],
	},
	{
		name: "resume",
		prompt:
			"What single word did you reply with in your previous message? Answer with just that word.",
		resumes: "simple",
	},
	{
		name: "cancel",
		prompt: "Count from 1 to 300, one number per line, with no other text.",
		cancel: true,
	},
];

/** What Grid made of a turn: its outcome, the kinds of events in order, and what was said. */
export type Expectation = {
	result: TurnResult;
	/** Event kinds in order, a run of the same kind once. */
	kinds: string[];
	text: string;
	tools: string[];
	approvals: number;
	questions: number;
};

/** Kinds that depend on timing or on the machine rather than on the turn. */
const UNSTEADY = new Set(["info", "commands", "usage", "reasoning", "rate_limits"]);

export function expectationOf(events: readonly ChatEvent[], result: TurnResult): Expectation {
	const kinds: string[] = [];
	for (const event of events) {
		if (UNSTEADY.has(event.type) || kinds.at(-1) === event.type) continue;
		kinds.push(event.type);
	}
	return {
		result,
		kinds,
		text: events
			.filter((event): event is Extract<ChatEvent, { type: "message" }> => event.type === "message")
			.map((event) => event.text)
			.join(""),
		tools: events
			.filter((event): event is Extract<ChatEvent, { type: "tool" }> => event.type === "tool")
			.flatMap((event) => (event.title ? [event.title] : [])),
		approvals: events.filter((event) => event.type === "approval").length,
		questions: events.filter((event) => event.type === "question").length,
	};
}

/**
 * One scenario through a provider, answering as Grid's person would: approvals allowed, each
 * question answered with its first option, a `cancel` scenario stopped at its first words.
 */
export async function runScenario(
	provider: Provider,
	scenario: Scenario,
	options: { cwd: string; model?: string; resume?: string },
): Promise<{ events: ChatEvent[]; result: TurnResult; token: string | null }> {
	const events: ChatEvent[] = [];
	let token: string | null = null;
	let session: AgentSession | null = null;
	let stopped = false;
	session = await provider.start({
		cwd: options.cwd,
		...(options.model ? { model: options.model } : {}),
		...(options.resume ? { resume: options.resume } : {}),
		emit: (event) => {
			events.push(event);
			const current = session;
			if (!current) return;
			if (event.type === "approval") {
				const allow = event.options.find((option) => option.kind !== "deny");
				queueMicrotask(() => current.approve(event.id, allow?.id ?? null));
			}
			if (event.type === "question")
				queueMicrotask(() =>
					current.answer?.(
						event.id,
						Object.fromEntries(
							event.questions.map((question) => [question.id, [question.options[0]?.label ?? ""]]),
						),
					),
				);
			if (scenario.cancel && event.type === "message" && !stopped) {
				stopped = true;
				queueMicrotask(() => current.cancel());
			}
		},
		onResumeToken: (value) => {
			token = value;
		},
	});
	const result = await session.prompt(scenario.prompt);
	await Bun.sleep(300);
	session.close();
	return { events, result, token };
}

/** A recorded scenario as kept in the repository, beside its processes. */
export type RecordedScenario = {
	agent: string;
	scenario: string;
	model: string | null;
	/** The conversation it carried on (a `resumes` scenario's), as recorded. */
	resume: string | null;
	expect: Expectation;
};

/** Processes an agent starts beside a session that are kept out of fixtures, by agent. */
export const SIDE_PROCESSES: Record<string, { marker: string; standIn: Recording }> = {
	// Claude Code is started a second time to list its commands; its answer lists the recording
	// machine's own skills and plugins, so a stand-in answers instead.
	claude: {
		marker: '"grid-init"',
		standIn: [
			{
				t: 0,
				in: {
					type: "control_request",
					request_id: "grid-init",
					request: { subtype: "initialize" },
				},
			},
			{
				t: 1,
				out: {
					type: "control_response",
					response: { subtype: "success", request_id: "grid-init", response: { commands: [] } },
				},
			},
		],
	},
};

/**
 * How a fresh recording differs from the kept one in what matters to Grid: how the turn ended and
 * the kinds of events it saw, in order, and whether it asked for approvals and answers. Wording
 * is left out; agents never say the same thing twice.
 */
export function driftOf(kept: Expectation, fresh: Expectation): string[] {
	const drift: string[] = [];
	if (kept.result.reason !== fresh.result.reason)
		drift.push(`ended ${fresh.result.reason}, was ${kept.result.reason}`);
	if (kept.kinds.join(",") !== fresh.kinds.join(","))
		drift.push(`events ${fresh.kinds.join(" → ")}, were ${kept.kinds.join(" → ")}`);
	if (kept.approvals !== fresh.approvals)
		drift.push(`${fresh.approvals} approval(s), were ${kept.approvals}`);
	if (kept.questions !== fresh.questions)
		drift.push(`${fresh.questions} question(s), were ${kept.questions}`);
	return drift;
}
