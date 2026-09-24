import type { JSX } from "@solidjs/web";
import { createContext, createSignal, onSettled, useContext } from "solid-js";

/** Something a screen renders into the shell's chrome, drawn wherever the layout puts it. */
type Slot = () => JSX.Element;

type ShellState = {
	/** The screen's tabs for the title bar, or null to show the section's name. */
	tabs: () => Slot | null;
	setSlot: (name: SlotName, slot: Slot | null) => void;
	/** Desktop only: the sidebar and panel folded away to give the screen the width. */
	collapsed: () => boolean;
	toggleCollapsed: () => void;
	drawerOpen: () => boolean;
	setDrawerOpen: (open: boolean) => void;
	paletteOpen: () => boolean;
	setPaletteOpen: (open: boolean) => void;
	/** True from `lg`, where the sidebar and panel sit beside the screen instead of in a drawer. */
	desktop: () => boolean;
};

type SlotName = "tabs";

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
	const [collapsed, setCollapsed] = createSignal(rememberedCollapsed());
	const [drawerOpen, setDrawerOpen] = createSignal(false);
	const [paletteOpen, setPaletteOpen] = createSignal(false);
	const [desktop, setDesktop] = createSignal(matchMedia(DESKTOP_QUERY).matches);

	onSettled(() => {
		const query = matchMedia(DESKTOP_QUERY);
		const update = () => setDesktop(query.matches);
		query.addEventListener("change", update);
		return () => query.removeEventListener("change", update);
	});

	const state: ShellState = {
		tabs,
		// The setter takes the slot through a function so Solid does not call it as an updater.
		setSlot: (_name, slot) => setTabs(() => slot),
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
		setPaletteOpen,
		desktop,
	};

	return <ShellContext value={state}>{props.children}</ShellContext>;
}

export function useShell(): ShellState {
	const shell = useContext(ShellContext);
	if (!shell) throw new Error("useShell must be used inside ShellProvider");
	return shell;
}

/**
 * Hand part of a screen to the shell: its tabs for the title bar. The shell draws them for as
 * long as the screen is open.
 */
export function ShellSlot(props: { name: SlotName; children: JSX.Element }): JSX.Element {
	const shell = useShell();

	onSettled(() => {
		shell.setSlot(props.name, () => props.children);
		return () => shell.setSlot(props.name, null);
	});

	return <></>;
}
