import type { JSX } from "@solidjs/web";
import { createSignal, For } from "solid-js";

import { APPEARANCE_LIMITS, appearance, type Theme, updateAppearance } from "@/lib/appearance";

import { AppPrototype } from "./design/app-prototype";
import { FeedbackSection, FormsSection, WorkSection } from "./design/more-sections";
import {
	Avatar,
	button,
	Popover,
	Stack,
	Grid,
	Heading,
	menuTrigger,
	RadiusScale,
	Row,
	Slider,
	Specimen,
	StatusDot,
	SurfaceSwatches,
	Text,
	UserMessage,
	Badge,
	BellIcon,
	BoardIcon,
	Breadcrumbs,
	Button,
	Card,
	ChatIcon,
	Checkbox,
	CheckIcon,
	Checklist,
	ChoicePrompt,
	ClockIcon,
	CodeBlock,
	ComputerIcon,
	CopyIcon,
	Count,
	DescriptionList,
	Dialog,
	EditIcon,
	EmptyState,
	ExternalIcon,
	Field,
	FileIcon,
	FolderIcon,
	GlobeIcon,
	HeaderTabs,
	IconButton,
	InboxIcon,
	Input,
	Kbd,
	Menu,
	MenuList,
	MoonIcon,
	MoreIcon,
	NavButton,
	NavLink,
	NoteIcon,
	Palette,
	Panel,
	PlusIcon,
	RunStatus,
	RunSteps,
	SearchIcon,
	SearchInput,
	Segmented,
	SettingsIcon,
	SignOutIcon,
	Skeleton,
	SunIcon,
	Switch,
	Table,
	Tabs,
	Td,
	TerminalIcon,
	Textarea,
	Th,
	Toasts,
	Tooltip,
	Tr,
	TrashIcon,
	UnfoldIcon,
	UserAddIcon,
	WorkspaceMark,
} from "@/kit";

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
				<Section
					title="App"
					note="A working miniature, built only from the kit: switch views, open threads, send a message and answer the agent."
				>
					<AppPrototype />
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
				<Section title="Feedback">
					<FeedbackSection />
				</Section>
				<Section title="Forms and settings">
					<FormsSection />
				</Section>
				<Section title="Work surfaces">
					<WorkSection />
				</Section>
			</main>
			<Toasts />
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
				<TweakPanel />
			</div>
		</header>
	);
}

/** Every knob of the system on one panel: roundness, spacing, lines, text size and the tint. */
function TweakPanel(): JSX.Element {
	const knob = (
		label: string,
		key: "radius" | "spacing" | "lines" | "uiScale" | "hue" | "saturation" | "darkLightness",
		format: (value: number) => string = (value) => String(value),
	) => (
		<Slider
			label={label}
			value={appearance()[key]}
			min={APPEARANCE_LIMITS[key].min}
			max={APPEARANCE_LIMITS[key].max}
			step={APPEARANCE_LIMITS[key].step}
			format={format}
			onChange={(value) => updateAppearance({ [key]: value })}
		/>
	);
	const times = (value: number) => `${value.toFixed(2)}×`;
	return (
		<Popover
			label="Tweak the design"
			placement="bottom-end"
			width="md:w-80"
			triggerClass={button({ size: "sm" })}
			trigger={
				<>
					<SettingsIcon size="sm" />
					Tweak
				</>
			}
		>
			{() => (
				<Stack gap={4} class="p-4">
					<Text size="caption" tone="subtle">
						These move the whole system at once and are kept on this device.
					</Text>
					{knob("Roundness", "radius", times)}
					{knob("Spacing", "spacing", times)}
					{knob("Lines", "lines", times)}
					{knob("Text size", "uiScale", (value) => `${Math.round(value * 100)}%`)}
					{knob("Hue", "hue")}
					{knob("Tint", "saturation", (value) => `${value}%`)}
					{knob("Dark background", "darkLightness", (value) => `${value}%`)}
					<Button
						size="sm"
						variant="ghost"
						onClick={() =>
							updateAppearance({
								radius: 1,
								spacing: 1,
								lines: 1,
								uiScale: 1,
								hue: 240,
								saturation: 0,
								darkLightness: 9,
							})
						}
					>
						Reset to the reference
					</Button>
				</Stack>
			)}
		</Popover>
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

/* ── App preview ──────────────────────────────────────────────────────────────────────────── */

const PROJECTS = [
	{ name: "web-app", open: true },
	{ name: "api", open: false },
	{ name: "mobile", open: false },
];

/* ── Foundations ──────────────────────────────────────────────────────────────────────────── */

function Foundations(): JSX.Element {
	return (
		<Grid columns={2}>
			<Specimen label="Text">
				<Text tone="strong">Strong: titles, values, what you are looking at</Text>
				<Text>Default: body text and labels</Text>
				<Text tone="subtle">Subtle: metadata, section labels, icons at rest</Text>
				<Text tone="faint">Faint: placeholders and disabled only</Text>
			</Specimen>
			<Specimen label="Type scale · Inter, regular and medium">
				<Heading level={1}>Display 24</Heading>
				<Heading level={2}>Headline 18</Heading>
				<Heading level={3}>Heading 16</Heading>
				<Text size="body-lg">Body large 14</Text>
				<Text>Body 13 — the base size of the console</Text>
				<Text size="caption" tone="subtle">
					Caption 12 — labels and metadata
				</Text>
			</Specimen>
			<Specimen label="Surfaces and fills">
				<SurfaceSwatches />
			</Specimen>
			<Specimen label="Signals and corners">
				<Row wrap>
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
				</Row>
				<RadiusScale />
			</Specimen>
		</Grid>
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
				<div class="surface-well p-1">
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
	const TRIGGER = menuTrigger();

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
						<StatusDot size="sm" status="waiting" />
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
					<Skeleton circle class="size-8" />
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
					<UserMessage>
						The login page loops back to itself after signing in. Find out why and fix it.
					</UserMessage>
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
