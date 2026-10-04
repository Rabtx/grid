import type { JSX } from "@solidjs/web";
import { createContext, createSignal, onSettled, useContext } from "solid-js";

import { appearance } from "@/lib/appearance";

/** Something a screen renders into the shell's chrome, drawn wherever the layout puts it. */
type Slot = () => JSX.Element;

type ShellState = {
	/** The screen's tabs for the title bar, or null to show the section's name. */
	tabs: () => Slot | null;
	/** The breadcrumb's last step after the section ("Inbox / Needs you"). */
	crumb: () => Slot | null;
	/** The screen's actions on the right of the desktop top bar. */
	actions: () => Slot | null;
	/** The phone header's line under the title ("4 need you"). */
	subtitle: () => Slot | null;
	/** The screen's own panel body beside the rail, in place of the projects tree. */
	panel: () => Slot | null;
	/** The panel header's actions in place of search and a new thread: a screen's own (a new note). */
	panelActions: () => Slot | null;
	/** The phone header's middle in place of the section's name: a screen's own title and line. */
	heading: () => Slot | null;
	/** The phone header's left button in place of the drawer's: a way back. */
	leading: () => Slot | null;
	/** The phone header's right button in place of a new thread: the screen's own action. */
	trailing: () => Slot | null;
	setSlot: (name: SlotName, slot: Slot | null) => void;
	/** Empties a slot only if it still holds `mine`: the next screen may already have filled it. */
	clearSlot: (name: SlotName, mine: Slot) => void;
	/** Desktop only: the sidebar and panel folded away to give the screen the width. */
	collapsed: () => boolean;
	toggleCollapsed: () => void;
	drawerOpen: () => boolean;
	setDrawerOpen: (open: boolean) => void;
	paletteOpen: () => boolean;
	/** Open or close Search; `mode` opens it straight into Ask Grid. */
	setPaletteOpen: (open: boolean, mode?: "search" | "ask") => void;
	/** What Search opened as: finding things, or asking Grid. */
	paletteMode: () => "search" | "ask";
	/** True from `lg`, where the sidebar and panel sit beside the screen instead of in a drawer. */
	desktop: () => boolean;
	/** Desktop with the floating sidebar (Settings → Appearance): a card over the canvas, no rail. */
	floating: () => boolean;
};

type SlotName =
	| "tabs"
	| "crumb"
	| "actions"
	| "subtitle"
	| "panel"
	| "panelActions"
	| "heading"
	| "leading"
	| "trailing";

const COLLAPSED_KEY = "grid.shell.collapsed";
const DESKTOP_QUERY = "(min-width: 64rem)";

const ShellContext = createContext<ShellState>();

function rememberedCollapsed(): boolean {
	try {
		return localStorage.getItem(COLLAPSED_KEY) === "1";
	} catch {
		return false;
	}
}

export function ShellProvider(props: { children: JSX.Element }): JSX.Element {
	const [tabs, setTabs] = createSignal<Slot | null>(null);
	const [crumb, setCrumb] = createSignal<Slot | null>(null);
	const [actions, setActions] = createSignal<Slot | null>(null);
	const [subtitle, setSubtitle] = createSignal<Slot | null>(null);
	const [panel, setPanel] = createSignal<Slot | null>(null);
	const [panelActions, setPanelActions] = createSignal<Slot | null>(null);
	const [heading, setHeading] = createSignal<Slot | null>(null);
	const [leading, setLeading] = createSignal<Slot | null>(null);
	const [trailing, setTrailing] = createSignal<Slot | null>(null);
	const setters = {
		tabs: setTabs,
		crumb: setCrumb,
		actions: setActions,
		subtitle: setSubtitle,
		panel: setPanel,
		panelActions: setPanelActions,
		heading: setHeading,
		leading: setLeading,
		trailing: setTrailing,
	};
	const [collapsed, setCollapsed] = createSignal(rememberedCollapsed());
	const [drawerOpen, setDrawerOpen] = createSignal(false);
	const [paletteOpen, setPaletteOpen] = createSignal(false);
	const [paletteMode, setPaletteMode] = createSignal<"search" | "ask">("search");
	const [desktop, setDesktop] = createSignal(matchMedia(DESKTOP_QUERY).matches);

	onSettled(() => {
		const query = matchMedia(DESKTOP_QUERY);
		const update = () => setDesktop(query.matches);
		query.addEventListener("change", update);
		return () => query.removeEventListener("change", update);
	});

	const state: ShellState = {
		tabs,
		crumb,
		actions,
		subtitle,
		panel,
		panelActions,
		heading,
		leading,
		trailing,
		// The setter takes the slot through a function so Solid does not call it as an updater.
		setSlot: (name, slot) => setters[name](() => slot),
		clearSlot: (name, mine) => setters[name]((current) => (current === mine ? null : current)),
		collapsed,
		toggleCollapsed: () => {
			const next = !collapsed();
			setCollapsed(next);
			try {
				localStorage.setItem(COLLAPSED_KEY, next ? "1" : "0");
			} catch {
				// Not remembered; the sidebar opens again next time.
			}
		},
		drawerOpen,
		setDrawerOpen,
		paletteOpen,
		setPaletteOpen: (open, mode = "search") => {
			setPaletteMode(mode);
			setPaletteOpen(open);
		},
		paletteMode,
		desktop,
		floating: () => desktop() && appearance().sidebar === "floating",
	};

	return <ShellContext value={state}>{props.children}</ShellContext>;
}

export function useShell(): ShellState {
	const shell = useContext(ShellContext);
	if (!shell) throw new Error("useShell must be used inside ShellProvider");
	return shell;
}

/**
 * Hand part of a screen to the shell: its tabs or breadcrumb step and actions for the top bar,
 * the phone header's subtitle, or its own panel body. The shell draws them for as long as the
 * screen is open.
 */
export function ShellSlot(props: { name: SlotName; children: JSX.Element }): JSX.Element {
	const shell = useShell();

	onSettled(() => {
		const mine: Slot = () => props.children;
		shell.setSlot(props.name, mine);
		return () => shell.clearSlot(props.name, mine);
	});

	return <></>;
}
