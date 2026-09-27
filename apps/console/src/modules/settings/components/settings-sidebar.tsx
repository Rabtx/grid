import { useLocation } from "@solidjs/router";
import type { JSX } from "@solidjs/web";
import { For } from "solid-js";

import {
	BackIcon,
	BellIcon,
	BranchIcon,
	GlobeIcon,
	LinkIcon,
	NavLink,
	NavSection,
	RocketIcon,
	SunIcon,
	Text,
	UserIcon,
} from "@/kit";
import { workspaceHref } from "@/lib/active-workspace";

import { SETTINGS_SECTIONS, type SettingsHref, settingsReturn } from "../lib/pages";

const ICONS: Record<SettingsHref, () => JSX.Element> = {
	"/settings/appearance": () => <SunIcon />,
	"/settings/notifications": () => <BellIcon />,
	"/settings/agents": () => <RocketIcon />,
	"/settings/environments": () => <GlobeIcon />,
	"/settings/connectors": () => <LinkIcon />,
	"/settings/worktrees": () => <BranchIcon />,
	"/settings/account": () => <UserIcon />,
};

export function settingsIcon(href: SettingsHref): JSX.Element {
	return ICONS[href]();
}

/**
 * While settings are open they take the sidebar's place, as a native app's preferences do: the
 * way back to where you were, then the pages in their groups. The same list is the phone drawer.
 */
export function SettingsSidebar(): JSX.Element {
	const location = useLocation();

	return (
		<nav aria-label="Settings" class="flex h-full min-h-0 flex-col">
			<div class="flex h-12 shrink-0 items-center px-2 pointer-coarse:h-14">
				<NavLink
					href={workspaceHref(settingsReturn.path())}
					icon={<BackIcon />}
					label="Back to app"
					class="flex-1"
				/>
			</div>
			<div class="px-4.5 pb-2">
				<Text as="h2" size="heading" tone="strong" weight="medium">
					Settings
				</Text>
			</div>
			<div class="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-2 pb-4">
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
