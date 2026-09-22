import type { JSX } from "@solidjs/web";
import { Show } from "solid-js";

import { useAuth } from "@/modules/auth";
import { NewTaskDialog, WorkspaceProvider } from "@/modules/projects";
import { NavDrawer, ProjectNav, TopBar, WorkspaceHeader } from "@/modules/shell";

/**
 * Frame shared by every route. Signed out it is just the brand; signed in it is one layout
 * that grows up: a top bar and drawer on phones, a persistent sidebar from `lg:`.
 */
export function AppShell(props: { children: JSX.Element }): JSX.Element {
	const auth = useAuth();

	return (
		<div class="min-h-dvh bg-background text-foreground">
			<Show when={auth.token()} fallback={<SignedOutShell>{props.children}</SignedOutShell>}>
				<WorkspaceProvider>
					<SignedInShell>{props.children}</SignedInShell>
				</WorkspaceProvider>
			</Show>
		</div>
	);
}

function SignedOutShell(props: { children: JSX.Element }): JSX.Element {
	return (
		<>
			<header class="px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 md:px-6">
				<span class="font-semibold text-ui-lg">Grid</span>
			</header>
			<main class="px-4 pb-[max(1rem,env(safe-area-inset-bottom))] md:px-6">{props.children}</main>
		</>
	);
}

function SignedInShell(props: { children: JSX.Element }): JSX.Element {
	let drawer: HTMLDialogElement | undefined;

	return (
		<div class="lg:grid lg:grid-cols-[15rem_minmax(0,1fr)]">
			<aside class="sticky top-0 hidden h-dvh border-border border-r bg-muted lg:block">
				<ProjectNav />
			</aside>
			<div class="flex min-h-dvh min-w-0 flex-col">
				<TopBar onOpenMenu={() => drawer?.showModal()} />
				<WorkspaceHeader />
				<main class="min-w-0 flex-1 px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] md:px-6 lg:px-8 lg:pt-6">
					{props.children}
				</main>
			</div>
			<NavDrawer dialogRef={(el) => (drawer = el)} />
			<NewTaskDialog />
		</div>
	);
}
