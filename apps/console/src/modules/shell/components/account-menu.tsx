import { useNavigate } from "@solidjs/router";
import type { JSX } from "@solidjs/web";
import { createEffect, createSignal, untrack } from "solid-js";

import {
	Avatar,
	BotIcon,
	CheckIcon,
	ComputerIcon,
	LaptopIcon,
	Menu,
	menuTrigger,
	MoonIcon,
	PlugIcon,
	PlusIcon,
	railItem,
	Row,
	Segmented,
	SettingsIcon,
	SignOutIcon,
	Stack,
	SunIcon,
	Text,
	WorkspaceMark,
} from "@/kit";
import { appearance, type Theme, updateAppearance } from "@/lib/appearance";
import { useAuth } from "@/modules/auth";
import { accountService } from "@/modules/settings/services/account.service";
import { useWorkspaces } from "@/modules/workspaces";

const THEMES: { id: Theme; label: string; icon: () => JSX.Element }[] = [
	{ id: "light", label: "Light", icon: () => <SunIcon /> },
	{ id: "dark", label: "Dark", icon: () => <MoonIcon /> },
	{ id: "system", label: "System", icon: () => <ComputerIcon /> },
];

/** Where people go most from their own menu, in one tap. */
const SHORTCUTS: { id: string; label: string; href: string; icon: () => JSX.Element }[] = [
	{ id: "go:/agents", label: "Agents", href: "/agents", icon: () => <BotIcon /> },
	{ id: "go:/machines", label: "Machines", href: "/machines", icon: () => <LaptopIcon /> },
	{
		id: "go:/settings/connectors",
		label: "Connectors",
		href: "/settings/connectors",
		icon: () => <PlugIcon />,
	},
];

// The signed-in person's own name and photo, read once per sign-in for the avatar.
const [me, setMe] = createSignal<{ id: string; name: string | null; photo: string | null } | null>(
	null,
);

/**
 * Who is signed in and what belongs to them: the workspace they are in (and the others they can
 * move to, or a new one), the theme, settings and signing out. Opens above the row on desktop and
 * as a bottom sheet on phones.
 */
export function AccountMenu(props: {
	compact?: boolean;
	/** Just the avatar, opening below it: the floating top bar's right end. */
	avatar?: boolean;
}): JSX.Element {
	const auth = useAuth();
	const workspaces = useWorkspaces();
	const navigate = useNavigate();
	createEffect(
		() => auth.user()?.id ?? null,
		(id) => {
			const token = untrack(auth.token);
			if (!id || !token || untrack(me)?.id === id) return;
			void accountService.me(token).then(
				(person) =>
					setMe({
						id,
						name: person.profile.displayName,
						photo: person.profile.avatarUrl,
					}),
				() => undefined,
			);
		},
	);
	const mine = () => (me()?.id === auth.user()?.id ? me() : null);
	const name = () => mine()?.name || auth.user()?.username || "Account";
	const photo = () => mine()?.photo ?? null;

	return (
		<Menu
			label="Account"
			placement={props.avatar ? "bottom-end" : "top-start"}
			width="md:w-60"
			triggerClass={
				props.avatar
					? menuTrigger({ shape: "icon" })
					: props.compact
						? railItem()
						: menuTrigger({ size: "md", width: "full" })
			}
			trigger={
				props.compact || props.avatar ? (
					<Avatar name={name()} src={photo()} ring />
				) : (
					<>
						<Avatar name={name()} src={photo()} ring />
						<Text as="span" size="inherit" truncate class="flex-1">
							{name()}
						</Text>
					</>
				)
			}
			header={
				<Stack gap={2.5} class="px-2 py-2">
					<Row gap={2.5}>
						<Avatar name={name()} src={photo()} size="lg" />
						<Stack gap={0} class="min-w-0">
							<Text tone="strong" weight="medium" truncate>
								{name()}
							</Text>
							<Text size="caption" tone="subtle" truncate>
								{auth.user()?.email}
							</Text>
						</Stack>
					</Row>
					{/* The theme as one switch, not three rows. */}
					<Segmented<Theme>
						label="Theme"
						block
						size="sm"
						value={appearance().theme}
						onChange={(theme) => updateAppearance({ theme })}
						options={THEMES.map((theme) => ({
							value: theme.id,
							label: theme.label,
							icon: theme.icon(),
						}))}
					/>
				</Stack>
			}
			groups={[
				{
					label: "Workspace",
					items: [
						...workspaces.list().map((workspace) => ({
							id: `ws:${workspace.slug}`,
							label: workspace.name,
							icon: <WorkspaceMark name={workspace.name} color={workspace.color} size="xs" />,
							trailing: workspace.slug === workspaces.current()?.slug ? <CheckIcon /> : undefined,
						})),
						{ id: "create", label: "Create workspace", icon: <PlusIcon /> },
					],
				},
				{
					items: SHORTCUTS.map((shortcut) => ({
						id: shortcut.id,
						label: shortcut.label,
						icon: shortcut.icon(),
					})),
				},
				{
					items: [
						{ id: "settings", label: "Settings", icon: <SettingsIcon />, shortcut: "Mod ," },
						{ id: "signout", label: "Sign out", icon: <SignOutIcon /> },
					],
				},
			]}
			onSelect={(id) => {
				if (id.startsWith("go:")) navigate(id.slice(3));
				else if (id.startsWith("ws:")) {
					const target = workspaces.list().find((workspace) => `ws:${workspace.slug}` === id);
					if (target && target.slug !== workspaces.current()?.slug) workspaces.switchTo(target);
				} else if (id === "create") workspaces.setCreateOpen(true);
				else if (id === "settings") navigate("/settings");
				else void auth.logout();
			}}
		/>
	);
}
