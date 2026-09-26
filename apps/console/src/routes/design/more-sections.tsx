import type { JSX } from "@solidjs/web";
import { createSignal, For } from "solid-js";

import {
	ActivityItem,
	ListCard,
	Row,
	Stack,
	WorkspacePreview,
	AgentMessage,
	Alert,
	AvatarGroup,
	Badge,
	Banner,
	BoardColumn,
	Button,
	Card,
	ChatIcon,
	CheckIcon,
	ComputerIcon,
	ConfirmDialog,
	CopyField,
	DiffCard,
	DropZone,
	Field,
	FileTree,
	FilterChip,
	FilterIcon,
	GlobeIcon,
	Input,
	KeyIcon,
	LinkIcon,
	notify,
	Pagination,
	PlusIcon,
	ProgressBar,
	PullRequestIcon,
	RadioCards,
	SearchIcon,
	SearchInput,
	Select,
	SettingsGroup,
	SettingsRow,
	Slider,
	SortIcon,
	Spinner,
	SplitLayout,
	StatusDot,
	Stepper,
	Switch,
	TaskCard,
	TerminalIcon,
	Toolbar,
	ToolbarButton,
	TrashIcon,
	UsageBar,
	UserIcon,
	UserMessage,
} from "@/kit";

function Specimen(props: { label: string; children: JSX.Element; class?: string }): JSX.Element {
	return (
		<Card class={`flex flex-col gap-3 p-4 ${props.class ?? ""}`}>
			<p class="text-caption text-fg-subtle">{props.label}</p>
			{props.children}
		</Card>
	);
}

/* ── Feedback ─────────────────────────────────────────────────────────────────────────────── */

export function FeedbackSection(): JSX.Element {
	const [confirm, setConfirm] = createSignal(false);
	return (
		<div class="grid gap-4 md:grid-cols-2">
			<Specimen label="Alerts">
				<Alert tone="accent" title="A new version of Grid is ready">
					Reload to get it. Your chats keep running.
				</Alert>
				<Alert
					tone="warning"
					title="The runner on this machine is offline"
					action={
						<Button size="sm" variant="secondary">
							Reconnect
						</Button>
					}
				>
					Chats and terminals pause until it is back.
				</Alert>
				<Alert tone="danger" title="Could not push to origin" onDismiss={() => undefined}>
					The branch is protected. Open a pull request instead.
				</Alert>
				<Alert tone="success" title="Workspace created" />
			</Specimen>
			<Specimen label="Toasts, confirm, banner">
				<div class="flex flex-wrap gap-2">
					<Button onClick={() => notify({ title: "Link copied" })}>Plain toast</Button>
					<Button
						onClick={() =>
							notify({
								title: "Invite sent",
								description: "lee@acme.dev can join now.",
								tone: "success",
							})
						}
					>
						Success
					</Button>
					<Button
						onClick={() =>
							notify({
								title: "Could not save the note",
								tone: "danger",
								action: { label: "Retry", run: () => notify({ title: "Saved", tone: "success" }) },
							})
						}
					>
						With action
					</Button>
					<Button
						variant="danger"
						icon={<TrashIcon class="size-4" />}
						onClick={() => setConfirm(true)}
					>
						Delete project
					</Button>
				</div>
				<ConfirmDialog
					open={confirm()}
					onClose={() => setConfirm(false)}
					onConfirm={() => notify({ title: "Project removed" })}
					title="Remove web-app?"
					description="Its chats and board leave Grid. The folder on your machine is not touched."
					confirm="Remove project"
					danger
				/>
				<Card clip>
					<Banner
						action={
							<button type="button" class="font-medium underline underline-offset-2">
								Reload
							</button>
						}
					>
						Grid was updated.
					</Banner>
				</Card>
			</Specimen>
			<Specimen label="Progress and status">
				<div class="flex items-center gap-4">
					<Spinner />
					<span class="flex items-center gap-1.5 text-body">
						<StatusDot status="online" /> Online
					</span>
					<span class="flex items-center gap-1.5 text-body">
						<StatusDot status="running" /> Running
					</span>
					<span class="flex items-center gap-1.5 text-body">
						<StatusDot status="busy" /> Busy
					</span>
					<span class="flex items-center gap-1.5 text-body">
						<StatusDot status="offline" /> Offline
					</span>
				</div>
				<ProgressBar value={0.42} label="Indexing" />
				<div class="flex flex-col gap-1.5">
					<div class="flex items-baseline justify-between text-body">
						<span>Agent minutes</span>
						<span class="text-fg-subtle tabular-nums">740 of 1,000</span>
					</div>
					<UsageBar value={0.74} label="Agent minutes used" />
				</div>
			</Specimen>
			<Specimen label="People">
				<div class="flex items-center gap-3">
					<AvatarGroup names={["Sam Rivera", "Lee Park", "Kim Osei", "Ana Ruiz", "Tom Beck"]} />
					<span class="text-body text-fg-subtle">5 members</span>
				</div>
				<div class="flex flex-wrap gap-2">
					<Badge tone="success" dot>
						Active
					</Badge>
					<Badge tone="warning" dot>
						Invited
					</Badge>
					<Badge>Member</Badge>
					<Badge tone="accent">Owner</Badge>
				</div>
			</Specimen>
		</div>
	);
}

/* ── Forms and settings ───────────────────────────────────────────────────────────────────── */

export function FormsSection(): JSX.Element {
	const [role, setRole] = createSignal<"member" | "admin" | "owner">("member");
	const [where, setWhere] = createSignal<"local" | "docker" | "ssh">("local");
	const [scale, setScale] = createSignal(100);
	const [notifications, setNotifications] = createSignal(true);
	const [step, setStep] = createSignal(1);
	return (
		<div class="grid gap-4 md:grid-cols-2">
			<Specimen label="Select">
				<Field label="Role">
					{() => (
						<Select
							label="Role"
							value={role()}
							onChange={setRole}
							groups={[
								{
									options: [
										{
											value: "member",
											label: "Member",
											description: "Works in projects and chats",
										},
										{
											value: "admin",
											label: "Admin",
											description: "Also manages members and settings",
										},
										{
											value: "owner",
											label: "Owner",
											description: "Everything, including billing",
											tag: <Badge tone="accent">1 max</Badge>,
										},
									],
								},
							]}
						/>
					)}
				</Field>
				<Slider
					label="Interface scale"
					value={scale()}
					min={50}
					max={200}
					step={10}
					onChange={setScale}
					format={(value) => `${value}%`}
				/>
			</Specimen>
			<Specimen label="Radio cards">
				<RadioCards
					label="Where it runs"
					value={where()}
					onChange={setWhere}
					options={[
						{
							value: "local",
							label: "This machine",
							description: "Fastest; uses your folders and tools.",
							icon: <ComputerIcon class="size-4" />,
						},
						{
							value: "docker",
							label: "Docker",
							description: "A clean container per project.",
							icon: <TerminalIcon class="size-4" />,
						},
						{
							value: "ssh",
							label: "Remote over SSH",
							description: "A VPS or a Codespace.",
							icon: <GlobeIcon class="size-4" />,
						},
					]}
				/>
			</Specimen>
			<div class="flex flex-col gap-6 md:col-span-2">
				<SettingsGroup
					title="Workspace"
					description="How Acme Labs looks and who can join."
					action={
						<Button size="sm" variant="primary">
							Save
						</Button>
					}
				>
					<SettingsRow label="Name" description="Shown in the switcher and on invites.">
						<Input value="Acme Labs" class="md:w-64" />
					</SettingsRow>
					<SettingsRow label="Invite link" description="Anyone with it joins as a member.">
						<div class="w-full md:w-80">
							<CopyField
								label="invite link"
								value="https://grid.acme.dev/invite/Kx7…"
								icon={<LinkIcon class="size-4" />}
							/>
						</div>
					</SettingsRow>
					<SettingsRow
						label="Push notifications"
						description="When an agent needs you or finishes."
						inline
					>
						<Switch
							label="Push notifications"
							checked={notifications()}
							onChange={setNotifications}
						/>
					</SettingsRow>
					<SettingsRow
						label="Delete workspace"
						description="Removes its projects, chats and members for everyone."
					>
						<Button variant="danger" size="sm">
							Delete workspace
						</Button>
					</SettingsRow>
				</SettingsGroup>
			</div>
			<Specimen label="Steps · a drawer's left rail">
				<Row gap={4} align="start" wrap>
					<Stack class="w-48">
						<Stepper
							steps={["Details", "Review", "Secret key"]}
							current={step()}
							onStep={setStep}
						/>
					</Stack>
					<div class="flex flex-col gap-3">
						<p class="text-body text-fg-muted">Step {step() + 1} of 3</p>
						<div class="flex gap-2">
							<Button size="sm" disabled={step() === 0} onClick={() => setStep(step() - 1)}>
								Back
							</Button>
							<Button
								size="sm"
								variant="primary"
								disabled={step() === 2}
								onClick={() => setStep(step() + 1)}
							>
								Continue
							</Button>
						</div>
					</div>
				</Row>
			</Specimen>
			<Specimen label="Upload">
				<DropZone
					label="Drop files, or click to choose"
					hint="Images, PDFs and text, up to 20 MB"
					onFiles={(files) =>
						notify({ title: `${files.length} file${files.length === 1 ? "" : "s"} added` })
					}
				/>
			</Specimen>
			<Specimen label="Onboarding · form beside a preview" class="md:col-span-2">
				<div class="surface-well p-4 md:p-8">
					<div class="mx-auto flex justify-center">
						<SplitLayout aside={<WorkspacePreview name="Acme Labs" slug="acme-labs" />}>
							<div>
								<h3 class="font-medium text-headline">Create your workspace</h3>
								<p class="text-body text-fg-subtle">
									Your company or team. You can invite people next.
								</p>
							</div>
							<Field label="Workspace name">{(id) => <Input id={id} value="Acme Labs" />}</Field>
							<Field label="URL" hint="Links look like /acme-labs/board">
								{(id) => <Input id={id} value="acme-labs" />}
							</Field>
							<Button variant="primary" size="lg" class="w-full">
								Continue
							</Button>
						</SplitLayout>
					</div>
				</div>
			</Specimen>
		</div>
	);
}

/* ── Work surfaces ────────────────────────────────────────────────────────────────────────── */

export function WorkSection(): JSX.Element {
	const [page, setPage] = createSignal(1);
	const [filters, setFilters] = createSignal(["Status", "Owner"]);
	const [file, setFile] = createSignal("src/auth/redirect.ts");
	return (
		<div class="grid gap-4 md:grid-cols-2">
			<Specimen label="Toolbar, filters, pagination" class="md:col-span-2">
				<Toolbar
					actions={
						<Button variant="primary" size="sm" icon={<PlusIcon class="size-3.5" />}>
							New key
						</Button>
					}
				>
					<SearchInput
						icon={<SearchIcon class="size-3.5" />}
						placeholder="Search keys"
						class="w-full max-w-60"
					/>
					<ToolbarButton icon={<FilterIcon class="size-3.5" />}>Filter</ToolbarButton>
					<ToolbarButton icon={<SortIcon class="size-3.5" />} active>
						Sort
					</ToolbarButton>
					<For each={filters()}>
						{(label) => (
							<FilterChip
								label={label}
								value={label === "Status" ? "Active" : "Me"}
								onRemove={() => setFilters(filters().filter((item) => item !== label))}
							/>
						)}
					</For>
				</Toolbar>
				<Pagination page={page()} pages={6} onPage={setPage} />
			</Specimen>
			<Specimen label="Messages">
				<UserMessage attachments={["error.log"]}>
					Why does the login page loop after signing in?
				</UserMessage>
				<AgentMessage>
					<p>
						<code>redirect.ts</code> sends you back to <code>/login</code> before the session cookie
						arrives.
					</p>
				</AgentMessage>
			</Specimen>
			<Specimen label="A change">
				<DiffCard
					path="src/auth/redirect.ts"
					lines={[
						{ kind: "context", text: "export function nextPath(session) {" },
						{ kind: "remove", text: "  if (!session) return '/login';" },
						{ kind: "add", text: "  if (session === undefined) return null;" },
						{ kind: "add", text: "  if (!session) return '/login';" },
					]}
				/>
			</Specimen>
			<Specimen label="Board">
				<div class="flex gap-3 overflow-x-auto">
					<BoardColumn status="doing" count={2}>
						<TaskCard id="WEB-9" title="Fix login redirect loop" status="doing" agent />
						<TaskCard
							id="WEB-11"
							title="Speed up the test suite"
							status="doing"
							assignee="Sam Rivera"
							labels={["ci"]}
						/>
					</BoardColumn>
					<BoardColumn status="review" count={1}>
						<TaskCard
							id="WEB-7"
							title="Onboarding checklist"
							status="review"
							labels={["frontend"]}
						/>
					</BoardColumn>
				</div>
			</Specimen>
			<Specimen label="Files">
				<FileTree
					selected={file()}
					onSelect={setFile}
					nodes={[
						{
							name: "src",
							children: [
								{
									name: "auth",
									children: [
										{ name: "login.tsx" },
										{ name: "redirect.ts", badge: <Badge tone="warning">M</Badge> },
									],
								},
								{ name: "app.tsx" },
							],
						},
						{ name: "package.json" },
					]}
				/>
			</Specimen>
			<Specimen label="Activity" class="md:col-span-2">
				<ListCard>
					<ActivityItem
						unread
						icon={<PullRequestIcon class="size-4" />}
						title="Approve 3 changes to the login flow"
						meta="web-app · Fix login redirect loop"
						time="2m"
						actions={
							<>
								<Button variant="primary" size="sm">
									Approve
								</Button>
								<Button size="sm">Review</Button>
							</>
						}
					/>
					<ActivityItem
						icon={<UserIcon class="size-4" />}
						title="Lee Park joined Acme Labs"
						meta="Invited by Sam"
						time="1h"
					/>
					<ActivityItem
						icon={<KeyIcon class="size-4" />}
						title="API key “CI deploys” created"
						meta="Settings · API keys"
						time="3h"
					/>
					<ActivityItem
						icon={<CheckIcon class="size-4" />}
						title="Test suite runs 40% faster"
						meta="api · Speed up the test suite"
						time="5h"
					/>
					<ActivityItem
						icon={<ChatIcon class="size-4" />}
						title="New thread: Add billing page"
						meta="web-app"
						time="1d"
					/>
				</ListCard>
			</Specimen>
		</div>
	);
}
