import { useNavigate } from "@solidjs/router";
import type { JSX } from "@solidjs/web";

import {
	Avatar,
	CheckIcon,
	ComputerIcon,
	Menu,
	menuTrigger,
	MoonIcon,
	PlusIcon,
	railItem,
	Row,
	SettingsIcon,
	SignOutIcon,
	Stack,
	SunIcon,
	Text,
	WorkspaceMark,
} from "@/kit";
import { appearance, type Theme, updateAppearance } from "@/lib/appearance";
import { useAuth } from "@/modules/auth";
import { useWorkspaces } from "@/modules/workspaces";

const THEMES: { id: Theme; label: string; icon: () => JSX.Element }[] = [
	{ id: "light", label: "Light", icon: () => <SunIcon /> },
	{ id: "dark", label: "Dark", icon: () => <MoonIcon /> },
	{ id: "system", label: "Match system", icon: () => <ComputerIcon /> },
];

/**
 * Who is signed in and what belongs to them: the workspace they are in (and the others they can
 * move to, or a new one), the theme, settings and signing out. Opens above the row on desktop and
 * as a bottom sheet on phones.
 */
export function AccountMenu(props: { compact?: boolean }): JSX.Element {
	const auth = useAuth();
	const workspaces = useWorkspaces();
	const navigate = useNavigate();
	const name = () => auth.user()?.username ?? "Account";

	return (
		<Menu
			label="Account"
			placement="top-start"
			width="md:w-60"
			triggerClass={props.compact ? railItem() : menuTrigger({ size: "md", width: "full" })}
			trigger={
				props.compact ? (
					<Avatar name={name()} />
				) : (
					<>
						<Avatar name={name()} />
						<Text as="span" size="inherit" truncate class="flex-1">
							{name()}
						</Text>
					</>
				)
			}
			header={
				<Row gap={2.5} class="px-2 py-2">
					<Avatar name={name()} size="lg" />
					<Stack gap={0} class="min-w-0">
						<Text tone="strong" weight="medium" truncate>
							{name()}
						</Text>
						<Text size="caption" tone="subtle" truncate>
							{auth.user()?.email}
						</Text>
					</Stack>
				</Row>
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
					label: "Theme",
					items: THEMES.map((theme) => ({
						id: `theme:${theme.id}`,
						label: theme.label,
						icon: theme.icon(),
						trailing: appearance().theme === theme.id ? <CheckIcon /> : undefined,
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
				if (id.startsWith("theme:")) updateAppearance({ theme: id.slice(6) as Theme });
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
