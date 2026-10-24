import type { JSX } from "@solidjs/web";

import {
	BoardIcon,
	BranchIcon,
	ChangedFilesRow,
	ChatIcon,
	CrewPanel,
	HandoffDivider,
	PaletteIcon,
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
	/** The release it came with: a device sees each edition's slides once. */
	edition: string;
	icon: () => JSX.Element;
	title: string;
	pitch: string;
	highlights: string[];
	preview: () => JSX.Element;
};

const noop = () => undefined;

/** The second edition: crews, handoffs, side chats, the board from chat, and backgrounds. */
const CREWS_EDITION = "crews-1";

export const TOUR_SLIDES: TourSlide[] = [
	{
		id: "crews",
		edition: CREWS_EDITION,
		icon: () => <ToolIcon />,
		title: "Crews: one chat that runs many agents",
		pitch:
			"Turn on Crew when you start a chat and that agent coordinates: it splits your request into tasks and hands each to a crew member working in its own thread and worktree.",
		highlights: [
			"Members run a few at a time; the rest wait their turn.",
			"Grid watches them: a quiet member is nudged, restarted once, then handed to you with Retry.",
			"Members' approvals show over the coordinator's composer, answered there or in their thread.",
		],
		preview: () => (
			<CrewPanel
				name="Launch the pricing page"
				parallel={3}
				paused={false}
				members={[
					{
						id: "a",
						key: "copy",
						title: "Write the pricing copy",
						state: "done",
						running: false,
						waiting: false,
					},
					{
						id: "b",
						key: "page",
						title: "Build the page",
						state: "working",
						running: true,
						waiting: false,
					},
					{
						id: "c",
						key: "tests",
						title: "Add checkout tests",
						state: "needs_you",
						running: false,
						waiting: false,
					},
				]}
				onRetry={noop}
				onStop={noop}
				onPause={noop}
				onSettings={noop}
			/>
		),
	},
	{
		id: "handoff",
		edition: CREWS_EDITION,
		icon: () => <SendIcon />,
		title: "Hand a thread to another agent",
		pitch:
			"Pick another agent in the composer's agent picker, or type /handoff codex. It carries on the same thread, folder and worktree, and is told the conversation so far.",
		highlights: [
			"/handoff codex new carries on in a new thread instead, leaving this one as it was.",
			"A line in the thread shows where one agent took over from the other.",
			"Handoffs wait for the current turn to end.",
		],
		preview: () => (
			<HandoffDivider
				from={<span class="text-fg-muted">Claude Code</span>}
				to={<span class="text-fg-muted">Codex</span>}
			/>
		),
	},
	{
		id: "side",
		edition: CREWS_EDITION,
		icon: () => <ChatIcon />,
		title: "Side chats",
		pitch:
			"Ask a narrow question without derailing the thread: a side chat opens beside it with the conversation so far, in the same folder, and stays out of your thread list.",
		highlights: [
			"The chat button in the thread's top bar, or /side (or /side codex).",
			"It opens as a tab in the thread's workspace, next to the terminal.",
			"Deleting the thread deletes its side chats.",
		],
		preview: () => (
			<div class="surface-card flex flex-col gap-1 p-3">
				<span class="text-caption text-fg-subtle">Side chat 1 · Add passkey login</span>
				<span class="text-body text-fg">Why does the login test flake on CI?</span>
			</div>
		),
	},
	{
		id: "board",
		edition: CREWS_EDITION,
		icon: () => <BoardIcon />,
		title: "Agents keep the board up to date",
		pitch:
			"Agents can read this project's board, add tasks and move them along, acting as you, with your access.",
		highlights: [
			"Ask: file the follow-ups as board tasks, or move GRID-12 to review.",
			"Tasks an agent adds say which agent owns them.",
			"Each change shows as a step in the thread.",
		],
		preview: () => (
			<InlineVisual
				title="Board"
				markdown={(text) => <p>{text}</p>}
				blocks={[
					{
						type: "list",
						style: "steps",
						items: [
							{ title: "GRID-41 Add passkey login", detail: "Moved to review", status: "done" },
							{
								title: "GRID-42 Rate-limit the login route",
								detail: "Added to backlog",
								status: "current",
							},
						],
					},
				]}
			/>
		),
	},
	{
		id: "background",
		edition: CREWS_EDITION,
		icon: () => <PaletteIcon />,
		title: "Make it yours: a background",
		pitch:
			"Settings → Appearance → Background: put a picture behind the sidebar, or switch on Whole app to have it behind everything.",
		highlights: [
			"Interface opacity sets how much of the picture shows through.",
			"Blur keeps text easy to read over a busy photo.",
			"Menus and dialogs stay solid; the picture is kept on this device.",
		],
		preview: () => (
			<div class="surface-card flex flex-col gap-1.5 p-3 text-body">
				<span class="flex justify-between text-fg">
					Whole app <span class="text-fg-subtle">On</span>
				</span>
				<span class="flex justify-between text-fg">
					Interface opacity <span class="text-fg-subtle">78%</span>
				</span>
				<span class="flex justify-between text-fg">
					Blur <span class="text-fg-subtle">8px</span>
				</span>
			</div>
		),
	},
	{
		id: "queue",
		edition: "agent-threads-1",
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
		edition: "agent-threads-1",
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
		edition: "agent-threads-1",
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
		edition: "agent-threads-1",
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
		edition: "agent-threads-1",
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
		edition: "agent-threads-1",
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
