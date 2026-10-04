import { useLocation, useNavigate } from "@solidjs/router";
import type { JSX } from "@solidjs/web";
import { createEffect, createSignal, For } from "solid-js";

import {
	AsteriskIcon,
	BackIcon,
	BellIcon,
	type FeedTone,
	IconButton,
	LaptopIcon,
	NavLink,
	NavSection,
	PaletteIcon,
	PanelHeader,
	PlugIcon,
	SettingsIcon,
	StatusDot,
	UserIcon,
} from "@/kit";
import { workspaceHref } from "@/lib/active-workspace";
import { runnerUp } from "@/lib/runner-health";
import { useAuth } from "@/modules/auth";
import { useWorkspaces } from "@/modules/workspaces";
import { workspacesService } from "@/modules/workspaces/services/workspaces.service";

import { SETTINGS_SECTIONS, type SettingsHref, settingsReturn } from "../lib/pages";

/** Each page's glyph, and the tint it wears on the phone's settings list. */
const ICONS: Record<SettingsHref, { icon: () => JSX.Element; tone: FeedTone }> = {
	"/settings/profile": { icon: () => <UserIcon />, tone: "accent" },
	"/settings/notifications": { icon: () => <BellIcon />, tone: "danger" },
	"/settings/appearance": { icon: () => <PaletteIcon />, tone: "violet" },
	"/settings/general": { icon: () => <SettingsIcon />, tone: "neutral" },
	"/settings/members": { icon: () => <UserIcon />, tone: "warning" },
	"/settings/connectors": { icon: () => <PlugIcon />, tone: "accent" },
	"/settings/agents": { icon: () => <AsteriskIcon />, tone: "violet" },
	"/settings/roles": { icon: () => <UserIcon />, tone: "accent" },
	"/settings/machines": { icon: () => <LaptopIcon />, tone: "success" },
};

export function settingsTone(href: SettingsHref): FeedTone {
	return ICONS[href].tone;
}

export function settingsIcon(href: SettingsHref): JSX.Element {
	return ICONS[href].icon();
}

/**
 * While settings are open they take the panel's place beside the rail, as the Figma settings
 * screens draw it: the way back to where you were, then the pages in their groups. The same
 * list is the phone drawer's panel.
 */
export function SettingsSidebar(props: { bare?: boolean } = {}): JSX.Element {
	const location = useLocation();
	const navigate = useNavigate();
	const auth = useAuth();
	const workspaces = useWorkspaces();
	const [members, setMembers] = createSignal<number | null>(null);
	// How many people are in the workspace, beside Members (Figma 24's sidebar count).
	createEffect(
		() => [auth.token(), workspaces.current()?.slug] as const,
		([token, slug]) => {
			if (!token || !slug) return;
			workspacesService.members(token, slug).then(
				(list) => setMembers(list.length),
				() => setMembers(null),
			);
		},
	);
	const trailing = (href: SettingsHref): JSX.Element => {
		if (href === "/settings/members") return members() ?? undefined;
		// The built-in four and the workspace's own (Figma 24's sidebar count).
		if (href === "/settings/roles")
			return 4 + (workspaces.current()?.settings?.customRoles?.length ?? 0);
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
