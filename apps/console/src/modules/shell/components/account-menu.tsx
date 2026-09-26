import { useNavigate } from "@solidjs/router";
import type { JSX } from "@solidjs/web";

import {
	Avatar,
	CheckIcon,
	ComputerIcon,
	Menu,
	menuTrigger,
	MoonIcon,
	Row,
	SettingsIcon,
	SignOutIcon,
	Stack,
	SunIcon,
	Text,
} from "@/kit";
import { appearance, type Theme, updateAppearance } from "@/lib/appearance";
import { useAuth } from "@/modules/auth";

const THEMES: { id: Theme; label: string; icon: () => JSX.Element }[] = [
	{ id: "light", label: "Light", icon: () => <SunIcon /> },
	{ id: "dark", label: "Dark", icon: () => <MoonIcon /> },
	{ id: "system", label: "Match system", icon: () => <ComputerIcon /> },
];

/**
 * Who is signed in, and what belongs to them rather than the workspace: the theme, settings and
 * signing out. Opens above the row on desktop and as a bottom sheet on phones.
 */
export function AccountMenu(): JSX.Element {
	const auth = useAuth();
	const navigate = useNavigate();
	const name = () => auth.user()?.username ?? "Account";

	return (
		<Menu
			label="Account"
			placement="top-start"
			width="md:w-60"
			triggerClass={menuTrigger({ size: "md", width: "full" })}
			trigger={
				<>
					<Avatar name={name()} />
					<Text as="span" size="inherit" truncate class="flex-1">
						{name()}
					</Text>
				</>
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
						{ id: "settings", label: "Settings", icon: <SettingsIcon />, shortcut: "Ctrl ," },
						{ id: "signout", label: "Sign out", icon: <SignOutIcon /> },
					],
				},
			]}
			onSelect={(id) => {
				if (id.startsWith("theme:")) updateAppearance({ theme: id.slice(6) as Theme });
				else if (id === "settings") navigate("/settings/appearance");
				else void auth.logout();
			}}
		/>
	);
}
