import { useLocation } from "@solidjs/router";
import type { JSX } from "@solidjs/web";
import { Show } from "solid-js";

import { AppFrame, AuthFrame, FloatingNotice } from "@/kit";
import { runnerUp } from "@/lib/runner-health";
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
	TitleBar,
	TopBar,
	UpdateBanner,
	useShell,
} from "@/modules/shell";
import { VoiceControls } from "@/modules/voice";
import { CreateWorkspaceSheet, WorkspacesProvider } from "@/modules/workspaces";

// Pages outside any workspace keep the signed-out frame even for someone signed in.
const OUTSIDE = /^\/(login|setup|invite)(\/|$)/;

// Pages that draw their whole screen themselves.
const STANDALONE = /^\/design(\/|$)/;

// Screens that fill the frame edge to edge and scroll inside themselves.
const FULL_BLEED = /^\/(chat|terminal|files|notes|board)(\/|$)/;

/**
 * Frame shared by every route. Signed out it is the brand over a card; signed in it is one
 * layout that grows up: a top bar and drawer on phones, a persistent sidebar from `lg:`.
 */
export function AppShell(props: { children: JSX.Element }): JSX.Element {
	const auth = useAuth();
	const location = useLocation();

	return (
		<Show when={!STANDALONE.test(location.pathname)} fallback={props.children}>
			{/* Restoring (opening for someone signed in last time) is signed in: their screens need
			    the workspace from the first render, or they have nothing to read. */}
			<Show
				when={(auth.token() || auth.restoring()) && !OUTSIDE.test(location.pathname)}
				fallback={<AuthFrame>{props.children}</AuthFrame>}
			>
				<WorkspacesProvider>
					<WorkspaceProvider>
						<ShellProvider>
							<SignedIn>{props.children}</SignedIn>
						</ShellProvider>
					</WorkspaceProvider>
				</WorkspacesProvider>
			</Show>
			<OfflineBanner />
			<UpdateBanner />
		</Show>
	);
}

/**
 * The signed-in app. Desktop: the sidebar beside the screen under its title bar. Phone: the
 * screen under a top bar, the sidebar in a drawer.
 */
function SignedIn(props: { children: JSX.Element }): JSX.Element {
	const shell = useShell();
	const location = useLocation();

	return (
		<AppFrame
			sidebar={shell.desktop() && !shell.collapsed() ? <Sidebar /> : undefined}
			header={
				<Show when={shell.desktop()} fallback={<TopBar />}>
					<TitleBar />
				</Show>
			}
			bleed={FULL_BLEED.test(location.pathname)}
			overlays={
				<>
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
					<Show when={!runnerUp()}>
						<FloatingNotice position="top">Runner offline — reconnecting…</FloatingNotice>
					</Show>
				</>
			}
		>
			{props.children}
		</AppFrame>
	);
}
