import type { JSX } from "@solidjs/web";

import { BackIcon, Page, PageHeader, TextLink } from "@/kit";
import { workspaceHref } from "@/lib/active-workspace";

/**
 * One settings page: its title and what it covers, its actions, then its groups. On phones a way
 * back to the settings list sits above the title; desktop has the settings sidebar for that.
 */
export function SettingsPage(props: {
	title: string;
	description?: string;
	actions?: JSX.Element;
	children: JSX.Element;
}): JSX.Element {
	return (
		<Page width="md">
			<div class="-mb-4 lg:hidden">
				<TextLink tone="subtle" href={workspaceHref("/settings")} icon={<BackIcon size="sm" />}>
					Settings
				</TextLink>
			</div>
			<PageHeader title={props.title} description={props.description} actions={props.actions} />
			{props.children}
		</Page>
	);
}
