import type { JSX } from "@solidjs/web";
import { For, Show } from "solid-js";

import {
	AgentLogo,
	BranchIcon,
	ClockIcon,
	DatabaseIcon,
	DiffStat,
	FileIcon,
	FolderIcon,
	InfoIcon,
	LaptopIcon,
	LinkIcon,
	Popover,
	RoleMark,
	ThreadDetailsCard,
	ThreadDetailsRow,
	ThreadDetailsSection,
	iconButton,
} from "@/kit";

import { formatDuration } from "../lib/transcript";

/** What the details card says about a thread. */
export type ThreadDetailsData = {
	agent: { id: string; name: string; model?: string };
	role?: { name: string; icon: string } | null;
	/** "Started 3 hours ago", or by another thread's agent. */
	started: string;
	machine: string;
	/** The folder the agent works in. */
	folder?: string;
	/** The thread's own worktree branch, when it has one. */
	branch?: string;
	workedMs: number;
	files: readonly { path: string; added: number; removed: number }[];
	added: number;
	removed: number;
	usage?: {
		contextUsed?: number;
		contextWindow?: number;
		inputTokens?: number;
		outputTokens?: number;
		costUsd?: number;
	};
	/** The thread this one was forked from. */
	forkedFrom?: { title: string; href?: string } | null;
};

const compact = (n: number) =>
	n >= 1_000_000
		? `${(n / 1_000_000).toFixed(1)}M`
		: n >= 1_000
			? `${Math.round(n / 1_000)}k`
			: String(n);

/** The last two parts of a path: enough to tell files apart in a narrow card. */
const shortPath = (path: string) => path.split("/").slice(-2).join("/");

/**
 * The thread's details (after T3 Code's thread details card): the agent and its model, where it
 * works, what it changed, what it has used, and where it came from. Sections with nothing to say
 * are left out.
 */
export function ThreadDetails(props: { data: ThreadDetailsData; bare?: boolean }): JSX.Element {
	const usage = () => props.data.usage;
	const context = () => {
		const used = usage()?.contextUsed;
		const total = usage()?.contextWindow;
		if (used === undefined) return null;
		return total ? `${compact(used)} / ${compact(total)}` : compact(used);
	};
	const tokens = () => {
		const input = usage()?.inputTokens;
		const output = usage()?.outputTokens;
		if (input === undefined && output === undefined) return null;
		return `${compact(input ?? 0)} in · ${compact(output ?? 0)} out`;
	};
	return (
		<ThreadDetailsCard bare={props.bare}>
			<ThreadDetailsSection title="Agent">
				<ThreadDetailsRow
					icon={<AgentLogo id={props.data.agent.id} name={props.data.agent.name} />}
					label={props.data.agent.name}
					value={props.data.agent.model}
				/>
				<Show when={props.data.role}>
					{(role) => (
						<ThreadDetailsRow
							icon={<RoleMark icon={role().icon} size="sm" />}
							label={role().name}
							value="Role"
						/>
					)}
				</Show>
				<ThreadDetailsRow
					icon={<ClockIcon />}
					label={props.data.started}
					value={props.data.workedMs > 0 ? formatDuration(props.data.workedMs) : undefined}
				/>
			</ThreadDetailsSection>
			<ThreadDetailsSection title="Workspace">
				<ThreadDetailsRow icon={<LaptopIcon />} label={props.data.machine} />
				<Show when={props.data.folder}>
					{(folder) => (
						<ThreadDetailsRow icon={<FolderIcon />} label={shortPath(folder())} title={folder()} />
					)}
				</Show>
				<Show when={props.data.branch}>
					{(branch) => <ThreadDetailsRow icon={<BranchIcon />} label={branch()} value="Worktree" />}
				</Show>
			</ThreadDetailsSection>
			<ThreadDetailsSection
				title="Changes"
				actions={
					<Show when={props.data.files.length > 0}>
						<DiffStat added={props.data.added} removed={props.data.removed} />
					</Show>
				}
			>
				<Show
					when={props.data.files.length > 0}
					fallback={<p class="px-2.5 pb-1 text-caption text-fg-subtle">No files changed yet.</p>}
				>
					<For each={props.data.files}>
						{(file) => (
							<ThreadDetailsRow
								icon={<FileIcon />}
								label={<span class="font-mono font-normal">{shortPath(file.path)}</span>}
								title={file.path}
								value={<DiffStat added={file.added} removed={file.removed} />}
							/>
						)}
					</For>
				</Show>
			</ThreadDetailsSection>
			<Show when={context() || tokens() || usage()?.costUsd !== undefined}>
				<ThreadDetailsSection title="Usage">
					<Show when={context()}>
						{(value) => (
							<ThreadDetailsRow icon={<DatabaseIcon />} label="Context" value={value()} />
						)}
					</Show>
					<Show when={tokens()}>
						{(value) => <ThreadDetailsRow icon={<InfoIcon />} label="Tokens" value={value()} />}
					</Show>
					<Show when={usage()?.costUsd}>
						{(cost) => (
							<ThreadDetailsRow icon={<InfoIcon />} label="Cost" value={`$${cost().toFixed(2)}`} />
						)}
					</Show>
				</ThreadDetailsSection>
			</Show>
			<Show when={props.data.forkedFrom}>
				{(from) => (
					<ThreadDetailsSection title="Related">
						<ThreadDetailsRow
							icon={<LinkIcon />}
							label={from().title}
							value="Forked from"
							href={from().href}
						/>
					</ThreadDetailsSection>
				)}
			</Show>
		</ThreadDetailsCard>
	);
}

/** The details where the card does not fit beside the thread: a button opening it as a popover. */
export function ThreadDetailsButton(props: {
	data: ThreadDetailsData;
	class?: string;
}): JSX.Element {
	return (
		<Popover
			label="Thread details"
			title="Thread details"
			placement="bottom-end"
			width="md:w-80"
			triggerClass={`${iconButton({ size: "sm" })} ${props.class ?? ""}`}
			trigger={<InfoIcon size="sm" />}
		>
			{() => <ThreadDetails data={props.data} bare />}
		</Popover>
	);
}
