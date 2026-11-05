import { useNavigate } from "@solidjs/router";
import type { JSX } from "@solidjs/web";
import { createSignal, For, onSettled, Show, untrack } from "solid-js";

import { Avatar, SettingsGroup, SettingsLinkRow, StatusDot } from "@/kit";
import { workspaceHref } from "@/lib/active-workspace";
import { runnerUp } from "@/lib/runner-health";
import { useAuth } from "@/modules/auth";
import { ShellSlot, useShell } from "@/modules/shell";

import { SETTINGS_SECTIONS, type SettingsHref } from "../lib/pages";
import { accountService } from "../services/account.service";

import { settingsIcon } from "./settings-sidebar";

/**
 * `/settings`: the way into settings, not a screen of its own. Desktop has the list beside the
 * screen, so it opens that list's first page. A phone has no sidebar there, so the phone gets
 * its own settings home: who you are on top, then each group of pages as one card of rows.
 */
export function SettingsRoute(): JSX.Element {
	const shell = useShell();
	const navigate = useNavigate();

	onSettled(() => {
		if (shell.desktop()) navigate("/settings/profile", { replace: true });
	});

	return (
		<Show when={!shell.desktop()}>
			{/* No new thread here: the phone bar keeps that action for screens you work in. */}
			<ShellSlot name="trailing">
				{/* As wide as the menu button, so the title stays in the middle. */}
				<span aria-hidden="true" class="size-11 shrink-0" />
			</ShellSlot>
			<div class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-gutter pt-2 pb-10">
				<PhoneSettings />
			</div>
		</Show>
	);
}

/**
 * Settings on a phone, as a phone's own settings app draws them: your card first (photo, name,
 * email, to your profile), then You · Workspace · Agents, each a card of rows with the page's
 * glyph, its name and what it is for, and a chevron.
 */
function PhoneSettings(): JSX.Element {
	const auth = useAuth();
	const navigate = useNavigate();
	const [me, setMe] = createSignal<{ name: string | null; photo: string | null } | null>(null);
	onSettled(() => {
		const token = untrack(auth.token);
		if (!token) return;
		void accountService.me(token).then(
			(person) => setMe({ name: person.profile.displayName, photo: person.profile.avatarUrl }),
			() => undefined,
		);
	});
	const name = () => me()?.name || auth.user()?.username || "Your account";
	const open = (href: SettingsHref) => navigate(workspaceHref(href));
	const value = (href: SettingsHref): JSX.Element =>
		href === "/settings/machines" ? (
			<span class="flex items-center gap-1.5">
				<StatusDot
					status={runnerUp() ? "online" : "offline"}
					size="sm"
					label={runnerUp() ? "This machine is online" : "This machine is offline"}
				/>
				{runnerUp() ? "Online" : "Offline"}
			</span>
		) : undefined;

	return (
		<div class="flex flex-col gap-6">
			<SettingsGroup title="Account">
				<SettingsLinkRow
					label={name()}
					description={auth.user()?.email}
					mark={<Avatar name={name()} src={me()?.photo ?? null} size="lg" />}
					onClick={() => open("/settings/profile")}
				/>
			</SettingsGroup>
			<For each={SETTINGS_SECTIONS}>
				{(section) => (
					<SettingsGroup title={section.label}>
						<For each={section.pages}>
							{(page) => (
								<SettingsLinkRow
									label={page.label}
									description={page.description}
									leading={settingsIcon(page.href)}
									value={value(page.href)}
									onClick={() => open(page.href)}
								/>
							)}
						</For>
					</SettingsGroup>
				)}
			</For>
		</div>
	);
}
