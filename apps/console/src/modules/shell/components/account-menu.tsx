import type { JSX } from "@solidjs/web";
import { For } from "solid-js";

import { workspaceHref } from "@/lib/active-workspace";
import { appearance, type Theme, updateAppearance } from "@/lib/appearance";
import { useAuth } from "@/modules/auth";
import { ComputerIcon, MoonIcon, Popover, SettingsIcon, SignOutIcon, SunIcon } from "@/ui";

const ROW =
	"focus-ring flex h-row w-full items-center gap-2.5 rounded-md px-2 text-left text-ink/80 text-ui transition-colors duration-fast ease-out-grid hover:bg-ink/6 hover:text-ink pointer-coarse:min-h-12";

const THEMES: { value: Theme; label: string; icon: (props: { class?: string }) => JSX.Element }[] =
	[
		{ value: "light", label: "Light", icon: SunIcon },
		{ value: "dark", label: "Dark", icon: MoonIcon },
		{ value: "system", label: "Match system", icon: ComputerIcon },
	];

/** Your initial in a circle: who is signed in, at the foot of the navigation. */
function Avatar(props: { name: string }): JSX.Element {
	return (
		<span
			aria-hidden="true"
			class="grid size-6 shrink-0 place-items-center rounded-full bg-ink/10 font-medium text-ink/75 text-ui-xs uppercase"
		>
			{props.name.slice(0, 1)}
		</span>
	);
}

/**
 * Who is signed in, and what belongs to them rather than the workspace: the theme, settings and
 * signing out. Opens above the row on desktop and as a bottom sheet on phones.
 */
export function AccountMenu(): JSX.Element {
	const auth = useAuth();
	const name = () => auth.user()?.username ?? "Account";

	return (
		<Popover
			label="Account"
			panelClass="md:w-60"
			triggerClass="focus-ring flex h-9 w-full min-w-0 items-center gap-2 rounded-md px-1.5 text-left transition-colors duration-fast ease-out-grid hover:bg-ink/6 pointer-coarse:h-12"
			trigger={
				<>
					<Avatar name={name()} />
					<span class="min-w-0 flex-1 truncate text-ink/80 text-ui">{name()}</span>
				</>
			}
		>
			{(close) => (
				<div class="flex flex-col p-1.5 md:p-1">
					<div class="flex items-center gap-2.5 px-2 py-2">
						<Avatar name={name()} />
						<div class="min-w-0">
							<p class="truncate font-medium text-ink text-ui">{name()}</p>
							<p class="truncate text-ink/50 text-ui-xs">{auth.user()?.email}</p>
						</div>
					</div>
					<div class="my-1 h-px bg-stroke" />
					<div class="flex h-row items-center gap-2.5 px-2 pointer-coarse:min-h-12">
						<span class="flex-1 text-ink/80 text-ui">Theme</span>
						<fieldset class="flex rounded-md border-0 bg-ink/5 p-0.5">
							<legend class="sr-only">Theme</legend>
							<For each={THEMES}>
								{(theme) => (
									<button
										type="button"
										title={theme.label}
										aria-label={theme.label}
										aria-pressed={appearance().theme === theme.value ? "true" : "false"}
										onClick={() => updateAppearance({ theme: theme.value })}
										class="focus-ring grid size-6 place-items-center rounded-sm text-ink/50 transition-colors duration-fast ease-out-grid hover:text-ink aria-pressed:bg-canvas aria-pressed:text-ink aria-pressed:shadow-sm pointer-coarse:size-9"
									>
										<theme.icon class="size-3.5" />
									</button>
								)}
							</For>
						</fieldset>
					</div>
					<a href={workspaceHref("/settings/appearance")} class={ROW} onClick={() => close()}>
						<SettingsIcon class="size-4 shrink-0 text-ink/55" />
						Settings
					</a>
					<div class="my-1 h-px bg-stroke" />
					<button
						type="button"
						class={ROW}
						onClick={() => {
							close();
							void auth.logout();
						}}
					>
						<SignOutIcon class="size-4 shrink-0 text-ink/55" />
						Sign out
					</button>
				</div>
			)}
		</Popover>
	);
}
