import { useNavigate } from "@solidjs/router";
import type { JSX } from "@solidjs/web";
import { Show } from "solid-js";

import { Page, PaneHeader, Text } from "@/kit";

/**
 * One settings page: the pane header every screen has (its title and actions over a full-width
 * divider, with the way back to the settings list on phones), then what it covers and its groups.
 * Desktop has the settings sidebar for the way back.
 */
export function SettingsPage(props: {
	title: string;
	description?: string;
	actions?: JSX.Element;
	children: JSX.Element;
}): JSX.Element {
	const navigate = useNavigate();
	return (
		<div class="flex min-h-0 flex-1 flex-col">
			<PaneHeader
				title={props.title}
				actions={props.actions}
				onBack={() => navigate("/settings")}
				backLabel="Settings"
			/>
			<Page width="md">
				<Show when={props.description}>
					<Text tone="subtle" class="-mb-4">
						{props.description}
					</Text>
				</Show>
				{props.children}
			</Page>
		</div>
	);
}
