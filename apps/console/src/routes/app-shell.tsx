import type { JSX } from "@solidjs/web";
import { createSignal, Show } from "solid-js";

import { useAuth } from "@/modules/auth";
import { NewTaskDialog, WorkspaceProvider } from "@/modules/projects";
import {
	NavDrawer,
	OfflineBanner,
	ProjectNav,
	ShortcutsHelp,
	TopBar,
	UpdateBanner,
	WorkspaceHeader,
} from "@/modules/shell";
import { VoiceControls } from "@/modules/voice";
import { BrandLogo } from "@/ui";

/**
 * Frame shared by every route. Signed out it is just the brand; signed in it is one layout
 * that grows up: a top bar and drawer on phones, a persistent sidebar from `lg:`.
 */
export function AppShell(props: { children: JSX.Element }): JSX.Element {
	const auth = useAuth();

	return (
		<div class="min-h-dvh bg-canvas text-ink">
			<Show when={auth.token()} fallback={<SignedOutShell>{props.children}</SignedOutShell>}>
				<WorkspaceProvider>
					<SignedInShell>{props.children}</SignedInShell>
				</WorkspaceProvider>
			</Show>
			<OfflineBanner />
			<UpdateBanner />
		</div>
	);
}

function SignedOutShell(props: { children: JSX.Element }): JSX.Element {
	return (
		<>
			<header class="flex h-12 items-center px-4 pt-[env(safe-area-inset-top)] md:px-6">
				<BrandLogo class="h-7" />
			</header>
			<main class="px-4 pb-[max(1rem,env(safe-area-inset-bottom))] md:px-6">{props.children}</main>
		</>
	);
}

function SignedInShell(props: { children: JSX.Element }): JSX.Element {
	const [drawerOpen, setDrawerOpen] = createSignal(false);

	return (
		<div class="lg:grid lg:grid-cols-[13rem_minmax(0,1fr)]">
			<aside class="glass sticky top-0 hidden h-dvh border-stroke border-r lg:block">
				<ProjectNav />
			</aside>
			<div class="flex min-h-dvh min-w-0 flex-col">
				<TopBar onOpenMenu={() => setDrawerOpen(true)} />
				<WorkspaceHeader />
				<main class="min-w-0 flex-1 px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] md:px-6 lg:px-4 lg:pt-3">
					{props.children}
				</main>
			</div>
			<NavDrawer open={drawerOpen()} onClose={() => setDrawerOpen(false)} />
			<NewTaskDialog />
			<VoiceControls />
			<ShortcutsHelp />
		</div>
	);
}
