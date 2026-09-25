import { useLocation } from "@solidjs/router";
import type { JSX } from "@solidjs/web";
import { For } from "solid-js";

const PAGES = [
	{ href: "/settings/appearance", label: "Appearance" },
	{ href: "/settings/agents", label: "Agents" },
	{ href: "/settings/environments", label: "Environments" },
];

/** The settings pages, as tabs above each one. */
export function SettingsNav(): JSX.Element {
	const location = useLocation();

	return (
		<nav aria-label="Settings" class="mb-6 flex gap-1 border-stroke border-b">
			<For each={PAGES}>
				{(page) => (
					<a
						href={page.href}
						aria-current={location.pathname === page.href ? "page" : undefined}
						class="focus-ring -mb-px flex h-9 items-center border-transparent border-b-2 px-3 text-ink/55 text-ui-sm hover:text-ink aria-[current=page]:border-ink aria-[current=page]:text-ink pointer-coarse:h-11"
					>
						{page.label}
					</a>
				)}
			</For>
		</nav>
	);
}
