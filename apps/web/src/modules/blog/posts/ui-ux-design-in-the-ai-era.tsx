import {
	AccessIcon,
	AiMagicIcon,
	AlertCircleIcon,
	Bookmark02Icon,
	CheckmarkCircle02Icon,
	ColorsIcon,
	Cursor01Icon,
	EyeIcon,
	FigmaIcon,
	GridViewIcon,
	KeyboardIcon,
	Layers01Icon,
	Loading03Icon,
	Moon02Icon,
	PaintBoardIcon,
	RulerIcon,
	SmartPhone01Icon,
	SparklesIcon,
	Target02Icon,
	TextFontIcon,
	ToggleOnIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { CheatSheet } from "../components/cheat-sheet";
import { PostFigure } from "../components/post-figure";
import { PostCode, PostH2, PostH3, PostList, PostP, PostTip } from "../components/prose";

const SHOTS = "ai-era-ui";

/** The post's sections, for the table of contents. */
export const TOC = [
	{ id: "what-changed", label: "What actually changed" },
	{ id: "skills", label: "The skills that still matter" },
	{ id: "tips", label: "12 tips for designing with AI" },
	{ id: "workflow", label: "How I design Grid with AI" },
	{ id: "showcase", label: "The showcase" },
	{ id: "cheat-sheet", label: "The cheat sheet" },
	{ id: "icons", label: "Icons: Hugeicons, one stroke" },
] as const;

const TIPS = [
	{
		icon: PaintBoardIcon,
		title: "Write the design system down before you prompt",
		body: (
			<>
				An agent can only follow rules it can read. Grid keeps one brief,{" "}
				<PostCode>DESIGN.md</PostCode>, that every tool loads first: the material, the type scale,
				the radius ladder and the states each surface owes. One page of rules beats a hundred
				prompts that each re-explain taste.
			</>
		),
	},
	{
		icon: RulerIcon,
		title: "Give numbers, not adjectives",
		body: (
			<>
				“Clean and modern” gets you the average of the internet. “32px buttons, 10px radius, 13px
				medium labels, #777777 for secondary text” gets you your product. The cheat sheet below is
				exactly this: a list of numbers an agent cannot misread.
			</>
		),
	},
	{
		icon: AlertCircleIcon,
		title: "Design the states first, not last",
		body: (
			<>
				AI draws the happy path by default. The quality lives in the other frames: empty, loading,
				error, offline, permission denied. Ask for them by name, in the first prompt, and review
				them before the populated screen.
			</>
		),
	},
	{
		icon: ColorsIcon,
		title: "Two colours make everything",
		body: (
			<>
				Grid’s whole UI is a canvas and one ink. Borders, hovers, selection and secondary text are
				that ink at fixed strengths, so there is no grey palette for a model to improvise with.
				Fewer choices means fewer wrong ones.
			</>
		),
	},
	{
		icon: Layers01Icon,
		title: "Build hierarchy with ink, not size",
		body: (
			<>
				Most text is secondary. Only the user’s data and the active state get full contrast; chrome
				recedes. When everything is bold, nothing is, and agents love making everything bold.
			</>
		),
	},
	{
		icon: Target02Icon,
		title: "Colour is a signal, never decoration",
		body: (
			<>
				Accent means focus, active or link. Green, amber and red appear only when they mean
				something, as text or a 10% fill. If you can delete a colour and lose no information, delete
				it.
			</>
		),
	},
	{
		icon: SmartPhone01Icon,
		title: "Mobile first, in one component",
		body: (
			<>
				Unprefixed classes are the phone layout; <PostCode>sm:</PostCode> and{" "}
				<PostCode>lg:</PostCode> add the desktop on top. Tell the agent this explicitly or it will
				write desktop first and patch phones back down with <PostCode>max-md:</PostCode>.
			</>
		),
	},
	{
		icon: Cursor01Icon,
		title: "Keep touch targets honest",
		body: (
			<>
				A control can look 24px and still be 44px to a thumb. Draw it small, give it a big hit area,
				and never hide an action behind hover alone.
			</>
		),
	},
	{
		icon: SparklesIcon,
		title: "Quiet motion",
		body: (
			<>
				Short, ease-out, colour-only on hover, a 0.97 scale on press. Motion should confirm what
				happened, not perform. Generated UI over-animates; cut it in review.
			</>
		),
	},
	{
		icon: Moon02Icon,
		title: "Review in both themes, at 320px",
		body: (
			<>
				Every screen in Grid is drawn four times: desktop and phone, light and dark. Most AI bugs
				show up in exactly one of those four: a hard-coded white, a label that wraps, a row that
				overflows.
			</>
		),
	},
	{
		icon: KeyboardIcon,
		title: "Keyboard and screen reader are part of the design",
		body: (
			<>
				Focus rings, labels on icon buttons and real <PostCode>role=&quot;switch&quot;</PostCode>{" "}
				semantics are cheap to ask for and expensive to retrofit. Put them in the brief.
			</>
		),
	},
	{
		icon: CheckmarkCircle02Icon,
		title: "Let tests guard your taste",
		body: (
			<>
				Grid’s console fails the build on a font size outside the scale, a one-off duration or a
				fixed corner radius. Taste that is enforced by a test survives a hundred agent commits;
				taste that lives in a reviewer’s head does not.
			</>
		),
	},
] as const;

const WORKFLOW = [
	{
		icon: TextFontIcon,
		title: "Brief",
		body: "One paragraph on what the screen is for and who uses it, plus the rules from DESIGN.md.",
	},
	{
		icon: FigmaIcon,
		title: "Figma frames",
		body: "Every screen drawn in the rabtx design system at 1440 and 390, in light and dark, with its states on their own page.",
	},
	{
		icon: AiMagicIcon,
		title: "Agent builds",
		body: "The agent reads the frame through Figma MCP and builds it from the console’s own kit, never fresh markup.",
	},
	{
		icon: EyeIcon,
		title: "Screenshot review",
		body: "Real screenshots in both themes and both sizes, compared against the frame, before anything merges.",
	},
] as const;

const ICONS = [
	{ icon: GridViewIcon, name: "Board" },
	{ icon: AiMagicIcon, name: "Agents" },
	{ icon: ToggleOnIcon, name: "Settings" },
	{ icon: Loading03Icon, name: "Loading" },
	{ icon: AlertCircleIcon, name: "Error" },
	{ icon: AccessIcon, name: "Access" },
	{ icon: Bookmark02Icon, name: "Saved" },
	{ icon: CheckmarkCircle02Icon, name: "Done" },
] as const;

export function UiUxDesignInTheAiEra() {
	return (
		<>
			<PostP className="mt-0 text-[18px] text-foreground leading-8 sm:text-[19px]">
				An AI model can draw a screen in ten seconds now. That is the problem. When anyone can
				generate a dashboard, the dashboard stops being the work. The work is knowing which of the
				ten generated screens is right, and why, and writing that down so the next ten come out
				right on their own.
			</PostP>
			<PostP>
				This post is what we learned designing Grid, an AI-native workspace, with agents in the loop
				from the first frame. Tips, tricks, the skills worth practising, real screens and a cheat
				sheet of the exact numbers we build with.
			</PostP>

			<PostH2 id="what-changed">What actually changed</PostH2>
			<PostP>
				Production got cheap. Judgement did not. A designer used to spend most of a day pushing
				pixels and a little of it deciding; now the ratio flips. You spend your time on the brief,
				the system and the review, and the agent spends its time on the pixels.
			</PostP>
			<PostP>
				That shift rewards a different kind of designer: one who can say precisely what good looks
				like, in words and numbers a machine can follow, and who can spot the one wrong state in a
				screen that otherwise looks finished.
			</PostP>

			<PostH2 id="skills">The skills that still matter</PostH2>
			<PostH3>Taste, made explicit</PostH3>
			<PostP>
				Having taste is not enough any more; you have to be able to write it down. “Calmer” is not a
				rule. “Secondary text at 55% ink, one accent colour, no shadows on inline cards” is.
			</PostP>
			<PostH3>Systems thinking</PostH3>
			<PostP>
				Agents are excellent at repeating a pattern and terrible at inventing a consistent one. Your
				leverage is the system: tokens, a radius ladder, a type scale, a component kit. Design the
				system once and every generated screen inherits it.
			</PostP>
			<PostH3>Writing</PostH3>
			<PostP>
				Briefs are the new wireframes. The clearest writer on the team ships the best UI.
			</PostP>
			<PostH3>State design</PostH3>
			<PostP>
				Loading, empty, error, disabled, focus-visible, selected, saving, success, permission
				denied. This list is the difference between a demo and a product, and it is exactly what
				generated UI leaves out.
			</PostP>
			<PostH3>Critical review</PostH3>
			<PostList
				items={[
					"Does the most important thing on the screen carry the most ink?",
					"Is every colour on the screen carrying meaning?",
					"What does this look like with no data, with an error, at 320px, in dark mode?",
					"Can I reach every action with a thumb and with a keyboard?",
				]}
			/>

			<PostH2 id="tips">12 tips for designing with AI</PostH2>
			<ol className="mt-8 space-y-6">
				{TIPS.map((tip, index) => (
					<PostTip key={tip.title} index={index + 1} icon={tip.icon} title={tip.title}>
						{tip.body}
					</PostTip>
				))}
			</ol>

			<PostH2 id="workflow">How I design Grid with AI</PostH2>
			<PostP>
				Grid’s console is designed in Figma first, in the rabtx design system file, and built by
				agents from those frames. The Figma file holds every product area as its own section (Home,
				Inbox, Threads, Composer, Board, Files, Terminals, Ship, Settings and more), and each screen
				exists four times: desktop at 1440 and phone at 390, light and dark. A separate States page
				draws the frames AI forgets: an empty inbox, a board that is reconnecting, a thread whose
				run failed, notes that are still loading.
			</PostP>
			<ol className="mt-8 grid gap-3 sm:grid-cols-2">
				{WORKFLOW.map((step, index) => (
					<li key={step.title} className="rounded-xl border border-border bg-card p-4 sm:p-5">
						<div className="flex items-center gap-3">
							<span className="inline-flex size-8 items-center justify-center rounded-lg bg-foreground/5 text-foreground/80">
								<HugeiconsIcon icon={step.icon} className="size-4" strokeWidth={1.5} />
							</span>
							<p className="font-semibold text-[15px]">
								<span className="mr-1.5 font-mono text-muted-foreground text-xs">{index + 1}</span>
								{step.title}
							</p>
						</div>
						<p className="mt-3 text-[14px] text-muted-foreground leading-6">{step.body}</p>
					</li>
				))}
			</ol>
			<PostP>
				The trick that makes this work is that the agent never starts from a blank file. It reads
				the frame, reads <PostCode>DESIGN.md</PostCode>, and assembles the screen from components
				that already carry the right sizes and states. Its job is composition, not invention, and
				composition is the part models are genuinely good at.
			</PostP>

			<PostH2 id="showcase">The showcase</PostH2>
			<PostP>
				These are real screenshots of the Grid console, not mockups. Switch the site theme with the
				toggle in the header to see each one in the other theme.
			</PostP>
			<div className="mt-8 space-y-10">
				<PostFigure
					dir={SHOTS}
					name="thread"
					alt="A Grid agent thread: the agent's commands and approvals inline, with run details on the right."
					caption="Agent thread. Chrome sits at low ink so the agent's work, the only full-contrast content, leads."
				/>
				<PostFigure
					dir={SHOTS}
					name="inbox"
					alt="The Grid inbox listing what agents need from you, newest first."
					caption="Inbox. What agents need from you, with the keyboard shortcuts (E, J, K) printed right where you need them."
				/>
				<div className="grid gap-10 md:grid-cols-2 md:gap-6">
					<PostFigure
						dir={SHOTS}
						name="model-picker"
						alt="The agent and model picker in Grid's composer, listing agents and models across providers."
						caption="Agent and model picker. Provider-agnostic by design: Claude Code, Codex, opencode and Antigravity in one list."
					/>
					<PostFigure
						dir={SHOTS}
						name="terminal"
						alt="A terminal session running inside the Grid console."
						caption="Terminal. A real terminal in the browser, in the same frame as everything else."
					/>
				</div>
				<PostFigure
					dir={SHOTS}
					name="files-edit"
					alt="Grid's file editor with a project's file tree beside an open file."
					caption="Files and editor. Same canvas, same ink, same radius ladder as every other screen."
				/>
				<div>
					<div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
						<PostFigure dir={SHOTS} frame="phone" name="m-home" alt="Grid home on a phone." />
						<PostFigure
							dir={SHOTS}
							frame="phone"
							name="m-board"
							alt="The Grid board on a phone, one column at a time."
						/>
						<PostFigure
							dir={SHOTS}
							frame="phone"
							name="m-thread"
							alt="An agent thread on a phone with the composer at the bottom."
						/>
						<PostFigure dir={SHOTS} frame="phone" name="m-inbox" alt="The Grid inbox on a phone." />
					</div>
					<p className="mt-3 text-[13px] text-muted-foreground leading-5">
						The same screens on a phone. Not a separate app: one component tree, phone layout by
						default, with 40px rows and the composer in thumb reach.
					</p>
				</div>
			</div>
			<PostH3>What to notice</PostH3>
			<PostList
				items={[
					"One accent colour across every screen, used only for focus, active and links.",
					"No cards inside cards. Surfaces are flat until something genuinely floats.",
					"Text never touches the edge of its container, at any width.",
					"Every icon is the same family at the same stroke.",
				]}
			/>

			<div className="mt-16">
				<CheatSheet />
			</div>
			<PostP>
				Use it as a starting point, not a law. The value is not these particular numbers; it is
				having numbers at all. Paste the sheet into your agent’s context and every button it draws
				will match the last one.
			</PostP>

			<PostH2 id="icons">Icons: Hugeicons, one stroke</PostH2>
			<PostP>
				Mixed icon sets are the fastest way to make a generated UI look generated. Grid uses
				Hugeicons everywhere, at a 1.5 stroke, sized 16px beside labels and 20px on their own, and
				icons at rest sit at 55% ink like the labels next to them.
			</PostP>
			<ul className="mt-6 grid grid-cols-4 gap-2 sm:grid-cols-8">
				{ICONS.map((item) => (
					<li
						key={item.name}
						className="flex flex-col items-center gap-2 rounded-xl border border-border bg-card px-2 py-4"
					>
						<HugeiconsIcon
							icon={item.icon}
							className="size-5 text-foreground/70"
							strokeWidth={1.5}
						/>
						<span className="text-[11px] text-muted-foreground">{item.name}</span>
					</li>
				))}
			</ul>
			<PostP>
				Tell your agent the family, the stroke and the size in the brief, and name the icon when it
				matters. A model left to choose will reach for whatever set it saw most in training.
			</PostP>

			<PostH2 id="takeaway">The takeaway</PostH2>
			<PostP>
				AI did not make design less important; it made the parts of design that cannot be generated
				the whole job. Write your system down, give numbers instead of adjectives, design the states
				first, and review every screen in both themes at the smallest width. The agents will handle
				the pixels.
			</PostP>
		</>
	);
}
