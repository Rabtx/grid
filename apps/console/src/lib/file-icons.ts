import { type FileIconResolver, setFileIcons } from "@/kit/file-icon";

import { appearance } from "./appearance";

/**
 * File and folder icons from a VS Code icon theme in `public/file-icons` (see its README): the
 * theme's `theme.json` says which name, folder or extension gets which icon, the way the editor
 * reads it. Loaded once at start; without it the trees keep their generic glyphs.
 */

type Section = {
	file?: string;
	folder?: string;
	folderExpanded?: string;
	fileExtensions?: Record<string, string>;
	fileNames?: Record<string, string>;
	folderNames?: Record<string, string>;
	folderNamesExpanded?: Record<string, string>;
	languageIds?: Record<string, string>;
};

export type IconTheme = Section & {
	iconDefinitions: Record<string, { iconPath: string }>;
	light?: Section;
};

const BASE = "/file-icons/";

// The editor finds some files by their language rather than their extension; these are the common
// ones the theme only lists by language.
const LANGUAGE_OF: Record<string, string> = {
	h: "c",
	hpp: "cpp",
	hh: "cpp",
	sql: "sql",
	bat: "bat",
	cmd: "bat",
	log: "log",
};

/** Look a key up in the light section first (in light mode), then the base theme. */
function lookup(
	theme: IconTheme,
	light: boolean,
	table: Exclude<keyof Section, "file" | "folder" | "folderExpanded">,
	key: string,
): string | undefined {
	return (light ? theme.light?.[table]?.[key] : undefined) ?? theme[table]?.[key];
}

function fallback(theme: IconTheme, light: boolean, key: "file" | "folder" | "folderExpanded") {
	return (light ? theme.light?.[key] : undefined) ?? theme[key];
}

/** The icon id for a name, as the editor would pick it. */
export function iconIdFor(
	theme: IconTheme,
	name: string,
	folder: boolean,
	open: boolean,
	light: boolean,
): string | undefined {
	const lower = name.toLowerCase();
	if (folder) {
		const named = open
			? (lookup(theme, light, "folderNamesExpanded", lower) ??
				lookup(theme, light, "folderNames", lower))
			: lookup(theme, light, "folderNames", lower);
		return named ?? fallback(theme, light, open ? "folderExpanded" : "folder");
	}
	const exact = lookup(theme, light, "fileNames", name) ?? lookup(theme, light, "fileNames", lower);
	if (exact) return exact;
	// The longest extension wins: "d.ts" before "ts".
	const parts = lower.split(".");
	for (let index = 1; index < parts.length; index++) {
		const extension = parts.slice(index).join(".");
		const id = lookup(theme, light, "fileExtensions", extension);
		if (id) return id;
	}
	const language = LANGUAGE_OF[parts.at(-1) ?? ""];
	const byLanguage = language ? lookup(theme, light, "languageIds", language) : undefined;
	return byLanguage ?? fallback(theme, light, "file");
}

/** The URL of the icon for a name, or null when the theme has none. */
export function iconUrlFor(
	theme: IconTheme,
	name: string,
	folder: boolean,
	open: boolean,
	light: boolean,
): string | null {
	const id = iconIdFor(theme, name, folder, open, light);
	const path = id ? theme.iconDefinitions[id]?.iconPath : undefined;
	return path ? `${BASE}${path.replace(/^\.\//, "")}` : null;
}

function isLight(): boolean {
	// Read the theme setting so rows redraw when it changes; "system" follows the device.
	const theme = appearance().theme;
	if (theme !== "system") return theme === "light";
	const root = document.documentElement;
	if (root.classList.contains("light")) return true;
	if (root.classList.contains("dark")) return false;
	return !(window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? true);
}

/** Load the icon theme and hand it to the trees; quietly keeps the generic glyphs on failure. */
export async function loadFileIcons(): Promise<void> {
	try {
		const response = await fetch(`${BASE}theme.json`);
		if (!response.ok) return;
		const theme = (await response.json()) as IconTheme;
		const resolve: FileIconResolver = (name, folder, open) =>
			iconUrlFor(theme, name, folder, open, isLight());
		setFileIcons(resolve);
	} catch (cause) {
		console.warn("[file-icons] could not load the icon theme; using the generic icons", cause);
	}
}
