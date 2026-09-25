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
 * Desktop: the sidebar (projects and their threads), then the screen under its title bar.
 * Phone: a top bar and a drawer holding the sidebar. A status bar closes both.
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
		<div class="flex h-[var(--app-height,100dvh)] overflow-hidden">
			<Show when={shell.desktop()}>
				<Show when={!shell.collapsed()}>
					<aside class="glass w-64 shrink-0 border-stroke border-r">
						<Sidebar />
					</aside>
				</Show>
			</Show>
			<div class="flex min-w-0 flex-1 flex-col">
				<Show when={shell.desktop()} fallback={<TopBar />}>
					<TitleBar />
				</Show>
				<main
					class={
						FULL_BLEED.test(location.pathname)
							? "flex min-h-0 flex-1 flex-col overflow-hidden"
							: "min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pt-3 pb-4 md:px-6 lg:px-4"
					}
				>
					{props.children}
				</main>
				<StatusBar />
			</div>
			<NavDrawer />
			<CommandPalette />
			<NewTaskDialog />
			<AddProjectSheet />
			<ChooseFolderSheet />
			<ProjectActionDialogs />
			<ProjectLookSheet />
			<VoiceControls />
			<ShortcutsHelp />
		</div>
	);
}
