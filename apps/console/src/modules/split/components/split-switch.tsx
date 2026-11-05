import type { JSX } from "@solidjs/web";
import { Show } from "solid-js";

import {
	BrowserIcon,
	ChatIcon,
	CodeIcon,
	DockedPane,
	GlobeIcon,
	IconButton,
	SplitChooser,
	type SplitChoice,
	SplitIcon,
	TerminalIcon,
} from "@/kit";

import { openBelow, openTab, type PaneTab, paneOf, setMode, tabId } from "../lib/layout";
import { baseName } from "../lib/paths";
import { splitChooser, type ChooserWhere } from "../stores/chooser";
import { layoutsStore } from "../stores/layouts";

import { Workspace, type WorkspaceProps } from "./workspace";

/**
 * Split view, from the desktop title bar (⌘\): with the split shut it asks what to open beside the
 * thread; with it open it shuts it. One button where Focus · Split · Three used to be.
 */
export function SplitButton(props: { thread: string }): JSX.Element {
	const open = () => layoutsStore.of(props.thread).mode !== "focus";
	return (
		<IconButton
			size="sm"
			label={open() ? "Close the split" : "Split view"}
			shortcut="Mod \\"
			aria-pressed={open() ? "true" : "false"}
			class={open() ? "text-fg" : ""}
			onClick={() => toggleSplit(props.thread)}
		>
			<SplitIcon />
		</IconButton>
	);
}

/** Open the split by asking what goes in it, or shut it. The title bar's button and ⌘\. */
export function toggleSplit(thread: string): void {
	if (layoutsStore.of(thread).mode !== "focus")
		layoutsStore.update(thread, (current) => setMode(current, "focus"));
	else splitChooser.open(thread, "beside");
}

/** The phone's way in: a chip on the composer that asks what to dock above it, or puts it away. */
export function WorkspaceToggle(props: { thread: string }): JSX.Element {
	const open = () => layoutsStore.of(props.thread).mode !== "focus";
	return (
		<IconButton
			label={open() ? "Hide the workspace" : "Open beside the thread"}
			size="sm"
			aria-pressed={open() ? "true" : "false"}
			class={open() ? "bg-accent/10 text-accent" : ""}
			onClick={() => toggleSplit(props.thread)}
		>
			<CodeIcon />
		</IconButton>
	);
}

/**
 * The workspace on a phone: one pane docked over the composer, never squeezed beside the thread.
 * It keeps the thread readable above it and the reply box in reach below.
 */
export function DockedWorkspace(props: WorkspaceProps): JSX.Element {
	const open = () => layoutsStore.of(props.place.thread).mode !== "focus";
	return (
		<>
			<Show when={open()}>
				<DockedPane>
					<Workspace {...props} single />
				</DockedPane>
			</Show>
			<SplitPicker {...props} />
		</>
	);
}

/** The tools any thread can open beside it, in the chooser's order. */
const TOOLS: readonly { tab: PaneTab; label: string; detail: string; icon: () => JSX.Element }[] = [
	{
		tab: { kind: "terminal" },
		label: "Terminal",
		detail: "The thread's shell",
		icon: () => <TerminalIcon />,
	},
	{
		tab: { kind: "preview" },
		label: "Preview",
		detail: "What it serves",
		icon: () => <GlobeIcon />,
	},
	{
		tab: { kind: "browser" },
		label: "Browser",
		detail: "The agent's page",
		icon: () => <BrowserIcon />,
	},
];

/**
 * The chooser for one thread: what to open beside it, under its first pane, or in a pane's tabs,
 * as the request says. A side chat starts a new thread, so the chat module hands that in.
 */
export function SplitPicker(props: WorkspaceProps): JSX.Element {
	const thread = () => props.place.thread;
	const asked = () => {
		const request = splitChooser.request();
		return request && request.thread === thread() ? request.where : null;
	};
	const isOpen = (tab: PaneTab) => paneOf(layoutsStore.of(thread()), tabId(tab)) >= 0;

	const choices = (): SplitChoice[] => [
		...TOOLS.map((tool): SplitChoice => ({
			id: tabId(tool.tab),
			label: tool.label,
			detail: tool.detail,
			icon: tool.icon(),
			kind: "tool",
			open: layoutsStore.of(thread()).mode !== "focus" && isOpen(tool.tab),
		})),
		...(props.onSideChat
			? [
					{
						id: "side-chat",
						label: "Side chat",
						detail: "A question on the side",
						icon: <ChatIcon />,
						kind: "tool" as const,
					},
				]
			: []),
		...props.files.map((file): SplitChoice => ({
			id: `file:${file.path}`,
			label: baseName(file.path),
			detail: file.path,
			icon: <CodeIcon />,
			kind: "item",
			group: "Changed in this thread",
		})),
	];

	function pick(id: string, where: ChooserWhere): void {
		if (id === "side-chat") {
			props.onSideChat?.();
			return;
		}
		const tab: PaneTab = id.startsWith("file:")
			? { kind: "file", path: id.slice("file:".length) }
			: (TOOLS.find((tool) => tabId(tool.tab) === id)?.tab ?? { kind: "terminal" });
		layoutsStore.update(thread(), (current) =>
			where === "below"
				? openBelow(current, tab)
				: openTab(current, tab, where === "beside" ? 0 : where),
		);
	}

	return (
		<SplitChooser
			open={asked() !== null}
			title={asked() === "below" ? "Open below" : "Open beside the thread"}
			description={
				// Keys only help where there is a keyboard to press them on.
				matchMedia("(pointer: fine)").matches ? "Arrow keys to choose, Enter to open." : undefined
			}
			choices={choices()}
			onPick={(id) => {
				const where = asked();
				if (where !== null) pick(id, where);
			}}
			onClose={() => splitChooser.close()}
		/>
	);
}
