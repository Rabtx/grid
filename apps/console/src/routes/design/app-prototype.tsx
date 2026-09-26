import type { JSX } from "@solidjs/web";
import { createEffect, createSignal, For, Match, Show, Switch } from "solid-js";

import { type Theme, updateAppearance } from "@/lib/appearance";
import {
	ActivityItem,
	AgentMessage,
	Avatar,
	BoardColumn,
	Button,
	ChoicePrompt,
	CodeBlock,
	Count,
	DescriptionList,
	Dialog,
	DiffCard,
	FileTree,
	HeaderTabs,
	IconButton,
	Kbd,
	Menu,
	NavButton,
	NavSection,
	notify,
	Palette,
	PROMPT_ADD,
	PROMPT_FIELD,
	PromptBox,
	RunStatus,
	type RunStep,
	RunSteps,
	SearchInput,
	Segmented,
	Select,
	SEND_BUTTON,
	TaskCard,
	type TaskStatusKind,
	TaskStatus,
	Toolbar,
	ToolbarButton,
	UserMessage,
	WorkspaceMark,
} from "@/kit";
import {
	BoardIcon,
	BranchIcon,
	ChatIcon,
	CheckIcon,
	ComputerIcon,
	EditIcon,
	FileIcon,
	FilterIcon,
	FolderIcon,
	HomeIcon,
	IdeaIcon,
	InboxIcon,
	MenuIcon,
	MicIcon,
	MoonIcon,
	PlusIcon,
	PullRequestIcon,
	SearchIcon,
	SendIcon,
	SettingsIcon,
	SidebarIcon,
	SignOutIcon,
	SortIcon,
	SunIcon,
	TerminalIcon,
	ToolIcon,
	UnfoldIcon,
	UserAddIcon,
} from "@/ui";

const ICON = "size-4";

type Thread = {
	id: string;
	project: string;
	title: string;
	prompt: string;
	steps: RunStep[];
	phase: "running" | "asking" | "done";
	elapsed: number;
};

type View = "home" | "activity" | "board" | "files" | "terminal" | { thread: string };

const PROJECTS = ["web-app", "api", "mobile"];

const SUGGESTIONS = [
	{ icon: () => <IdeaIcon class={ICON} />, text: "Explain how this project is organised" },
	{ icon: () => <ToolIcon class={ICON} />, text: "Find and fix the login redirect loop" },
	{ icon: () => <CheckIcon class={ICON} />, text: "Write tests for the recent changes" },
];

const SCRIPT: Omit<RunStep, "id" | "status">[] = [
	{
		icon: <SearchIcon class="size-3.5" />,
		label: "Searched the codebase for redirect handling",
		meta: "grep",
	},
	{ icon: <FileIcon class="size-3.5" />, label: "Read src/auth/login.tsx", meta: "file" },
	{ icon: <FileIcon class="size-3.5" />, label: "Read src/auth/redirect.ts", meta: "file" },
	{ icon: <TerminalIcon class="size-3.5" />, label: "Ran the auth tests", meta: "bun test" },
	{ icon: <EditIcon class="size-3.5" />, label: "Edited src/auth/redirect.ts", meta: "+12 −4" },
];

const TASKS: {
	id: string;
	title: string;
	status: TaskStatusKind;
	labels?: string[];
	assignee?: string;
	agent?: boolean;
}[] = [
	{ id: "WEB-12", title: "Billing page with plan picker", status: "todo", labels: ["frontend"] },
	{ id: "WEB-15", title: "Dark mode for the marketing site", status: "todo", assignee: "Lee Park" },
	{ id: "WEB-9", title: "Fix login redirect loop", status: "doing", agent: true },
	{
		id: "WEB-11",
		title: "Speed up the test suite",
		status: "doing",
		assignee: "Sam Rivera",
		labels: ["ci"],
	},
	{ id: "WEB-7", title: "Onboarding checklist", status: "review", labels: ["frontend", "growth"] },
	{ id: "WEB-3", title: "Set up error tracking", status: "done", assignee: "Kim Osei" },
];

const FILES = [
	{
		name: "src",
		children: [
			{ name: "auth", children: [{ name: "login.tsx" }, { name: "redirect.ts" }] },
			{ name: "app.tsx" },
			{ name: "main.tsx" },
		],
	},
	{ name: "package.json" },
	{ name: "README.md" },
];

/**
 * A working miniature of Grid built only from the kit: switch views, open and close threads,
 * send a message and watch a run play out, answer the agent, move around the board and files.
 * Nothing leaves the page; it exists to judge how the system feels in use.
 */
export function AppPrototype(): JSX.Element {
	const [view, setView] = createSignal<View>("home");
	const [project, setProject] = createSignal("web-app");
	const [threads, setThreads] = createSignal<Thread[]>([
		{
			id: "t1",
			project: "web-app",
			title: "Add billing page",
			prompt: "Add a billing page with a plan picker and invoices.",
			steps: SCRIPT.slice(0, 2).map((step, index) => ({
				...step,
				id: `s${index}`,
				status: "done",
			})),
			phase: "done",
			elapsed: 94,
		},
	]);
	const [tabs, setTabs] = createSignal<string[]>(["t1"]);
	const [drawer, setDrawer] = createSignal(false);
	const [palette, setPalette] = createSignal(false);
	const [sidebar, setSidebar] = createSignal(true);
	const [workspace, setWorkspace] = createSignal("Acme Labs");

	const threadId = () => {
		const current = view();
		return typeof current === "object" ? current.thread : null;
	};
	const thread = () => threads().find((item) => item.id === threadId()) ?? null;

	function go(next: View): void {
		setView(next);
		setDrawer(false);
	}

	function openThread(id: string): void {
		if (!tabs().includes(id)) setTabs([...tabs(), id]);
		go({ thread: id });
	}

	function closeTab(id: string): void {
		const rest = tabs().filter((tab) => tab !== id);
		setTabs(rest);
		if (threadId() === id) go(rest.length ? { thread: rest[rest.length - 1] } : "home");
	}

	function update(id: string, patch: (thread: Thread) => Partial<Thread>): void {
		setThreads((list) => list.map((item) => (item.id === id ? { ...item, ...patch(item) } : item)));
	}

	/** Start a thread and play a run: steps arrive one by one, then the agent asks. */
	function start(prompt: string): void {
		const id = `t${Date.now()}`;
		setThreads((list) => [
			...list,
			{
				id,
				project: project(),
				title: prompt.slice(0, 42),
				prompt,
				steps: [],
				phase: "running",
				elapsed: 0,
			},
		]);
		openThread(id);
		SCRIPT.forEach((step, index) => {
			setTimeout(
				() => {
					update(id, (current) => ({
						elapsed: current.elapsed + 11,
						steps: [
							...current.steps.map((done) => ({ ...done, status: "done" as const })),
							{ ...step, id: `s${index}`, status: "running" },
						],
					}));
				},
				700 * (index + 1),
			);
		});
		setTimeout(
			() =>
				update(id, (current) => ({
					phase: "asking",
					steps: current.steps.map((done) => ({ ...done, status: "done" as const })),
				})),
			700 * (SCRIPT.length + 1),
		);
	}

	const Sidebar = (): JSX.Element => (
		<nav aria-label="Prototype navigation" class="flex h-full min-h-0 flex-col">
			<div class="flex h-12 shrink-0 items-center gap-1 px-2">
				<Menu
					label="Workspace"
					width="md:w-64"
					triggerClass="focus-ring flex h-8 min-w-0 flex-1 items-center gap-2 rounded-kit px-1.5 hover:bg-fill aria-expanded:bg-fill-strong"
					trigger={
						<>
							<WorkspaceMark name={workspace()} />
							<span class="truncate font-medium text-body-lg">{workspace()}</span>
							<UnfoldIcon class="size-3.5 shrink-0 text-fg-faint" />
						</>
					}
					groups={[
						{
							label: "Workspaces",
							items: ["Acme Labs", "Side project"].map((name) => ({
								id: `ws:${name}`,
								label: name,
								icon: <WorkspaceMark name={name} size="xs" />,
								trailing: workspace() === name ? <CheckIcon class="size-4" /> : undefined,
							})),
						},
						{
							items: [
								{ id: "new", label: "Create workspace", icon: <PlusIcon class={ICON} /> },
								{ id: "invite", label: "Invite members", icon: <UserAddIcon class={ICON} /> },
								{
									id: "settings",
									label: "Workspace settings",
									icon: <SettingsIcon class={ICON} />,
								},
							],
						},
					]}
					onSelect={(id) => {
						if (id.startsWith("ws:")) {
							setWorkspace(id.slice(3));
							notify({ title: `Switched to ${id.slice(3)}` });
						} else
							notify({
								title: "Not in the prototype",
								description: "This opens a screen in the real app.",
							});
					}}
				/>
				<IconButton label="Search" size="sm" onClick={() => setPalette(true)}>
					<SearchIcon class={ICON} />
				</IconButton>
			</div>
			<div class="px-2 pb-3">
				<Segmented
					label="View"
					block
					options={[
						{ value: "home", label: "Home", icon: <HomeIcon class="size-3.5" /> },
						{
							value: "activity",
							label: "Activity",
							icon: <InboxIcon class="size-3.5" />,
							count: 2,
						},
					]}
					value={view() === "activity" ? "activity" : "home"}
					onChange={(next) => go(next)}
				/>
			</div>
			<div class="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-2 pb-2">
				<div class="flex flex-col gap-px">
					<NavButton
						icon={<EditIcon class={ICON} />}
						label="New chat"
						current={view() === "home"}
						onClick={() => go("home")}
					/>
					<NavButton
						icon={<BoardIcon class={ICON} />}
						label="Board"
						current={view() === "board"}
						onClick={() => go("board")}
					/>
					<NavButton
						icon={<FileIcon class={ICON} />}
						label="Files"
						current={view() === "files"}
						onClick={() => go("files")}
					/>
					<NavButton
						icon={<TerminalIcon class={ICON} />}
						label="Terminal"
						current={view() === "terminal"}
						onClick={() => go("terminal")}
					/>
				</div>
				<NavSection
					label="Projects"
					action={
						<IconButton
							label="Add project"
							size="sm"
							class="size-6!"
							onClick={() => notify({ title: "Pick a folder to add" })}
						>
							<PlusIcon class="size-3.5" />
						</IconButton>
					}
				>
					<For each={PROJECTS}>
						{(name) => (
							<>
								<NavButton
									icon={<FolderIcon class={ICON} />}
									label={name}
									trailing={
										<span class="text-caption text-fg-faint">
											{threads().filter((item) => item.project === name).length || ""}
										</span>
									}
									onClick={() => {
										setProject(name);
										go("home");
									}}
								/>
								<Show when={project() === name}>
									<div class="ml-4 flex flex-col gap-px pl-2">
										<For each={threads().filter((item) => item.project === name)}>
											{(item) => (
												<NavButton
													label={item.title}
													current={threadId() === item.id}
													onClick={() => openThread(item.id)}
													trailing={
														<Show when={item.phase !== "done"}>
															<span
																class={`size-1.5 rounded-full ${item.phase === "asking" ? "bg-warning" : "animate-pulse bg-accent"}`}
															/>
														</Show>
													}
												/>
											)}
										</For>
									</div>
								</Show>
							</>
						)}
					</For>
				</NavSection>
			</div>
			<div class="p-2">
				<Menu
					label="Account"
					placement="top-start"
					width="md:w-60"
					triggerClass="focus-ring flex h-9 w-full items-center gap-2 rounded-kit px-1.5 text-body-lg hover:bg-fill aria-expanded:bg-fill-strong"
					trigger={
						<>
							<Avatar name="Sam Rivera" />
							<span class="min-w-0 flex-1 truncate text-left">Sam Rivera</span>
						</>
					}
					header={
						<div class="flex items-center gap-2.5 px-2 py-2">
							<Avatar name="Sam Rivera" size="lg" />
							<div class="min-w-0">
								<p class="truncate font-medium text-body">Sam Rivera</p>
								<p class="truncate text-caption text-fg-subtle">sam@acme.dev</p>
							</div>
						</div>
					}
					groups={[
						{
							label: "Theme",
							items: [
								{ id: "light", label: "Light", icon: <SunIcon class={ICON} /> },
								{ id: "dark", label: "Dark", icon: <MoonIcon class={ICON} /> },
								{ id: "system", label: "Match system", icon: <ComputerIcon class={ICON} /> },
							],
						},
						{
							items: [
								{
									id: "settings",
									label: "Settings",
									icon: <SettingsIcon class={ICON} />,
									shortcut: "⌘,",
								},
								{ id: "out", label: "Sign out", icon: <SignOutIcon class={ICON} /> },
							],
						},
					]}
					onSelect={(id) => {
						if (id === "light" || id === "dark" || id === "system")
							updateAppearance({ theme: id as Theme });
						else
							notify({ title: id === "out" ? "Signed out (not really)" : "Settings opens here" });
					}}
				/>
			</div>
		</nav>
	);

	return (
		<div class="relative flex h-[42rem] overflow-hidden rounded-kit-xl bg-surface-sunken shadow-[0_0_0_1px_var(--kit-line-strong),0_8px_24px_-12px_rgb(0_0_0/0.08)] md:h-[44rem]">
			<Show when={sidebar()}>
				<aside class="hidden w-60 shrink-0 md:block">
					<Sidebar />
				</aside>
			</Show>
			<Dialog
				open={drawer()}
				onClose={() => setDrawer(false)}
				title="Navigation"
				kind="sidebar"
				bare
			>
				<Sidebar />
			</Dialog>
			<Dialog open={palette()} onClose={() => setPalette(false)} title="Search" bare width="40rem">
				<PaletteBody
					threads={threads()}
					onPick={(id) => {
						setPalette(false);
						if (PROJECTS.includes(id)) {
							setProject(id);
							go("home");
						} else openThread(id);
					}}
				/>
			</Dialog>

			<div
				class={`flex min-w-0 flex-1 flex-col bg-surface ${sidebar() ? "md:border-line md:border-l" : ""}`}
			>
				<header class="flex h-12 shrink-0 items-center gap-1 border-line border-b px-1.5 md:hidden">
					<IconButton label="Open navigation" onClick={() => setDrawer(true)}>
						<MenuIcon class="size-5" />
					</IconButton>
					<p class="min-w-0 flex-1 truncate text-center font-medium text-body-lg">
						{thread()?.title ?? (typeof view() === "string" ? TITLES[view() as string] : "")}
					</p>
					<IconButton label="New chat" onClick={() => go("home")}>
						<EditIcon class="size-5" />
					</IconButton>
				</header>
				<header class="hidden h-12 shrink-0 items-center gap-2 border-line border-b px-2 md:flex">
					<IconButton
						label={sidebar() ? "Hide sidebar" : "Show sidebar"}
						size="sm"
						onClick={() => setSidebar(!sidebar())}
					>
						<SidebarIcon class={ICON} />
					</IconButton>
					<HeaderTabs
						tabs={tabs().map((id) => ({
							id,
							label: threads().find((item) => item.id === id)?.title ?? "Thread",
							href: `#${id}`,
							icon: <ChatIcon class="size-3.5" />,
						}))}
						current={threadId()}
						onClose={closeTab}
						newHref="#new"
						newLabel="New chat"
					/>
				</header>
				<div class="flex min-h-0 flex-1 flex-col">
					<Switch>
						<Match when={view() === "home"}>
							<Home project={project()} onSend={start} />
						</Match>
						<Match when={thread()}>
							{(current) => (
								<ThreadView
									thread={current()}
									onAnswer={(index) => {
										update(current().id, () => ({ phase: "done" }));
										notify({
											title: index === 0 ? "Changes applied" : "Okay, noted",
											tone: "success",
										});
									}}
								/>
							)}
						</Match>
						<Match when={view() === "activity"}>
							<ActivityView onOpen={() => openThread("t1")} />
						</Match>
						<Match when={view() === "board"}>
							<BoardView />
						</Match>
						<Match when={view() === "files"}>
							<FilesView />
						</Match>
						<Match when={view() === "terminal"}>
							<TerminalView />
						</Match>
					</Switch>
				</div>
			</div>
			<HeaderTabRouter tabs={tabs()} onOpen={openThread} onNew={() => go("home")} />
		</div>
	);
}

const TITLES: Record<string, string> = {
	home: "New chat",
	activity: "Activity",
	board: "Board",
	files: "Files",
	terminal: "Terminal",
};

/** Header tabs are anchors (#id); this turns their clicks into prototype navigation. */
function HeaderTabRouter(props: {
	tabs: string[];
	onOpen: (id: string) => void;
	onNew: () => void;
}): JSX.Element {
	return (
		<span
			class="hidden"
			ref={(el) => {
				const root = el.parentElement;
				root?.addEventListener("click", (event) => {
					const link = (event.target as Element).closest(
						"a[href^='#']",
					) as HTMLAnchorElement | null;
					if (!link || !root.contains(link)) return;
					event.preventDefault();
					const id = link.getAttribute("href")?.slice(1) ?? "";
					if (id === "new") props.onNew();
					else if (props.tabs.includes(id)) props.onOpen(id);
				});
			}}
		/>
	);
}

function PaletteBody(props: { threads: Thread[]; onPick: (id: string) => void }): JSX.Element {
	const [query, setQuery] = createSignal("");
	const [tab, setTab] = createSignal<"all" | "projects" | "threads">("all");
	const items = () => {
		const q = query().toLowerCase();
		const projects = PROJECTS.map((name) => ({
			id: name,
			icon: <FolderIcon class={ICON} />,
			label: name,
			hint: "Project",
		}));
		const threads = props.threads.map((item) => ({
			id: item.id,
			icon: <ChatIcon class={ICON} />,
			label: item.title,
			hint: item.project,
		}));
		const all =
			tab() === "projects" ? projects : tab() === "threads" ? threads : [...projects, ...threads];
		return all.filter((item) => item.label.toLowerCase().includes(q));
	};
	const [active, setActive] = createSignal<string | null>("web-app");
	return (
		<Palette
			query={query()}
			onQuery={setQuery}
			tabs={[
				{ value: "all", label: "All" },
				{ value: "projects", label: "Projects" },
				{ value: "threads", label: "Threads" },
			]}
			tab={tab()}
			onTab={setTab}
			items={items()}
			active={active()}
			onActive={setActive}
			onPick={props.onPick}
			footer={
				<span class="flex items-center gap-1">
					<Kbd>Esc</Kbd> Close
				</span>
			}
		/>
	);
}

function Composer(props: {
	placeholder: string;
	onSend: (text: string) => void;
	tray?: JSX.Element;
}): JSX.Element {
	const [draft, setDraft] = createSignal("");
	const [mode, setMode] = createSignal<"build" | "plan">("build");
	const [model, setModel] = createSignal<"opus" | "sonnet" | "gpt">("opus");
	const send = () => {
		const text = draft().trim();
		if (!text) return;
		props.onSend(text);
		setDraft("");
	};
	return (
		<PromptBox
			field={
				<textarea
					rows={2}
					aria-label="Message"
					placeholder={props.placeholder}
					value={draft()}
					onInput={(event) => setDraft(event.currentTarget.value)}
					onKeyDown={(event) => {
						if (event.key === "Enter" && !event.shiftKey && matchMedia("(pointer: fine)").matches) {
							event.preventDefault();
							send();
						}
					}}
					class={PROMPT_FIELD}
				/>
			}
			tools={
				<>
					<button
						type="button"
						class={PROMPT_ADD}
						aria-label="Add files"
						onClick={() => notify({ title: "Attach files or @mention them" })}
					>
						<PlusIcon class={ICON} />
					</button>
					<span class="hidden md:inline-flex">
						<Segmented
							label="Mode"
							options={[
								{ value: "build", label: "Build" },
								{ value: "plan", label: "Plan" },
							]}
							value={mode()}
							onChange={setMode}
						/>
					</span>
				</>
			}
			options={
				<>
					<Select
						label="Model"
						look="chip"
						placement="top-end"
						value={model()}
						onChange={setModel}
						groups={[
							{
								label: "Claude Code",
								options: [
									{
										value: "opus",
										label: "Opus 5.5",
										description: "Most capable, for hard problems",
										icon: <span class="size-2 rounded-full bg-[#d97757]" />,
									},
									{
										value: "sonnet",
										label: "Sonnet 5",
										description: "Fast and strong for everyday work",
										icon: <span class="size-2 rounded-full bg-[#d97757]" />,
									},
								],
							},
							{
								label: "Codex",
								options: [
									{
										value: "gpt",
										label: "GPT-5.6",
										description: "OpenAI's coding model",
										icon: <span class="size-2 rounded-full bg-fg" />,
									},
								],
							},
						]}
					/>
					<button
						type="button"
						aria-label="Dictate"
						class="focus-ring grid size-7 shrink-0 place-items-center rounded-kit text-fg-subtle hover:bg-fill hover:text-fg pointer-coarse:size-10"
					>
						<MicIcon class={ICON} />
					</button>
				</>
			}
			send={
				<button
					type="button"
					aria-label="Send"
					disabled={!draft().trim()}
					onClick={send}
					class={SEND_BUTTON}
				>
					<SendIcon class={ICON} />
				</button>
			}
			tray={props.tray}
		/>
	);
}

function Tray(props: { project: string }): JSX.Element {
	return (
		<>
			<span class="flex min-w-0 items-center gap-1.5">
				<FolderIcon class="size-3.5 shrink-0" />
				<span class="truncate">~/code/{props.project}</span>
			</span>
			<span class="flex items-center gap-1.5">
				<BranchIcon class="size-3.5" />
				<span class="font-mono text-caption">main</span>
			</span>
			<span class="flex-1" />
			<span class="hidden items-center gap-1.5 md:flex">
				<ComputerIcon class="size-3.5" />
				This machine
			</span>
		</>
	);
}

function Home(props: { project: string; onSend: (text: string) => void }): JSX.Element {
	return (
		<div class="flex min-h-0 flex-1 flex-col items-center justify-end overflow-y-auto px-4 pb-5 md:justify-center md:pb-16">
			<div class="flex w-full max-w-2xl flex-col gap-5">
				<h3 class="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-center font-medium text-fg text-heading">
					What should we work on in
					<span class="inline-flex items-center gap-1.5 whitespace-nowrap">
						<span class="text-accent">
							<FolderIcon class="size-5" />
						</span>
						{props.project}
					</span>
				</h3>
				<ul class="order-none flex gap-2 overflow-x-auto [scrollbar-width:none] md:order-last md:flex-col md:gap-0.5 md:px-1">
					<For each={SUGGESTIONS}>
						{(item) => (
							<li class="shrink-0">
								<button
									type="button"
									onClick={() => props.onSend(item.text)}
									class="focus-ring flex h-9 items-center gap-2.5 whitespace-nowrap rounded-full px-3 text-body text-fg-muted shadow-[inset_0_0_0_1px_var(--kit-line-strong)] hover:bg-fill hover:text-fg md:h-8 md:w-full md:rounded-kit md:px-2 md:shadow-none"
								>
									<span class="text-fg-subtle">{item.icon()}</span>
									{item.text}
								</button>
							</li>
						)}
					</For>
				</ul>
				<Composer
					placeholder="Ask anything, @ to add files, / for commands"
					onSend={props.onSend}
					tray={<Tray project={props.project} />}
				/>
			</div>
		</div>
	);
}

function ThreadView(props: { thread: Thread; onAnswer: (index: number) => void }): JSX.Element {
	let scroller: HTMLDivElement | undefined;
	// Follow the run as it grows, the way a live transcript does.
	createEffect(
		() => [props.thread.steps.length, props.thread.phase],
		() => {
			requestAnimationFrame(() =>
				scroller?.scrollTo({ top: scroller.scrollHeight, behavior: "smooth" }),
			);
		},
	);
	return (
		<>
			<div
				ref={(el) => {
					scroller = el;
				}}
				class="min-h-0 flex-1 overflow-y-auto px-4 py-6"
			>
				<div class="mx-auto flex max-w-2xl flex-col gap-5">
					<UserMessage>{props.thread.prompt}</UserMessage>
					<Show when={props.thread.phase === "running"}>
						<RunStatus status="running">Working for {props.thread.elapsed}s</RunStatus>
					</Show>
					<Show when={props.thread.steps.length}>
						<RunSteps
							summary={`${props.thread.steps.length} steps · edited 1 file · ran 1 command`}
							elapsed={`${props.thread.elapsed}s`}
							steps={props.thread.steps.map((step) =>
								step.meta === "bun test"
									? {
											...step,
											detail: (
												<CodeBlock
													label="Output"
													code={"✓ 18 pass\n✗ 1 fail  redirects after sign-in"}
												/>
											),
										}
									: step,
							)}
						/>
					</Show>
					<Show when={props.thread.phase !== "running"}>
						<AgentMessage
							actions={
								<>
									<IconButton label="Copy" size="sm" onClick={() => notify({ title: "Copied" })}>
										<FileIcon class="size-3.5" />
									</IconButton>
									<IconButton
										label="Open pull request"
										size="sm"
										onClick={() => notify({ title: "Pull request opened", tone: "success" })}
									>
										<PullRequestIcon class="size-3.5" />
									</IconButton>
								</>
							}
						>
							<p>
								The loop came from <code>redirect.ts</code> sending signed-in users back to{" "}
								<code>/login</code> when the session cookie arrived after the first render. It now
								waits for the session before deciding.
							</p>
						</AgentMessage>
						<DiffCard
							path="src/auth/redirect.ts"
							lines={[
								{ kind: "context", text: "export function nextPath(session) {" },
								{ kind: "remove", text: "  if (!session) return '/login';" },
								{ kind: "add", text: "  if (session === undefined) return null;" },
								{ kind: "add", text: "  if (!session) return '/login';" },
								{ kind: "context", text: "  return session.next ?? '/';" },
							]}
						/>
					</Show>
					<Show when={props.thread.phase === "asking"}>
						<RunStatus status="waiting">Needs your input</RunStatus>
						<ChoicePrompt
							question="Apply these changes?"
							options={[
								"Apply and run the tests",
								"Apply without testing",
								"Show me the full diff first",
								"Type your own",
							]}
							onSubmit={props.onAnswer}
							onDismiss={() => props.onAnswer(-1)}
						/>
					</Show>
					<Show when={props.thread.phase === "done"}>
						<RunStatus status="done">Done in {props.thread.elapsed}s</RunStatus>
					</Show>
				</div>
			</div>
			<div class="shrink-0 px-4 pb-4">
				<div class="mx-auto max-w-2xl">
					<Composer
						placeholder="Reply, or ask for changes…"
						onSend={() => notify({ title: "Follow-up sent" })}
						tray={<Tray project={props.thread.project} />}
					/>
				</div>
			</div>
		</>
	);
}

function PageHeader(props: {
	title: string;
	description?: string;
	actions?: JSX.Element;
}): JSX.Element {
	return (
		<div class="flex items-end justify-between gap-3">
			<div>
				<h3 class="font-medium text-fg text-headline">{props.title}</h3>
				<Show when={props.description}>
					<p class="text-body text-fg-subtle">{props.description}</p>
				</Show>
			</div>
			{props.actions}
		</div>
	);
}

function ActivityView(props: { onOpen: () => void }): JSX.Element {
	const [items, setItems] = createSignal(["approve", "input", "done"]);
	const remove = (id: string, title: string) => {
		setItems(items().filter((item) => item !== id));
		notify({ title, tone: "success" });
	};
	return (
		<div class="min-h-0 flex-1 overflow-y-auto px-4 py-6 md:px-8">
			<div class="mx-auto flex max-w-2xl flex-col gap-5">
				<PageHeader title="Activity" description="What needs you, and what moved." />
				<div class="divide-y divide-line overflow-hidden rounded-kit-lg shadow-[inset_0_0_0_1px_var(--kit-line)]">
					<Show when={items().includes("approve")}>
						<ActivityItem
							unread
							icon={<PullRequestIcon class={ICON} />}
							title="Approve 3 changes to the login flow"
							meta="web-app · Fix login redirect loop"
							time="2m"
							actions={
								<>
									<Button
										variant="primary"
										size="sm"
										onClick={() => remove("approve", "Changes approved")}
									>
										Approve
									</Button>
									<Button size="sm" onClick={props.onOpen}>
										Review
									</Button>
								</>
							}
						/>
					</Show>
					<Show when={items().includes("input")}>
						<ActivityItem
							unread
							icon={<ChatIcon class={ICON} />}
							title="Which plans should the billing page offer?"
							meta="web-app · Add billing page"
							time="18m"
							actions={
								<Button size="sm" onClick={() => remove("input", "Answered")}>
									Answer
								</Button>
							}
						/>
					</Show>
					<Show when={items().includes("done")}>
						<ActivityItem
							icon={<CheckIcon class={ICON} />}
							title="Test suite runs 40% faster"
							meta="api · Speed up the test suite"
							time="1h"
						/>
					</Show>
				</div>
			</div>
		</div>
	);
}

function BoardView(): JSX.Element {
	const [open, setOpen] = createSignal<(typeof TASKS)[number] | null>(null);
	const columns: TaskStatusKind[] = ["todo", "doing", "review", "done"];
	return (
		<div class="flex min-h-0 flex-1 flex-col">
			<div class="px-4 pt-5 pb-3 md:px-6">
				<Toolbar
					actions={
						<Button
							variant="primary"
							size="sm"
							icon={<PlusIcon class="size-3.5" />}
							onClick={() => notify({ title: "New task" })}
						>
							New task
						</Button>
					}
				>
					<SearchInput
						icon={<SearchIcon class="size-3.5" />}
						placeholder="Search tasks"
						class="w-full max-w-56"
					/>
					<ToolbarButton icon={<FilterIcon class="size-3.5" />}>Filter</ToolbarButton>
					<ToolbarButton icon={<SortIcon class="size-3.5" />}>Sort</ToolbarButton>
				</Toolbar>
			</div>
			<div class="flex min-h-0 flex-1 gap-3 overflow-x-auto px-4 pb-4 md:px-6">
				<For each={columns}>
					{(status) => (
						<BoardColumn
							status={status}
							count={TASKS.filter((task) => task.status === status).length}
							action={
								<IconButton label="Add task" size="sm" class="size-6!">
									<PlusIcon class="size-3.5" />
								</IconButton>
							}
						>
							<For each={TASKS.filter((task) => task.status === status)}>
								{(task) => <TaskCard {...task} onClick={() => setOpen(task)} />}
							</For>
						</BoardColumn>
					)}
				</For>
			</div>
			<Dialog
				open={open() !== null}
				onClose={() => setOpen(null)}
				kind="drawer"
				title={open()?.title ?? ""}
				width="30rem"
			>
				<Show when={open()}>
					{(task) => (
						<div class="flex flex-col gap-4">
							<div class="flex items-center gap-2 text-body text-fg-subtle">
								<TaskStatus status={task().status} />
								<span class="font-mono">{task().id}</span>
							</div>
							<div class="overflow-hidden rounded-kit-lg shadow-[inset_0_0_0_1px_var(--kit-line)]">
								<DescriptionList
									items={[
										{ label: "Project", value: "web-app" },
										{
											label: "Assignee",
											value: task().assignee ?? (task().agent ? "Claude Code" : "Unassigned"),
										},
										{ label: "Labels", value: task().labels?.join(", ") || "None" },
									]}
								/>
							</div>
							<Button
								variant="primary"
								icon={<ChatIcon class={ICON} />}
								onClick={() => notify({ title: "Thread started from the task" })}
							>
								Start a thread
							</Button>
						</div>
					)}
				</Show>
			</Dialog>
		</div>
	);
}

function FilesView(): JSX.Element {
	const [file, setFile] = createSignal("src/auth/redirect.ts");
	return (
		<div class="flex min-h-0 flex-1">
			<div class="hidden w-56 shrink-0 overflow-y-auto border-line border-r p-2 md:block">
				<FileTree nodes={FILES} selected={file()} onSelect={setFile} />
			</div>
			<div class="min-w-0 flex-1 overflow-y-auto p-4">
				<p class="mb-3 flex items-center gap-2 font-mono text-caption text-fg-subtle">
					<FileIcon class="size-3.5" />
					{file()}
				</p>
				<CodeBlock
					label="TypeScript"
					code={
						"export function nextPath(session) {\n  if (session === undefined) return null;\n  if (!session) return '/login';\n  return session.next ?? '/';\n}"
					}
				/>
			</div>
		</div>
	);
}

// A terminal is always dark, whatever the theme, like a real one.
const TERM = { text: "#d4d4d4", green: "#7fd88f", blue: "#7aa2f7", dim: "#8b8b8b" };

function Prompt(): JSX.Element {
	return (
		<>
			<span style={{ color: TERM.green }}>sam@acme</span>:
			<span style={{ color: TERM.blue }}>~/code/web-app</span>$
		</>
	);
}

function TerminalView(): JSX.Element {
	return (
		<div
			class="flex min-h-0 flex-1 flex-col bg-[#161616] p-4 font-mono text-caption leading-6"
			style={{ color: TERM.text }}
		>
			<p>
				<Prompt /> bun test
			</p>
			<p style={{ color: TERM.dim }}>bun test v1.4.2</p>
			<p>
				<span style={{ color: TERM.green }}>✓</span> 19 pass
			</p>
			<p>
				<Prompt /> <span class="animate-pulse">▍</span>
			</p>
			<p class="mt-auto flex items-center gap-2" style={{ color: TERM.dim }}>
				<Count quiet>2</Count> terminals on this machine
			</p>
		</div>
	);
}
