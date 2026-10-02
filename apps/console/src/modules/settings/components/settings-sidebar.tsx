import { useLocation, useNavigate } from "@solidjs/router";
import type { JSX } from "@solidjs/web";
import { For } from "solid-js";

import {
	BackIcon,
	BellIcon,
	BranchIcon,
	GlobeIcon,
	IconButton,
	InfoIcon,
	LinkIcon,
	NavLink,
	NavSection,
	PanelHeader,
	RocketIcon,
	SunIcon,
	UserAddIcon,
	UserIcon,
} from "@/kit";
import { workspaceHref } from "@/lib/active-workspace";

import { SETTINGS_SECTIONS, type SettingsHref, settingsReturn } from "../lib/pages";

const ICONS: Record<SettingsHref, () => JSX.Element> = {
	"/settings/appearance": () => <SunIcon />,
	"/settings/notifications": () => <BellIcon />,
	"/settings/agents": () => <RocketIcon />,
	"/settings/members": () => <UserAddIcon />,
	"/settings/environments": () => <GlobeIcon />,
	"/settings/connectors": () => <LinkIcon />,
	"/settings/worktrees": () => <BranchIcon />,
	"/settings/diagnostics": () => <InfoIcon />,
	"/settings/account": () => <UserIcon />,
};

export function settingsIcon(href: SettingsHref): JSX.Element {
	return ICONS[href]();
}

/**
 * While settings are open they take the panel's place beside the rail, as the Figma settings
 * screens draw it: the way back to where you were, then the pages in their groups. The same
 * list is the phone drawer's panel.
 */
export function SettingsSidebar(): JSX.Element {
	const location = useLocation();
	const navigate = useNavigate();

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
			<div class="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-2 pb-4">
				<For each={SETTINGS_SECTIONS}>
					{(section) => (
						<NavSection label={section.label}>
							<For each={section.pages}>
								{(page) => (
									<NavLink
										href={workspaceHref(page.href)}
										icon={settingsIcon(page.href)}
										label={page.label}
										current={location.pathname === page.href}
									/>
								)}
							</For>
						</NavSection>
					)}
				</For>
			</div>
		</nav>
	);
}
