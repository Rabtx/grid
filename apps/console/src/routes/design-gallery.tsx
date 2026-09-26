import type { JSX } from "@solidjs/web";
import { createSignal, For } from "solid-js";

import { APPEARANCE_LIMITS, appearance, type Theme, updateAppearance } from "@/lib/appearance";
import {
	Avatar,
	Badge,
	Breadcrumbs,
	Button,
	Card,
	Checkbox,
	Checklist,
	ChoicePrompt,
	CodeBlock,
	Count,
	DescriptionList,
	Dialog,
	EmptyState,
	Field,
	HeaderTabs,
	IconButton,
	Input,
	Kbd,
	Menu,
	MenuList,
	NavButton,
	NavLink,
	NavSection,
	Palette,
	Panel,
	PROMPT_ADD,
	PROMPT_CHIP,
	PROMPT_FIELD,
	PromptBox,
	RunStatus,
	RunSteps,
	SearchInput,
	Segmented,
	SEND_BUTTON,
	Skeleton,
	Switch,
	Table,
	Tabs,
	Td,
	Textarea,
	Th,
	Tooltip,
	Tr,
	WorkspaceMark,
} from "@/kit";
import {
	AppsIcon,
	BellIcon,
	BoardIcon,
	BranchIcon,
	ChatIcon,
	CheckIcon,
	ChevronDownIcon,
	ClockIcon,
	ComputerIcon,
	CopyIcon,
	EditIcon,
	ExternalIcon,
	FileIcon,
	FolderIcon,
	GlobeIcon,
	HomeIcon,
	IdeaIcon,
	InboxIcon,
	MenuIcon,
	MicIcon,
	MoonIcon,
	MoreIcon,
	NoteIcon,
	PlusIcon,
	RocketIcon,
	SearchIcon,
	SendIcon,
	SettingsIcon,
	SidebarIcon,
	SignOutIcon,
	SunIcon,
	TerminalIcon,
	ToolIcon,
	TrashIcon,
	UnfoldIcon,
	UserAddIcon,
} from "@/ui";

const ICON = "size-4";

/** A link in the gallery that goes nowhere, so none of them reads as the current page. */
function demo(name: string) {
	return {
		href: `/design/demo/${name}`,
		onClick: (event: MouseEvent) => event.preventDefault(),
	};
}

/**
 * Grid's design system on one page: an app preview composed only of kit pieces, then every piece
 * in its states. Theme, hue and saturation at the top apply to the whole page, as they do in the
 * console. Open at `/design`.
 */
export function DesignGallery(): JSX.Element {
	return (
		<div class="min-h-dvh bg-surface-sunken font-kit text-fg">
			<Toolbar />
			<main class="mx-auto flex max-w-6xl flex-col gap-10 px-4 pt-6 pb-24 md:px-8">
				<Section title="App" note="The shell, home and composer, built only from the kit.">
					<AppPreview />
				</Section>
				<Section title="Foundations">
					<Foundations />
				</Section>
				<Section title="Actions">
					<Actions />
				</Section>
				<Section title="Inputs">
					<Inputs />
				</Section>
				<Section title="Navigation">
					<Navigation />
				</Section>
				<Section title="Menus and overlays">
					<Overlays />
				</Section>
				<Section title="Content">
					<Content />
				</Section>
				<Section title="Agent work">
					<AgentWork />
				</Section>
			</main>
		</div>
	);
}

function Toolbar(): JSX.Element {
	return (
		<header class="sticky top-0 z-40 border-line border-b bg-surface-sunken/90 backdrop-blur-md">
			<div class="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 md:px-8">
				<div class="flex items-center gap-2.5">
					<WorkspaceMark name="Grid" size="md" />
					<h1 class="font-medium text-heading">Design system</h1>
				</div>
				<span class="flex-1" />
				<Segmented<Theme>
					label="Theme"
					options={[
						{ value: "light", label: "Light", icon: <SunIcon class="size-3.5" /> },
						{ value: "dark", label: "Dark", icon: <MoonIcon class="size-3.5" /> },
						{ value: "system", label: "Auto", icon: <ComputerIcon class="size-3.5" /> },
					]}
					value={appearance().theme}
					onChange={(theme) => updateAppearance({ theme })}
				/>
				<Range
					label="Hue"
					value={appearance().hue}
					max={APPEARANCE_LIMITS.hue.max}
					onChange={(hue) => updateAppearance({ hue })}
				/>
				<Range
					label="Tint"
					value={appearance().saturation}
					max={APPEARANCE_LIMITS.saturation.max}
					onChange={(saturation) => updateAppearance({ saturation })}
				/>
			</div>
		</header>
	);
}

function Range(props: {
	label: string;
	value: number;
	max: number;
	onChange: (value: number) => void;
}): JSX.Element {
	return (
		<label class="flex items-center gap-2 text-caption text-fg-subtle">
			{props.label}
			<input
				type="range"
				min="0"
				max={props.max}
				value={props.value}
				onInput={(event) => props.onChange(Number(event.currentTarget.value))}
				class="w-24 accent-[var(--signal-accent)]"
			/>
			<span class="w-7 text-fg tabular-nums">{props.value}</span>
		</label>
	);
}

function Section(props: { title: string; note?: string; children: JSX.Element }): JSX.Element {
	return (
		<section class="flex flex-col gap-4">
			<div>
				<h2 class="font-medium text-headline">{props.title}</h2>
				{props.note ? <p class="text-body text-fg-subtle">{props.note}</p> : null}
			</div>
			{props.children}
		</section>
	);
}

function Specimen(props: { label: string; children: JSX.Element; class?: string }): JSX.Element {
	return (
		<Card class={`flex flex-col gap-3 p-4 ${props.class ?? ""}`}>
			<p class="text-caption text-fg-subtle">{props.label}</p>
			{props.children}
		</Card>
	);
}

/* ── App preview ──────────────────────────────────────────────────────────────────────────── */

const PROJECTS = [
	{ name: "web-app", color: "#6366f1", open: true },
	{ name: "api", color: "#10b981", open: false },
	{ name: "mobile", color: "#f59e0b", open: false },
];

const THREADS = ["Fix login redirect loop", "Add billing page", "Speed up the test suite"];

function AppPreview(): JSX.Element {
	const [view, setView] = createSignal<"home" | "activity">("home");
	const [draft, setDraft] = createSignal("");
	const [mode, setMode] = createSignal<"build" | "plan">("build");

	return (
		<div class="flex h-[40rem] overflow-hidden rounded-kit-xl bg-surface-sunken shadow-[0_0_0_1px_var(--kit-line-strong),0_8px_24px_-12px_rgb(0_0_0/0.08)]">
			<aside class="hidden w-60 shrink-0 flex-col md:flex">
				<div class="flex h-12 items-center gap-1 px-2">
					<button
						type="button"
						class="focus-ring flex h-8 min-w-0 flex-1 items-center gap-2 rounded-kit px-1.5 hover:bg-fill"
					>
						<WorkspaceMark name="Acme Labs" />
						<span class="truncate font-medium text-body">Acme Labs</span>
						<UnfoldIcon class="size-3.5 shrink-0 text-fg-faint" />
					</button>
					<IconButton label="Search" size="sm">
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
								count: 3,
							},
						]}
						value={view()}
						onChange={setView}
					/>
				</div>
				<div class="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-2">
					<div class="flex flex-col gap-px">
						<NavButton icon={<EditIcon class={ICON} />} label="New chat" current />
						<NavLink {...demo("1")} icon={<BoardIcon class={ICON} />} label="Board" />
						<NavLink {...demo("2")} icon={<TerminalIcon class={ICON} />} label="Terminal" />
						<NavLink
							{...demo("3")}
							icon={<AppsIcon class={ICON} />}
							label="Environments"
							trailing={<Badge tone="accent">New</Badge>}
						/>
					</div>
					<NavSection
						label="Projects"
						action={
							<IconButton label="Add project" size="sm" class="size-6!">
								<PlusIcon class="size-3.5" />
							</IconButton>
						}
					>
						<For each={PROJECTS}>
							{(project) => (
								<>
									<NavLink
										{...demo("4")}
										icon={<FolderIcon class={ICON} />}
										label={project.name}
										trailing={
											project.open ? undefined : <span class="text-caption text-fg-faint">2</span>
										}
									/>
									{project.open ? (
										<div class="ml-4 flex flex-col gap-px border-line border-l pl-2">
											<For each={THREADS}>
												{(thread, index) => (
													<NavLink
														{...demo("5")}
														label={thread}
														trailing={
															index() === 0 ? (
																<span class="size-1.5 rounded-full bg-accent" />
															) : undefined
														}
													/>
												)}
											</For>
										</div>
									) : null}
								</>
							)}
						</For>
					</NavSection>
				</div>
				<div class="flex flex-col gap-2 p-2">
					<button
						type="button"
						class="focus-ring flex h-9 items-center gap-2 rounded-kit bg-surface px-2.5 text-body shadow-[0_0_0_1px_var(--kit-line)] hover:bg-fill"
					>
						<RocketIcon class="size-4 text-accent" />
						<span class="flex-1 text-left">Getting started</span>
						<span class="text-caption text-fg-subtle">2 of 5</span>
					</button>
					<button
						type="button"
						class="focus-ring flex h-9 items-center gap-2 rounded-kit px-1.5 text-body hover:bg-fill"
					>
						<Avatar name="Sam Rivera" />
						<span class="flex-1 truncate text-left">Sam Rivera</span>
						<BellIcon class="size-4 text-fg-subtle" />
					</button>
				</div>
			</aside>
			<div class="flex min-w-0 flex-1 flex-col bg-surface md:border-line md:border-l">
				<header class="flex h-12 shrink-0 items-center gap-1 border-line border-b px-1.5 md:hidden">
					<IconButton label="Open navigation">
						<MenuIcon class="size-5" />
					</IconButton>
					<button
						type="button"
						class="focus-ring flex h-10 min-w-0 flex-1 items-center justify-center gap-2 rounded-kit"
					>
						<WorkspaceMark name="Acme Labs" />
						<span class="truncate font-medium text-body">web-app</span>
						<UnfoldIcon class="size-3.5 text-fg-faint" />
					</button>
					<IconButton label="New chat">
						<EditIcon class="size-5" />
					</IconButton>
				</header>
				<header class="hidden h-12 shrink-0 items-center gap-2 border-line border-b px-2 md:flex">
					<IconButton label="Hide sidebar" size="sm">
						<SidebarIcon class={ICON} />
					</IconButton>
					<HeaderTabs
						tabs={[
							{
								id: "1",
								label: "Fix login redirect loop",
								href: "#",
								icon: <ChatIcon class="size-3.5" />,
							},
							{
								id: "2",
								label: "Add billing page",
								href: "#",
								icon: <ChatIcon class="size-3.5" />,
							},
							{ id: "new", label: "New chat", href: "#", icon: <EditIcon class="size-3.5" /> },
						]}
						current="new"
						onClose={() => undefined}
						newHref="#"
						newLabel="New chat"
					/>
					<IconButton label="Toggle work panel" size="sm">
						<SidebarIcon class={`${ICON} -scale-x-100`} />
					</IconButton>
				</header>
				<div class="flex min-h-0 flex-1 flex-col items-center justify-end overflow-y-auto px-4 pb-6 md:justify-center md:pb-16">
					<div class="flex w-full max-w-2xl flex-col gap-6">
						<h3 class="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-center font-medium text-fg text-heading">
							What should we work on in
							<span class="inline-flex items-center gap-1.5 whitespace-nowrap">
								<span class="text-accent">
									<FolderIcon class="size-5" />
								</span>
								web-app
							</span>
						</h3>
						<PromptBox
							field={
								<textarea
									rows={2}
									aria-label="Message"
									placeholder="Ask anything, @ to add files, / for commands"
									value={draft()}
									onInput={(event) => setDraft(event.currentTarget.value)}
									class={PROMPT_FIELD}
								/>
							}
							tools={
								<>
									<button type="button" class={PROMPT_ADD} aria-label="Add">
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
									<button type="button" class={PROMPT_CHIP}>
										<span class="size-2 rounded-full bg-[#d97757]" />
										Opus 5.5
										<ChevronDownIcon class="size-3.5 text-fg-faint" />
									</button>
									<button
										type="button"
										aria-label="Dictate"
										class={`${PROMPT_CHIP} w-8 justify-center px-0`}
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
									class={SEND_BUTTON}
								>
									<SendIcon class={ICON} />
								</button>
							}
							tray={
								<>
									<span class="flex items-center gap-1.5">
										<FolderIcon class="size-3.5" />
										~/code/web-app
									</span>
									<span class="flex items-center gap-1.5">
										<BranchIcon class="size-3.5" />
										<span class="font-mono">main</span>
									</span>
									<span class="flex-1" />
									<span class="hidden items-center gap-1.5 md:flex">
										<ComputerIcon class="size-3.5" />
										This machine
									</span>
								</>
							}
						/>
						<ul class="flex flex-col gap-0.5 px-1">
							<For
								each={[
									{
										icon: <IdeaIcon class={ICON} />,
										text: "Explain how this project is organised",
									},
									{ icon: <ToolIcon class={ICON} />, text: "Find and fix a bug" },
									{ icon: <CheckIcon class={ICON} />, text: "Write tests for the recent changes" },
								]}
							>
								{(item) => (
									<li>
										<button
											type="button"
											onClick={() => setDraft(item.text)}
											class="focus-ring flex h-8 w-full items-center gap-2.5 rounded-kit px-2 text-body text-fg-muted hover:bg-fill hover:text-fg"
										>
											<span class="text-fg-subtle">{item.icon}</span>
											{item.text}
										</button>
									</li>
								)}
							</For>
						</ul>
					</div>
				</div>
			</div>
		</div>
	);
}

/* ── Foundations ──────────────────────────────────────────────────────────────────────────── */

function Foundations(): JSX.Element {
	return (
		<div class="grid gap-4 md:grid-cols-2">
			<Specimen label="Text">
				<p class="text-fg text-body">Strong: titles, values, what you are looking at</p>
				<p class="text-body text-fg-muted">Default: body text and labels</p>
				<p class="text-body text-fg-subtle">Subtle: metadata, section labels, icons at rest</p>
				<p class="text-body text-fg-faint">Faint: placeholders and disabled only</p>
			</Specimen>
			<Specimen label="Type scale · Inter, regular and medium">
				<p class="font-medium text-display">Display 24</p>
				<p class="font-medium text-headline">Headline 18</p>
				<p class="font-medium text-heading">Heading 16</p>
				<p class="text-body-lg">Body large 14</p>
				<p class="text-body">Body 13 — the base size of the console</p>
				<p class="text-caption text-fg-subtle">Caption 12 — labels and metadata</p>
			</Specimen>
			<Specimen label="Surfaces and lines">
				<div class="grid grid-cols-3 gap-2 text-caption">
					<Swatch class="bg-surface" label="Surface" />
					<Swatch class="bg-surface-sunken" label="Sunken" />
					<Swatch class="bg-surface-raised shadow-float" label="Raised" />
					<Swatch class="bg-fill" label="Fill · hover" />
					<Swatch class="bg-fill-strong" label="Fill · selected" />
					<Swatch class="bg-inverse text-inverse-fg" label="Inverse" />
				</div>
			</Specimen>
			<Specimen label="Signals · only for meaning">
				<div class="flex flex-wrap gap-2">
					<Badge tone="accent">Accent</Badge>
					<Badge tone="success" dot>
						Success
					</Badge>
					<Badge tone="warning" dot>
						Warning
					</Badge>
					<Badge tone="danger" dot>
						Danger
					</Badge>
					<Badge>Neutral</Badge>
				</div>
				<div class="flex items-end gap-3 pt-2">
					<For
						each={[
							"rounded-kit-sm",
							"rounded-kit",
							"rounded-kit-lg",
							"rounded-kit-xl",
							"rounded-kit-2xl",
						]}
					>
						{(radius) => (
							<div class="flex flex-col items-center gap-1">
								<span class={`size-10 bg-fill-strong ${radius}`} />
								<span class="text-micro text-fg-subtle">
									{radius.replace("rounded-kit", "r") || "r"}
								</span>
							</div>
						)}
					</For>
				</div>
			</Specimen>
		</div>
	);
}

function Swatch(props: { class: string; label: string }): JSX.Element {
	return (
		<div
			class={`flex h-16 items-end rounded-kit p-2 shadow-[inset_0_0_0_1px_var(--kit-line)] ${props.class}`}
		>
			{props.label}
		</div>
	);
}

/* ── Actions ──────────────────────────────────────────────────────────────────────────────── */

function Actions(): JSX.Element {
	return (
		<div class="grid gap-4 md:grid-cols-2">
			<Specimen label="Buttons">
				<div class="flex flex-wrap items-center gap-2">
					<Button variant="primary">Create workspace</Button>
					<Button>Cancel</Button>
					<Button variant="ghost">Dismiss</Button>
					<Button variant="accent" icon={<PlusIcon class={ICON} />}>
						New key
					</Button>
					<Button variant="danger" icon={<TrashIcon class={ICON} />}>
						Delete
					</Button>
				</div>
				<div class="flex flex-wrap items-center gap-2">
					<Button variant="primary" size="sm" kbd="↵">
						Submit
					</Button>
					<Button size="sm" kbd="Esc">
						Dismiss
					</Button>
					<Button size="lg" variant="primary">
						Continue
					</Button>
					<Button disabled>Disabled</Button>
				</div>
			</Specimen>
			<Specimen label="Icon buttons and hints">
				<div class="flex flex-wrap items-center gap-2">
					<Tooltip label="Search">
						<IconButton label="Search">
							<SearchIcon class={ICON} />
						</IconButton>
					</Tooltip>
					<IconButton label="Copy" variant="secondary">
						<CopyIcon class={ICON} />
					</IconButton>
					<IconButton label="More" size="sm">
						<MoreIcon class={ICON} />
					</IconButton>
					<span class="flex items-center gap-1">
						<Kbd>⌘</Kbd>
						<Kbd>K</Kbd>
					</span>
					<Count>3</Count>
					<Count quiet>12</Count>
				</div>
			</Specimen>
		</div>
	);
}

/* ── Inputs ───────────────────────────────────────────────────────────────────────────────── */

function Inputs(): JSX.Element {
	const [on, setOn] = createSignal(true);
	const [checked, setChecked] = createSignal(true);
	const [tab, setTab] = createSignal<"projects" | "people" | "agents">("projects");
	return (
		<div class="grid gap-4 md:grid-cols-2">
			<Specimen label="Fields">
				<Field label="Workspace name" hint="Your company or team.">
					{(id) => <Input id={id} placeholder="Acme Labs" />}
				</Field>
				<Field label="URL" error="That name is already taken">
					{(id) => <Input id={id} value="acme" aria-invalid="true" />}
				</Field>
				<SearchInput icon={<SearchIcon class={ICON} />} placeholder="Search projects" />
				<Field label="Notes">
					{(id) => <Textarea id={id} placeholder="Anything the agent should know" />}
				</Field>
			</Specimen>
			<Specimen label="Choices">
				<div class="flex items-center justify-between gap-3 text-body">
					Share this agent
					<Switch label="Share this agent" checked={on()} onChange={setOn} />
				</div>
				<div class="flex items-center gap-2.5 text-body">
					<Checkbox label="Remember this device" checked={checked()} onChange={setChecked} />
					Remember this device
				</div>
				<Tabs
					label="Search in"
					options={[
						{ value: "projects", label: "Projects" },
						{ value: "people", label: "People", count: 4 },
						{ value: "agents", label: "Agents" },
					]}
					value={tab()}
					onChange={setTab}
					class="border-line border-b"
				/>
				<Segmented
					label="Density"
					options={[
						{ value: "projects", label: "Compact" },
						{ value: "people", label: "Comfortable" },
						{ value: "agents", label: "Spacious" },
					]}
					value={tab()}
					onChange={setTab}
				/>
			</Specimen>
		</div>
	);
}

/* ── Navigation ───────────────────────────────────────────────────────────────────────────── */

function Navigation(): JSX.Element {
	return (
		<div class="grid gap-4 md:grid-cols-2">
			<Specimen label="Sidebar items" class="bg-surface-sunken">
				<div class="flex flex-col gap-px">
					<NavButton icon={<EditIcon class={ICON} />} label="New chat" current />
					<NavButton icon={<SearchIcon class={ICON} />} label="Search" trailing={<Kbd>⌘K</Kbd>} />
					<NavLink
						{...demo("6")}
						icon={<InboxIcon class={ICON} />}
						label="Activity"
						trailing={<Count>3</Count>}
					/>
					<NavLink {...demo("7")} icon={<ClockIcon class={ICON} />} label="Scheduled" />
					<NavLink
						{...demo("8")}
						icon={<GlobeIcon class={ICON} />}
						label="On Slack"
						trailing={<ExternalIcon class="size-3.5 text-fg-faint" />}
					/>
				</div>
			</Specimen>
			<Specimen label="Where you are">
				<Breadcrumbs
					items={[
						{ label: "Chat", href: "#", icon: <ChatIcon class="size-3.5" /> },
						{ label: "Fix login redirect loop" },
					]}
				/>
				<Breadcrumbs
					items={[
						{ label: "Settings", href: "#" },
						{ label: "Members", href: "#" },
						{ label: "Invites" },
					]}
				/>
				<div class="rounded-kit bg-surface-sunken p-1">
					<HeaderTabs
						tabs={[
							{ id: "a", label: "Board", href: "#", icon: <BoardIcon class="size-3.5" /> },
							{ id: "b", label: "Files", href: "#", icon: <FileIcon class="size-3.5" /> },
							{ id: "c", label: "Notes", href: "#", icon: <NoteIcon class="size-3.5" /> },
						]}
						current="a"
						onClose={() => undefined}
						newHref="#"
					/>
				</div>
			</Specimen>
		</div>
	);
}

/* ── Menus and overlays ───────────────────────────────────────────────────────────────────── */

function Overlays(): JSX.Element {
	const [dialog, setDialog] = createSignal(false);
	const [drawer, setDrawer] = createSignal(false);
	const [query, setQuery] = createSignal("");
	const [active, setActive] = createSignal<string | null>("web-app");
	const [tab, setTab] = createSignal<"all" | "projects" | "threads">("all");
	const TRIGGER =
		"focus-ring flex h-8 items-center gap-2 rounded-kit px-2 text-body hover:bg-fill aria-expanded:bg-fill-strong";

	return (
		<div class="grid gap-4 md:grid-cols-2">
			<Specimen label="Menus · anchored on desktop, a sheet on phones">
				<div class="flex flex-wrap gap-2">
					<Menu
						label="Workspace"
						triggerClass={TRIGGER}
						trigger={
							<>
								<WorkspaceMark name="Acme Labs" />
								Acme Labs
								<UnfoldIcon class="size-3.5 text-fg-faint" />
							</>
						}
						groups={[
							{
								label: "Workspaces",
								items: [
									{
										id: "acme",
										label: "Acme Labs",
										icon: <WorkspaceMark name="Acme Labs" size="xs" />,
										trailing: <CheckIcon class="size-4" />,
									},
									{
										id: "side",
										label: "Side project",
										icon: <WorkspaceMark name="Side project" size="xs" />,
									},
									{ id: "new", label: "Create workspace", icon: <PlusIcon class={ICON} /> },
								],
							},
							{
								items: [
									{
										id: "settings",
										label: "Workspace settings",
										icon: <SettingsIcon class={ICON} />,
									},
									{ id: "invite", label: "Invite members", icon: <UserAddIcon class={ICON} /> },
								],
							},
						]}
						onSelect={() => undefined}
					/>
					<Menu
						label="Account"
						triggerClass={TRIGGER}
						trigger={
							<>
								<Avatar name="Sam Rivera" size="sm" />
								Sam Rivera
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
								items: [
									{
										id: "settings",
										label: "Settings",
										icon: <SettingsIcon class={ICON} />,
										shortcut: "⌘,",
									},
									{ id: "theme", label: "Appearance", icon: <SunIcon class={ICON} /> },
								],
							},
							{ items: [{ id: "out", label: "Sign out", icon: <SignOutIcon class={ICON} /> }] },
						]}
						onSelect={() => undefined}
					/>
				</div>
				<Card class="max-w-64 p-0">
					<MenuList
						groups={[
							{
								items: [
									{ id: "rename", label: "Rename", icon: <EditIcon class={ICON} />, shortcut: "R" },
									{ id: "copy", label: "Copy link", icon: <CopyIcon class={ICON} /> },
								],
							},
							{
								items: [
									{ id: "delete", label: "Delete", icon: <TrashIcon class={ICON} />, danger: true },
								],
							},
						]}
						onSelect={() => undefined}
					/>
				</Card>
			</Specimen>
			<Specimen label="Dialogs · a sheet on phones">
				<div class="flex flex-wrap gap-2">
					<Button onClick={() => setDialog(true)}>Open dialog</Button>
					<Button onClick={() => setDrawer(true)}>Open drawer</Button>
				</div>
				<Dialog
					open={dialog()}
					onClose={() => setDialog(false)}
					title="Invite people"
					description="They join Acme Labs as members."
					footer={
						<>
							<Button variant="ghost" onClick={() => setDialog(false)}>
								Cancel
							</Button>
							<Button variant="primary" onClick={() => setDialog(false)}>
								Send invites
							</Button>
						</>
					}
				>
					<div class="flex flex-col gap-4">
						<Field label="Email addresses" hint="Separate several with commas.">
							{(id) => <Input id={id} placeholder="lee@acme.dev, kim@acme.dev" />}
						</Field>
						<div class="flex items-center justify-between text-body">
							Also create a link anyone can use
							<Switch label="Create a link" checked={false} onChange={() => undefined} />
						</div>
					</div>
				</Dialog>
				<Dialog
					open={drawer()}
					onClose={() => setDrawer(false)}
					kind="drawer"
					title="Create API key"
					description="A key for scripts and CI."
					footer={
						<>
							<Button variant="ghost" onClick={() => setDrawer(false)}>
								Cancel
							</Button>
							<Button variant="accent" onClick={() => setDrawer(false)}>
								Generate key
							</Button>
						</>
					}
				>
					<Card class="overflow-hidden">
						<DescriptionList
							items={[
								{ label: "Name", value: "CI deploys" },
								{
									label: "Owner",
									value: (
										<span class="flex items-center gap-1.5">
											<Avatar name="Sam" size="xs" />
											You
										</span>
									),
								},
								{
									label: "Permissions",
									value: (
										<span class="flex gap-1">
											<Badge>Invoke</Badge>
											<Badge>Read</Badge>
										</span>
									),
								},
								{ label: "Expiry", value: "Never" },
							]}
						/>
					</Card>
				</Dialog>
				<Card class="overflow-hidden p-0" raised>
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
						groupLabel="Projects"
						items={PROJECTS.map((project) => ({
							id: project.name,
							icon: <FolderIcon class={ICON} />,
							label: project.name,
							hint: `~/code/${project.name}`,
						}))}
						active={active()}
						onActive={setActive}
						onPick={() => undefined}
						detail={
							<div class="flex flex-col gap-3">
								<p class="flex items-center gap-2 font-medium text-body-lg">
									<FolderIcon class={ICON} />
									{active()}
								</p>
								<DescriptionList
									items={[
										{ label: "Folder", value: `~/code/${active()}` },
										{ label: "Threads", value: "3" },
									]}
								/>
							</div>
						}
					/>
				</Card>
			</Specimen>
		</div>
	);
}

/* ── Content ──────────────────────────────────────────────────────────────────────────────── */

const MEMBERS = [
	{ name: "Sam Rivera", email: "sam@acme.dev", role: "Owner", status: "Active" },
	{ name: "Lee Park", email: "lee@acme.dev", role: "Admin", status: "Active" },
	{ name: "Kim Osei", email: "kim@acme.dev", role: "Member", status: "Invited" },
];

function Content(): JSX.Element {
	const [selected, setSelected] = createSignal("Lee Park");
	return (
		<div class="grid gap-4 md:grid-cols-2">
			<Specimen label="Table" class="md:col-span-2">
				<Table>
					<thead>
						<tr>
							<Th>Name</Th>
							<Th>Role</Th>
							<Th>Status</Th>
							<Th align="right">Last active</Th>
						</tr>
					</thead>
					<tbody>
						<For each={MEMBERS}>
							{(member) => (
								<Tr selected={selected() === member.name} onClick={() => setSelected(member.name)}>
									<Td>
										<span class="flex items-center gap-2.5">
											<Avatar name={member.name} />
											<span class="flex flex-col leading-tight">
												<span class="text-fg">{member.name}</span>
												<span class="text-caption text-fg-subtle">{member.email}</span>
											</span>
										</span>
									</Td>
									<Td>{member.role}</Td>
									<Td>
										<Badge tone={member.status === "Active" ? "success" : "warning"}>
											{member.status}
										</Badge>
									</Td>
									<Td align="right">2h ago</Td>
								</Tr>
							)}
						</For>
					</tbody>
				</Table>
			</Specimen>
			<Panel title="3 items need your input" icon={<BellIcon class="size-3.5" />}>
				<div class="flex flex-col gap-2 p-3">
					<p class="flex items-center gap-2 text-body text-fg">
						<span class="size-1.5 rounded-full bg-warning" />
						Approve 3 changes to the login flow
					</p>
					<p class="text-caption text-fg-subtle">web-app · Fix login redirect loop</p>
					<div class="flex items-center gap-2 pt-1">
						<Button variant="primary" size="sm">
							Approve
						</Button>
						<Button size="sm">Review</Button>
						<span class="flex-1" />
						<Button variant="ghost" size="sm">
							Dismiss
						</Button>
					</div>
				</div>
			</Panel>
			<Card>
				<EmptyState
					icon={<FolderIcon class="size-5" />}
					title="No projects yet"
					description="A project is a folder on a machine. Its chats, terminals and board live inside it."
					action={
						<Button variant="primary" icon={<PlusIcon class={ICON} />}>
							Add project
						</Button>
					}
				/>
			</Card>
			<Specimen label="Loading">
				<div class="flex items-center gap-3">
					<Skeleton class="size-8 rounded-full" />
					<div class="flex flex-1 flex-col gap-2">
						<Skeleton class="h-3.5 w-1/2" />
						<Skeleton class="h-3 w-3/4" />
					</div>
				</div>
			</Specimen>
		</div>
	);
}

/* ── Agent work ───────────────────────────────────────────────────────────────────────────── */

function AgentWork(): JSX.Element {
	const [choice, setChoice] = createSignal<string | null>(null);
	return (
		<div class="grid gap-4 md:grid-cols-2">
			<Specimen label="A run">
				<div class="flex flex-col gap-3">
					<div class="self-end rounded-kit-lg bg-fill-strong px-3 py-2 text-body text-fg">
						The login page loops back to itself after signing in. Find out why and fix it.
					</div>
					<RunStatus status="running">Working for 1m 28s</RunStatus>
					<RunSteps
						summary="6 tools, edited 2 files, ran 1 command"
						elapsed="1m 28s"
						steps={[
							{
								id: "1",
								icon: <SearchIcon class="size-3.5" />,
								label: "Searched for redirect handling",
								meta: "grep",
								status: "done",
							},
							{
								id: "2",
								icon: <FileIcon class="size-3.5" />,
								label: "Read src/auth/login.tsx",
								meta: "file",
								status: "done",
							},
							{
								id: "3",
								icon: <TerminalIcon class="size-3.5" />,
								label: "Ran the auth tests",
								meta: "bun test",
								status: "done",
								detail: (
									<CodeBlock label="Output" code={"✓ 18 pass\n✗ 1 fail  redirects after sign-in"} />
								),
							},
							{
								id: "4",
								icon: <EditIcon class="size-3.5" />,
								label: "Editing src/auth/redirect.ts",
								meta: "+12 −4",
								status: "running",
							},
						]}
					/>
					<RunStatus status="error">Needs a fix</RunStatus>
					<Card class="flex flex-col gap-2 p-3">
						<p class="text-caption text-fg-subtle">The GitHub connection expired partway through</p>
						<p class="text-body">Everything gathered so far is saved.</p>
						<div class="flex gap-2">
							<Button variant="primary" size="sm">
								Reconnect
							</Button>
							<Button size="sm">Retry</Button>
						</div>
					</Card>
					<RunStatus status="waiting">Needs your input</RunStatus>
					<RunStatus status="done">Done</RunStatus>
				</div>
			</Specimen>
			<div class="flex flex-col gap-4">
				<ChoicePrompt
					question="What would you like to do?"
					options={["Run again", "Make changes to the agent", "Adjust schedule", "Type your own"]}
					onSubmit={(index) => setChoice(`Picked option ${index + 1}`)}
					onDismiss={() => setChoice("Dismissed")}
				/>
				{choice() ? <p class="text-caption text-fg-subtle">{choice()}</p> : null}
				<Checklist
					title="Getting started"
					items={[
						{ label: "Create your workspace", done: true },
						{ label: "Add a project folder", done: true },
						{ label: "Send your first message", done: false },
						{ label: "Invite a teammate", done: false },
						{ label: "Connect an environment", done: false },
					]}
				/>
			</div>
		</div>
	);
}
