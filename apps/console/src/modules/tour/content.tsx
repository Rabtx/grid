import type { JSX } from "@solidjs/web";

import {
	BranchIcon,
	ChangedFilesRow,
	ChatIcon,
	ForkDivider,
	IdeaIcon,
	InlineVisual,
	QuestionCard,
	QueueList,
	RestoreIcon,
	SendIcon,
	SubagentStrip,
	ToolIcon,
} from "@/kit";

/**
 * The tour's slides: one per feature, each a short pitch, what to try, and a preview drawn with the
 * same kit pieces the thread uses, on sample data. Nothing in a preview reaches an agent.
 */
export type TourSlide = {
	id: string;
	icon: () => JSX.Element;
	title: string;
	pitch: string;
	highlights: string[];
	preview: () => JSX.Element;
};

const noop = () => undefined;

export const TOUR_SLIDES: TourSlide[] = [
	{
		id: "queue",
		icon: () => <SendIcon />,
		title: "Keep typing while the agent works",
		pitch:
			"A message sent while the agent is busy waits in a queue and goes the moment its turn ends. Steer sends it into the turn going on instead.",
		highlights: [
			"Enter queues; Steer (⌘/Ctrl+Enter) sends into the turn now.",
			"Stop or a failed turn holds the queue until you press Resume.",
			"Queued messages survive a runner restart, held until you say go.",
		],
		preview: () => (
			<QueueList
				items={[
					{ id: "1", text: "Then add a test for the empty state", files: 0 },
					{ id: "2", text: "And update the changelog", files: 1 },
				]}
				paused={false}
				running
				onRemove={noop}
				onSendNow={noop}
				onResume={noop}
				onClear={noop}
			/>
		),
	},
	{
		id: "subagents",
		icon: () => <ToolIcon />,
		title: "See the subagents an agent starts",
		pitch:
			"When Claude Code runs a Task or Codex spawns a sub-agent, each one gets its own card: its brief, its own steps, and what it reported back.",
		highlights: [
			"Running subagents show above the composer; tap one to jump to it.",
			"Their steps stay out of the main reply, so the thread reads cleanly.",
			"Stopped or failed work is never labelled done.",
		],
		preview: () => (
			<SubagentStrip
				agents={[
					{ id: "a", title: "Map the API routes" },
					{ id: "b", title: "Find flaky tests" },
				]}
				onOpen={noop}
			/>
		),
	},
	{
		id: "questions",
		icon: () => <ChatIcon />,
		title: "Answer an agent's questions properly",
		pitch:
			"An agent that needs a decision asks it as a form, not a wall of text. Pick an option or type your own; the answer stays in the transcript.",
		highlights: [
			"Claude's AskUserQuestion and Codex's input requests both land here.",
			"Questions notify you like approvals when you are away.",
			"Dismiss one and the agent is told, so it never waits forever.",
		],
		preview: () => (
			<QuestionCard
				questions={[
					{
						id: "db",
						header: "Database",
						question: "Which database should the new service use?",
						options: [
							{ label: "Postgres", description: "What the API already uses" },
							{ label: "SQLite", description: "One file, no server" },
						],
					},
				]}
				onAnswer={noop}
			/>
		),
	},
	{
		id: "visuals",
		icon: () => <IdeaIcon />,
		title: "Charts and tables inside replies",
		pitch:
			"Agents can show stats, charts, tables, comparisons, checklists and small calculators right in the reply, drawn in Grid's own theme.",
		highlights: [
			"Ask for a chart or a comparison when it reads faster than text.",
			"Choice buttons send their follow-up as your next message.",
			"Custom HTML runs sandboxed, with no network and no way out.",
		],
		preview: () => (
			<InlineVisual
				title="Build times"
				markdown={(text) => <p>{text}</p>}
				blocks={[
					{
						type: "stats",
						items: [
							{
								label: "p95 build",
								value: "41s",
								detail: "−18s this week",
								trend: "down",
								tone: "success",
							},
							{ label: "Cache hits", value: "92%", tone: "accent" },
						],
					},
					{
						type: "bar-chart",
						unit: "s",
						items: [
							{ label: "web", value: 41, baseline: 59, highlight: true },
							{ label: "console", value: 28, baseline: 31 },
						],
						baselineLabel: "Last week",
						valueLabel: "Now",
						better: "lower",
					},
				]}
			/>
		),
	},
	{
		id: "checkpoints",
		icon: () => <RestoreIcon />,
		title: "Undo a turn",
		pitch:
			"Every turn's files are checkpointed in git, out of sight. Undo puts them back to how that turn found them, without touching your branch or history.",
		highlights: [
			"Each turn that changed files ends with a row: what changed, and Undo.",
			"Refused while that agent, or another in the same folder, is working.",
			"What was there before the undo is kept under a hidden git ref.",
		],
		preview: () => (
			<ChangedFilesRow
				files={[
					{ path: "src/routes/login.ts", added: 24, removed: 6 },
					{ path: "src/routes/login.test.ts", added: 41, removed: 0 },
				]}
				canUndo
				onUndo={noop}
			/>
		),
	},
	{
		id: "forks",
		icon: () => <BranchIcon />,
		title: "Fork a thread from any turn",
		pitch:
			"Try another approach without losing this one: fork from a message, in the same folder or a fresh worktree, and the new thread carries the conversation up to there.",
		highlights: [
			"Fork from a message's actions, or type /fork (or /fork worktree).",
			"The fork's agent is told the conversation so far.",
			"A divider marks where the fork's own work begins.",
		],
		preview: () => <ForkDivider from="Add passkey login" />,
	},
];
