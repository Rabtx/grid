import type { JSX } from "@solidjs/web";
import { createSignal, For } from "solid-js";

import { APPEARANCE_LIMITS, appearance, updateAppearance } from "@/lib/appearance";
import { StatusIcon, TASK_STATUS_LABELS, TASK_STATUSES } from "@/modules/projects";
import {
	Button,
	Caption,
	Chip,
	CloseIcon,
	ConfirmDialog,
	EmptyState,
	ErrorNotice,
	Field,
	IconButton,
	Input,
	Menu,
	PlusIcon,
	SearchIcon,
	Select,
	SegmentedControl,
	Sheet,
	Skeleton,
	Slider,
	Textarea,
} from "@/ui";

/**
 * Development-only gallery: every primitive in every state, for reviewing the design system
 * against the prototype. Registered only when `import.meta.env.DEV`, so it never ships.
 */
export function DevUiRoute(): JSX.Element {
	const [view, setView] = createSignal<"status" | "owner">("status");
	const [sheet, setSheet] = createSignal(false);
	const [panel, setPanel] = createSignal(false);
	const [confirm, setConfirm] = createSignal(false);
	const [selectValue, setSelectValue] = createSignal("backlog");
	const [scale, setScale] = createSignal(1);

	return (
		<div class="mx-auto flex max-w-3xl flex-col gap-8 py-6">
			<header class="flex flex-wrap items-center justify-between gap-3">
				<h1 class="font-semibold text-title">UI primitives</h1>
				<div class="flex flex-wrap gap-2">
					<SegmentedControl
						label="Theme"
						options={[
							{ value: "system", label: "System" },
							{ value: "light", label: "Light" },
							{ value: "dark", label: "Dark" },
						]}
						value={appearance().theme}
						onChange={(theme) => updateAppearance({ theme })}
					/>
					<SegmentedControl
						label="Density"
						options={[
							{ value: "compact", label: "Compact" },
							{ value: "comfortable", label: "Comfortable" },
							{ value: "spacious", label: "Spacious" },
						]}
						value={appearance().density}
						onChange={(density) => updateAppearance({ density })}
					/>
				</div>
			</header>

			<Section title="Ink ladder">
				<div class="grid grid-cols-4 gap-2 md:grid-cols-8">
					<For
						each={[
							"bg-ink/5",
							"bg-ink/8",
							"bg-ink/10",
							"bg-ink/15",
							"bg-ink/20",
							"bg-ink/40",
							"bg-ink/70",
							"bg-ink",
						]}
					>
						{(fill) => <div class={`h-10 rounded-md border border-stroke ${fill}`} title={fill} />}
					</For>
				</div>
				<div class="flex flex-wrap gap-4 text-ui">
					<span class="text-ink">ink</span>
					<span class="text-ink/70">ink/70</span>
					<span class="text-ink/55">ink/55</span>
					<span class="text-ink/45">ink/45</span>
					<span class="text-ink/35">ink/35</span>
					<span class="text-accent">accent</span>
					<span class="text-success">success</span>
					<span class="text-warning">warning</span>
					<span class="text-danger">danger</span>
					<span class="text-link">link</span>
				</div>
			</Section>

			<Section title="Buttons">
				<div class="flex flex-wrap items-center gap-2">
					<Button variant="primary">Primary</Button>
					<Button>Secondary</Button>
					<Button variant="ghost">Ghost</Button>
					<Button variant="danger">Delete</Button>
					<Button variant="primary" disabled>
						Disabled
					</Button>
					<Button variant="primary" size="sm">
						Small
					</Button>
					<Button variant="primary" size="lg">
						<PlusIcon class="size-4" />
						Large
					</Button>
					<IconButton label="Search">
						<SearchIcon />
					</IconButton>
					<IconButton label="Close" size="sm">
						<CloseIcon class="size-3.5" />
					</IconButton>
				</div>
			</Section>

			<Section title="Fields">
				<div class="grid gap-4 md:grid-cols-2">
					<Field label="Email" hint="We never share it.">
						<Input type="email" placeholder="you@example.com" />
					</Field>
					<Field label="Branch" error="That branch already exists.">
						<Input aria-invalid="true" value="agent/web/board" />
					</Field>
					<Field label="Disabled">
						<Input disabled value="read only" />
					</Field>
					<Field label="Description" hint="Plain text for now.">
						<Textarea placeholder="What is this task about?" />
					</Field>
					<Field label="Status">
						<Select
							aria-label="Status"
							options={[
								{ value: "backlog", label: "Backlog" },
								{ value: "in_progress", label: "In progress" },
								{ value: "done", label: "Done" },
							]}
							value={selectValue()}
							onChange={setSelectValue}
						/>
					</Field>
				</div>
			</Section>

			<Section title="Slider">
				<div class="max-w-sm">
					<Slider
						label="Interface scale"
						{...APPEARANCE_LIMITS.uiScale}
						value={scale()}
						onInput={setScale}
						format={(value) => `${Math.round(value * 100)}%`}
					/>
				</div>
			</Section>

			<Section title="Segmented, chips, stages">
				<SegmentedControl
					label="View"
					options={[
						{ value: "status", label: "By status" },
						{ value: "owner", label: "By owner" },
					]}
					value={view()}
					onChange={setView}
				/>
				<div class="flex flex-wrap gap-1.5">
					<Chip>docs</Chip>
					<Chip dot="bg-accent">frontend</Chip>
					<Chip dot="bg-danger">bug</Chip>
					<Chip dot="bg-success">shipped</Chip>
				</div>
				<div class="flex flex-wrap gap-4">
					<For each={TASK_STATUSES}>
						{(status) => (
							<span class="flex items-center gap-1.5 text-ink/70 text-ui-sm">
								<StatusIcon status={status} />
								{TASK_STATUS_LABELS[status]}
							</span>
						)}
					</For>
				</div>
			</Section>

			<Section title="Feedback">
				<ErrorNotice
					message="The API could not be reached — is it running on port 4000?"
					action={
						<Button size="sm" variant="secondary">
							Try again
						</Button>
					}
				/>
				<div class="flex flex-col gap-2">
					<Skeleton class="h-4 w-40" />
					<Skeleton class="h-16 rounded-lg" />
				</div>
				<div class="rounded-lg border border-ink/10">
					<EmptyState title="No tasks yet" description="Tasks you add will show up here." />
				</div>
			</Section>

			<Section title="Sheet">
				<Button onClick={() => setSheet(true)}>Open sheet</Button>
				<Sheet open={sheet()} onClose={() => setSheet(false)} label="Example sheet">
					<div class="flex flex-col gap-3 p-4">
						<h2 class="font-semibold text-ui">Example sheet</h2>
						<p class="text-ink/70 text-ui-sm">
							A bottom sheet on phones, a top-anchored dialog from tablet width up.
						</p>
						<div class="flex justify-end">
							<Button variant="primary" onClick={() => setSheet(false)}>
								Done
							</Button>
						</div>
					</div>
				</Sheet>
			</Section>

			<Section title="Panel">
				<Button onClick={() => setPanel(true)}>Open panel</Button>
				<Sheet
					placement="panel"
					open={panel()}
					onClose={() => setPanel(false)}
					label="Example panel"
				>
					<div class="flex h-full flex-col gap-3 p-4">
						<h2 class="font-semibold text-ui">Example panel</h2>
						<p class="text-ink/70 text-ui-sm">
							Full-screen on phones; a right-hand side panel from lg.
						</p>
						<div class="flex justify-end">
							<Button variant="primary" onClick={() => setPanel(false)}>
								Close
							</Button>
						</div>
					</div>
				</Sheet>
			</Section>

			<Section title="Menu">
				<Menu
					label="More actions"
					trigger={<PlusIcon class="size-4" />}
					items={[
						{ id: "edit", label: "Edit" },
						{ id: "duplicate", label: "Duplicate" },
						{ id: "delete", label: "Delete", danger: true },
					]}
					onSelect={(id) => {
						console.info("menu select", id);
					}}
				/>
			</Section>

			<Section title="Confirm">
				<Button variant="danger" onClick={() => setConfirm(true)}>
					Delete something
				</Button>
				<ConfirmDialog
					open={confirm()}
					title="Delete TASK-1?"
					description="This can't be undone."
					confirmLabel="Delete task"
					tone="danger"
					onConfirm={() => setConfirm(false)}
					onCancel={() => setConfirm(false)}
				/>
			</Section>
		</div>
	);
}

function Section(props: { title: string; children: JSX.Element }): JSX.Element {
	return (
		<section class="flex flex-col gap-3">
			<Caption>{props.title}</Caption>
			{props.children}
		</section>
	);
}
