import { useLocation, useNavigate } from "@solidjs/router";
import type { JSX } from "@solidjs/web";
import { For } from "solid-js";

import {
	AsteriskIcon,
	BackIcon,
	BellIcon,
	IconButton,
	LaptopIcon,
	NavLink,
	NavSection,
	PaletteIcon,
	PanelHeader,
	PlugIcon,
	SettingsIcon,
	SparklesIcon,
	StatusDot,
	UserIcon,
} from "@/kit";
import { workspaceHref } from "@/lib/active-workspace";
import { runnerUp } from "@/lib/runner-health";

import { SETTINGS_SECTIONS, type SettingsHref, settingsReturn } from "../lib/pages";

/** Each page's glyph. */
const ICONS: Record<SettingsHref, () => JSX.Element> = {
	"/settings/profile": () => <UserIcon />,
	"/settings/notifications": () => <BellIcon />,
	"/settings/appearance": () => <PaletteIcon />,
	"/settings/general": () => <SettingsIcon />,
	"/settings/members": () => <UserIcon />,
	"/settings/connectors": () => <PlugIcon />,
	"/settings/agents": () => <AsteriskIcon />,
	"/settings/skills": () => <SparklesIcon />,
	"/settings/roles": () => <UserIcon />,
	"/settings/machines": () => <LaptopIcon />,
};

export function settingsIcon(href: SettingsHref): JSX.Element {
	return ICONS[href]();
}

/**
 * While settings are open they take the panel's place beside the rail, as the Figma settings
 * screens draw it: the way back to where you were, then the pages in their groups. The same
 * list is the phone drawer's panel.
 */
export function SettingsSidebar(props: { bare?: boolean } = {}): JSX.Element {
	const location = useLocation();
	const navigate = useNavigate();
	// Only what the list cannot say by itself: a machine being up is news, a count of members or
	// roles beside its own name is not. The page answers it better than a stray number in a list.
	const trailing = (href: SettingsHref): JSX.Element => {
		if (href === "/settings/machines")
			return (
				<StatusDot
					status={runnerUp() ? "online" : "offline"}
					size="sm"
					label={runnerUp() ? "This machine is online" : "This machine is offline"}
				/>
			);
		return undefined;
	};

	const sections = (
		<For each={SETTINGS_SECTIONS}>
			{(section) => (
				<NavSection label={section.label}>
					<For each={section.pages}>
						{(page) => (
							<NavLink
								href={workspaceHref(page.href)}
								icon={settingsIcon(page.href)}
								label={page.label}
								trailing={trailing(page.href)}
								current={location.pathname === page.href}
							/>
						)}
					</For>
				</NavSection>
			)}
		</For>
	);

	// Inside the floating sidebar the card is the frame: the pages alone, its views row the way back.
	if (props.bare) return <div class="flex flex-col gap-2 pt-1">{sections}</div>;

	return (
		<nav aria-label="Settings" class="flex h-full min-h-0 flex-col">
			<PanelHeader
				title="Settings"
				actions={
					<IconButton label="Back to app" size="sm" onClick={() => navigate(settingsReturn.path())}>
						<BackIcon />
					</IconButton>
				}
			/>
			<div class="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-2 pb-4">{sections}</div>
		</nav>
	);
}
