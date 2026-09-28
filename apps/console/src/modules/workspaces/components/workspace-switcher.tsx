import { useNavigate } from "@solidjs/router";
import type { JSX } from "@solidjs/web";
import { Loading } from "solid-js";

import {
	CheckIcon,
	Menu,
	menuTrigger,
	PlusIcon,
	SettingsIcon,
	Skeleton,
	Text,
	UnfoldIcon,
	WorkspaceMark,
} from "@/kit";

import { useWorkspaces } from "../context/workspaces-context";

/**
 * The workspace you are in, at the top of the navigation, and the menu to move between them or
 * make another: anchored under the name on desktop, a bottom sheet on phones.
 */
export function WorkspaceSwitcher(): JSX.Element {
	const workspaces = useWorkspaces();
	const navigate = useNavigate();
	const name = () => workspaces.current()?.name ?? "Grid";

	return (
		<Loading fallback={<Skeleton class="h-8 w-32" />}>
			<Menu
				label="Switch workspace"
				width="md:w-64"
				triggerClass={menuTrigger({ width: "fill" })}
				trigger={
					<>
						<WorkspaceMark name={name()} color={workspaces.current()?.color} />
						<Text as="span" size="body-lg" tone="strong" weight="medium" truncate>
							{name()}
						</Text>
						<UnfoldIcon size="sm" class="text-fg-faint" />
					</>
				}
				groups={[
					{
						label: "Workspaces",
						items: workspaces.list().map((workspace) => ({
							id: `ws:${workspace.slug}`,
							label: workspace.name,
							icon: <WorkspaceMark name={workspace.name} color={workspace.color} size="xs" />,
							trailing: workspace.slug === workspaces.current()?.slug ? <CheckIcon /> : undefined,
						})),
					},
					{
						items: [
							{ id: "create", label: "Create workspace", icon: <PlusIcon /> },
							{ id: "settings", label: "Settings", icon: <SettingsIcon />, shortcut: "Mod ," },
						],
					},
				]}
				onSelect={(id) => {
					if (id === "create") workspaces.setCreateOpen(true);
					else if (id === "settings") navigate("/settings/appearance");
					else {
						const target = workspaces.list().find((workspace) => `ws:${workspace.slug}` === id);
						if (target) workspaces.switchTo(target);
					}
				}}
			/>
		</Loading>
	);
}
