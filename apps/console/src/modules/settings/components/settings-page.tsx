import { useNavigate } from "@solidjs/router";
import type { JSX } from "@solidjs/web";
import { Show } from "solid-js";

import {
	BackIcon,
	IconButton,
	iconButton,
	Menu,
	type MenuGroup,
	MoreIcon,
	SettingsColumn,
	Text,
} from "@/kit";
import { useWorkspaces } from "@/modules/workspaces";
import { ShellSlot } from "@/modules/shell";

/**
 * One settings page (Figma 24 · Settings): "Settings / Profile" in the top bar with "Saved
 * automatically" and the page's own actions beside it, then the page's 720px column — its title
 * and what it covers, and its groups. Phones get the page's name over the workspace's and the way
 * back to the settings list.
 */
export function SettingsPage(props: {
	title: string;
	description?: string;
	/** Beside "Saved automatically" in the top bar. */
	actions?: JSX.Element;
	/** The page's ⋯ menu: in the top bar on desktop, the round button on the right on phones. */
	menu?: (phone: boolean) => JSX.Element;
	/** Under the title on phones (Owner · RabtX); the workspace's name when not given. */
	subtitle?: string;
	/** Pages whose changes are not saved as they are made (Members) leave this off. */
	autosaves?: boolean;
	children: JSX.Element;
}): JSX.Element {
	const navigate = useNavigate();
	const workspaces = useWorkspaces();
	return (
		<div class="flex min-h-0 flex-1 flex-col">
			<ShellSlot name="crumb">{props.title}</ShellSlot>
			<ShellSlot name="actions">
				<Show when={props.autosaves !== false}>
					<Text size="caption" tone="subtle" class="max-md:hidden">
						Saved automatically
					</Text>
				</Show>
				{props.actions}
				{props.menu?.(false)}
			</ShellSlot>
			{/* Phones: the page's menu on the right, or nothing (never another screen's action). */}
			<ShellSlot name="trailing">{props.menu?.(true) ?? <span aria-hidden="true" />}</ShellSlot>
			<ShellSlot name="heading">
				<div class="flex min-w-0 flex-col items-center">
					<Text as="h1" tone="strong" weight="medium" size="body-lg" truncate>
						{props.title}
					</Text>
					<Text size="caption" tone="subtle" truncate>
						{props.subtitle ?? workspaces.current()?.name ?? "Settings"}
					</Text>
				</div>
			</ShellSlot>
			<ShellSlot name="leading">
				<IconButton
					label="Settings"
					variant="secondary"
					shape="round"
					size="lg"
					onClick={() => navigate("/settings")}
				>
					<BackIcon />
				</IconButton>
			</ShellSlot>
			<SettingsColumn title={props.title} description={props.description}>
				{props.children}
			</SettingsColumn>
		</div>
	);
}

/** A settings page's ⋯ menu, drawn for the desktop top bar or the phone's round button. */
export function settingsMenu(
	label: string,
	groups: readonly MenuGroup[],
	onSelect: (id: string) => void,
): (phone: boolean) => JSX.Element {
	return (phone) => (
		<Menu
			label={label}
			title={phone ? label : undefined}
			trigger={<MoreIcon />}
			triggerClass={
				phone
					? iconButton({ size: "lg", shape: "round", variant: "secondary" })
					: iconButton({ size: "sm" })
			}
			placement="bottom-end"
			groups={groups}
			onSelect={onSelect}
		/>
	);
}
