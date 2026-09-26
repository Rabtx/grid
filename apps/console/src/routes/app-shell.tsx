import { useLocation } from "@solidjs/router";
import type { JSX } from "@solidjs/web";
import { onSettled, Show } from "solid-js";

import { useAuth } from "@/modules/auth";
import {
	AddProjectSheet,
	ChooseFolderSheet,
	NewTaskDialog,
	ProjectActionDialogs,
	ProjectLookSheet,
	WorkspaceProvider,
} from "@/modules/projects";
import {
	CommandPalette,
	NavDrawer,
	OfflineBanner,
	ShellProvider,
	ShortcutsHelp,
	Sidebar,
	StatusBar,
	TitleBar,
	TopBar,
	UpdateBanner,
	useShell,
} from "@/modules/shell";
import { VoiceControls } from "@/modules/voice";
import { CreateWorkspaceSheet, WorkspacesProvider } from "@/modules/workspaces";
import { BrandLogo } from "@/ui";

/**
 * Frame shared by every route. Signed out it is just the brand; signed in it is one layout
 * that grows up: a top bar and drawer on phones, a persistent sidebar from `lg:`.
 */
// Pages outside any workspace keep the signed-out frame even for someone signed in.
const OUTSIDE = /^\/(login|setup|invite)(\/|$)/;

// Pages that draw their whole screen themselves.
const STANDALONE = /^\/design(\/|$)/;

export function AppShell(props: { children: JSX.Element }): JSX.Element {
	const auth = useAuth();
	const location = useLocation();

	return (
		<Show when={!STANDALONE.test(location.pathname)} fallback={props.children}>
			<div class="min-h-dvh bg-canvas text-ink">
				{/* Restoring (opening for someone signed in last time) is signed in: their screens need
			    the workspace from the first render, or they have nothing to read. */}
				<Show
					when={(auth.token() || auth.restoring()) && !OUTSIDE.test(location.pathname)}
					fallback={<SignedOutShell>{props.children}</SignedOutShell>}
				>
					<WorkspacesProvider>
						<WorkspaceProvider>
							<SignedInShell>{props.children}</SignedInShell>
						</WorkspaceProvider>
					</WorkspacesProvider>
				</Show>
				<OfflineBanner />
				<UpdateBanner />
			</div>
		</Show>
	);
}

function SignedOutShell(props: { children: JSX.Element }): JSX.Element {
	return (
		<div class="flex min-h-dvh flex-col md:bg-backdrop">
			<header class="flex h-14 shrink-0 items-center px-4 pt-[env(safe-area-inset-top)] md:h-24 md:justify-center">
				<BrandLogo class="h-6" />
			</header>
			<main class="flex flex-1 items-start justify-center px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] md:px-6 md:pt-[2vh]">
				{props.children}
			</main>
		</div>
	);
}

function SignedInShell(props: { children: JSX.Element }): JSX.Element {
	return (
		<ShellProvider>
			<ShellFrame>{props.children}</ShellFrame>
		</ShellProvider>
	);
}

// Screens that fill the frame edge to edge and scroll inside themselves.
const FULL_BLEED = /^\/(chat|terminal)(\/|$)/;

/**
 * The signed-in frame, sized to the visible viewport so everything stays above a phone keyboard.
 * Desktop: the sidebar on the backdrop, and the screen on a raised canvas panel beside it under
 * its title bar. Phone: the screen edge to edge under a top bar, the sidebar in a drawer.
 */
function ShellFrame(props: { children: JSX.Element }): JSX.Element {
	const shell = useShell();
	const location = useLocation();

	onSettled(() => {
		const html = document.documentElement;
		const fit = () => {
			const height = window.visualViewport?.height ?? window.innerHeight;
			html.style.setProperty("--app-height", `${height}px`);
		};
		fit();
		// The frame scrolls inside itself; the page never does.
		const previous = html.style.overflow;
		html.style.overflow = "hidden";
		window.visualViewport?.addEventListener("resize", fit);
		window.addEventListener("resize", fit);
		return () => {
			html.style.overflow = previous;
			html.style.removeProperty("--app-height");
			window.visualViewport?.removeEventListener("resize", fit);
			window.removeEventListener("resize", fit);
		};
	});

	return (
		<div class="flex h-[var(--app-height,100dvh)] overflow-hidden bg-canvas lg:bg-backdrop">
			<Show when={shell.desktop()}>
				<Show when={!shell.collapsed()}>
					<aside class="w-60 shrink-0">
						<Sidebar />
					</aside>
				</Show>
			</Show>
			<div
				class={`flex min-w-0 flex-1 flex-col lg:py-2 lg:pr-2 ${shell.collapsed() ? "lg:pl-2" : ""}`}
			>
				<div class="flex min-h-0 flex-1 flex-col overflow-hidden bg-canvas lg:rounded-xl lg:border lg:border-ink/8 lg:shadow-[0_1px_2px_rgb(0_0_0/0.03)]">
					<Show when={shell.desktop()} fallback={<TopBar />}>
						<TitleBar />
					</Show>
					<main
						class={
							FULL_BLEED.test(location.pathname)
								? "flex min-h-0 flex-1 flex-col overflow-hidden"
								: "min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pt-3 pb-4 md:px-6 lg:px-6 lg:pt-5"
						}
					>
						{props.children}
					</main>
					<StatusBar />
				</div>
			</div>
			<NavDrawer />
			<CommandPalette />
			<NewTaskDialog />
			<AddProjectSheet />
			<ChooseFolderSheet />
			<ProjectActionDialogs />
			<ProjectLookSheet />
			<CreateWorkspaceSheet />
			<VoiceControls />
			<ShortcutsHelp />
		</div>
	);
}
