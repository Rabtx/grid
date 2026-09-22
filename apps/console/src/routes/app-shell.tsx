import type { JSX } from "@solidjs/web";
import { Show } from "solid-js";

import { useAuth } from "@/modules/auth";

/** Frame shared by every route: the brand bar, and sign-out once there is a session. */
export function AppShell(props: { children: JSX.Element }): JSX.Element {
	const auth = useAuth();

	return (
		<div class="min-h-dvh bg-background text-foreground">
			<header class="flex items-center justify-between border-border border-b px-4 py-3">
				<span class="font-semibold text-sm tracking-tight">Grid</span>
				<Show when={auth.user()}>
					{(user) => (
						<span class="flex items-center gap-3 text-xs">
							<span class="text-muted-foreground">{user().email}</span>
							<button
								type="button"
								onClick={() => void auth.logout()}
								class="rounded-md border border-border px-2 py-1"
							>
								Sign out
							</button>
						</span>
					)}
				</Show>
			</header>
			<main class="p-4">{props.children}</main>
		</div>
	);
}
