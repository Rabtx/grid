import { createSignal } from "solid-js";

/**
 * The settings pages, grouped as the settings sidebar and the phone index list them (Figma 24 ·
 * Settings): you, the workspace, and the agents and machines that do the work.
 */
export const SETTINGS_SECTIONS = [
	{
		label: "You",
		pages: [
			{
				href: "/settings/profile",
				label: "Profile",
				description: "How teammates and agents see you",
			},
			{
				href: "/settings/notifications",
				label: "Notifications",
				description: "When and where Grid reaches you",
			},
			{
				href: "/settings/appearance",
				label: "Appearance",
				description: "Theme, colour, text and motion",
			},
		],
	},
	{
		label: "Workspace",
		pages: [
			{
				href: "/settings/general",
				label: "General",
				description: "The workspace's name, defaults and data",
			},
			{
				href: "/settings/members",
				label: "Members",
				description: "Who is in this workspace, their roles and invites",
			},
			{
				href: "/settings/connectors",
				label: "Connectors",
				description: "GitHub and other services",
			},
		],
	},
	{
		label: "Agents",
		pages: [
			{
				href: "/settings/agents",
				label: "Agents & permissions",
				description: "Coding agents and what new threads start with",
			},
			{
				href: "/settings/roles",
				label: "Roles",
				description: "What owners, admins, members and viewers can do",
			},
			{
				href: "/settings/machines",
				label: "Machines",
				description: "This machine, Codespaces and other Grids",
			},
		],
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
