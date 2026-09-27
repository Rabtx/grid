import { useNavigate } from "@solidjs/router";
import type { JSX } from "@solidjs/web";
import { For, onSettled } from "solid-js";

import { ChevronRightIcon, ListCard, NavLink, Page, PageHeader, Section } from "@/kit";
import { workspaceHref } from "@/lib/active-workspace";

import { SETTINGS_SECTIONS } from "../lib/pages";

import { settingsIcon } from "./settings-sidebar";

// Desktop has the settings sidebar, so the list opens straight onto the first page.
const DESKTOP = "(min-width: 64rem)";

/**
 * `/settings`: on phones, the list of settings pages in their groups, as a native app's
 * settings open; on desktop, straight to Appearance, with the sidebar listing the rest.
 */
export function SettingsIndexScreen(): JSX.Element {
	const navigate = useNavigate();

	onSettled(() => {
		if (matchMedia(DESKTOP).matches) navigate("/settings/appearance", { replace: true });
	});

	return (
		<Page width="sm">
			<PageHeader title="Settings" />
			<For each={SETTINGS_SECTIONS}>
				{(section) => (
					<Section title={section.label}>
						<ListCard>
							<div class="flex flex-col gap-px p-1">
								<For each={section.pages}>
									{(page) => (
										<NavLink
											href={workspaceHref(page.href)}
											icon={settingsIcon(page.href)}
											label={page.label}
											trailing={<ChevronRightIcon size="xs" class="text-fg-faint" />}
										/>
									)}
								</For>
							</div>
						</ListCard>
					</Section>
				)}
			</For>
		</Page>
	);
}
