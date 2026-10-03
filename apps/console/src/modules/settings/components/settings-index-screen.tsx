import { useNavigate } from "@solidjs/router";
import type { JSX } from "@solidjs/web";
import { For, onSettled } from "solid-js";

import {
	AgentLogo,
	Avatar,
	IconButton,
	SearchIcon,
	SettingsLink,
	SettingsLinkGroup,
	SettingsProfileLink,
	Text,
} from "@/kit";
import { workspaceHref } from "@/lib/active-workspace";
import { appearance } from "@/lib/appearance";
import { runnerUp } from "@/lib/runner-health";
import { useAuth } from "@/modules/auth";
import { offeredProviders, providersStore } from "@/modules/chat/stores/providers";
import { ShellSlot, useShell } from "@/modules/shell";
import { useWorkspaces } from "@/modules/workspaces";
import { ROLE_LABEL } from "@/modules/workspaces/lib/members";

import { SETTINGS_SECTIONS, type SettingsHref } from "../lib/pages";

import { settingsIcon, settingsTone } from "./settings-sidebar";

// Desktop has the settings sidebar, so the list opens straight onto the first page.
const DESKTOP = "(min-width: 64rem)";

// Phones list the agents first, as the Figma settings home does: they are what Grid is for.
const PHONE_ORDER = ["Agents", "Workspace", "You"] as const;

const THEME_LABEL = { system: "System", light: "Light", dark: "Dark" } as const;

/**
 * `/settings` (Figma 24 · Settings · Home): on phones, who is signed in, then the pages in their
 * groups with what each says now; on desktop, straight to Profile, with the sidebar listing the
 * rest.
 */
export function SettingsIndexScreen(): JSX.Element {
	const navigate = useNavigate();
	const auth = useAuth();
	const shell = useShell();
	const workspaces = useWorkspaces();

	onSettled(() => {
		if (matchMedia(DESKTOP).matches) navigate("/settings/profile", { replace: true });
		const token = auth.token();
		if (token) void providersStore.load(token);
	});

	const name = () => auth.user()?.username ?? "Signed in";
	const meta = () => {
		const current = workspaces.current();
		return [current ? ROLE_LABEL[current.role] : null, current?.name].filter(Boolean).join(" · ");
	};
	const sections = () =>
		PHONE_ORDER.flatMap((label) => SETTINGS_SECTIONS.filter((section) => section.label === label));
	const trailing = (href: SettingsHref): JSX.Element => {
		if (href === "/settings/appearance") return THEME_LABEL[appearance().theme];
		if (href === "/settings/environments") return runnerUp() ? "Online" : "Offline";
		if (href === "/settings/agents")
			return (
				<For each={offeredProviders(providersStore.providers()).slice(0, 3)}>
					{(agent) => <AgentLogo id={agent.id} name={agent.name} />}
				</For>
			);
		return undefined;
	};

	return (
		<div class="flex min-h-0 flex-1 flex-col">
			<ShellSlot name="heading">
				<div class="flex min-w-0 flex-col items-center">
					<Text as="h1" tone="strong" weight="medium" size="body-lg" truncate>
						Settings
					</Text>
					<Text size="caption" tone="subtle" truncate>
						{workspaces.current()?.name ?? "Grid"}
					</Text>
				</div>
			</ShellSlot>
			<ShellSlot name="trailing">
				<IconButton
					label="Search"
					variant="secondary"
					shape="round"
					size="lg"
					onClick={() => shell.setPaletteOpen(true)}
				>
					<SearchIcon />
				</IconButton>
			</ShellSlot>
			<div class="min-h-0 flex-1 overflow-y-auto overscroll-contain">
				<div class="mx-auto flex w-full max-w-120 flex-col gap-4 px-4 pt-2 pb-8">
					<SettingsProfileLink
						href={workspaceHref("/settings/profile")}
						mark={<Avatar name={name()} size="lg" />}
						name={name()}
						meta={meta()}
					/>
					<For each={sections()}>
						{(section) => (
							<SettingsLinkGroup label={section.label}>
								<For each={section.pages.filter((page) => page.href !== "/settings/profile")}>
									{(page) => (
										<SettingsLink
											href={workspaceHref(page.href)}
											icon={settingsIcon(page.href)}
											tone={settingsTone(page.href)}
											label={page.label}
											trailing={trailing(page.href)}
										/>
									)}
								</For>
							</SettingsLinkGroup>
						)}
					</For>
				</div>
			</div>
		</div>
	);
}
