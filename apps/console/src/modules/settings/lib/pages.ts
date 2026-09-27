import { createSignal } from "solid-js";

/** The settings pages, grouped as the settings sidebar and the phone index list them. */
export const SETTINGS_SECTIONS = [
	{
		label: "App",
		pages: [
			{
				href: "/settings/appearance",
				label: "Appearance",
				description: "Theme, colour, shape and motion",
			},
			{
				href: "/settings/notifications",
				label: "Notifications",
				description: "Hear when an agent needs you",
			},
		],
	},
	{
		label: "Agents",
		pages: [
			{
				href: "/settings/agents",
				label: "Agents",
				description: "Coding agents and what new threads start with",
			},
		],
	},
	{
		label: "Workspace",
		pages: [
			{
				href: "/settings/environments",
				label: "Environments",
				description: "Codespaces and other machines",
			},
			{
				href: "/settings/worktrees",
				label: "Worktrees",
				description: "Separate checkouts threads work in",
			},
			{
				href: "/settings/connectors",
				label: "Connectors",
				description: "GitHub and other services",
			},
		],
	},
	{
		label: "Account",
		pages: [{ href: "/settings/account", label: "Account", description: "Who is signed in" }],
	},
] as const;

export type SettingsHref = (typeof SETTINGS_SECTIONS)[number]["pages"][number]["href"];

// Where "Back to app" leads: the last screen outside settings, so leaving settings returns there.
const [appPath, setAppPath] = createSignal("/chat");

export const settingsReturn = {
	path: appPath,
	/** The shell records every screen outside settings as it is shown. */
	remember(path: string): void {
		if (!path.startsWith("/settings")) setAppPath(path);
	},
};
