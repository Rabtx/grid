import { useLocation } from "@solidjs/router";
import type { JSX } from "@solidjs/web";
import { createEffect, Show } from "solid-js";

import { AppFrame, AuthFrame, FloatingNotice } from "@/kit";
import { runnerUp } from "@/lib/runner-health";
import { useAuth } from "@/modules/auth";
import { inboxStore, waitedOn } from "@/modules/inbox";
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
import { SettingsSidebar, settingsReturn } from "@/modules/settings";
import { VoiceControls } from "@/modules/voice";
import { CreateWorkspaceSheet, WorkspacesProvider } from "@/modules/workspaces";

// Pages outside any workspace keep the signed-out frame even for someone signed in.
const OUTSIDE = /^\/(login|setup|invite)(\/|$)/;

// Pages that draw their whole screen themselves.
const STANDALONE = /^\/design(\/|$)/;

// Screens that fill the frame edge to edge and scroll inside themselves.
const FULL_BLEED = /^\/(chat|terminal|files|notes|pulls|board|inbox|automations|settings)(\/|$)/;
const SETTINGS = /^\/settings(\/|$)/;

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
	const auth = useAuth();
	const location = useLocation();
	const inSettings = () => SETTINGS.test(location.pathname);

	// "Back to app" in settings returns to the last screen outside them.
	createEffect(
		() => location.pathname + location.search,
		(path) => {
			settingsReturn.remember(path);
		},
	);

	// Opening the thread or the pull request an item waits on deals with it, however the person
	// got there: from the Inbox, from a push notification, or from a link somebody sent. The
	// router's own paths carry no workspace (`lib/workspace-history.ts`), which is what the inbox
	// stores its urls as.
	createEffect(
		() => [location.pathname, auth.token()] as const,
		([path, token]) => {
			const page = waitedOn(path);
			if (token && page) void inboxStore.readPage(token, page);
		},
	);

	return (
		<AppFrame
			sidebar={
				shell.desktop() && !shell.collapsed() ? (
					<Show when={inSettings()} fallback={<Sidebar />}>
						<SettingsSidebar />
					</Show>
				) : undefined
			}
			header={
				<Show when={shell.desktop()} fallback={<TopBar />}>
					<TitleBar />
				</Show>
			}
			bleed={FULL_BLEED.test(location.pathname)}
			overlays={
				<>
					<NavDrawer content={inSettings() ? () => <SettingsSidebar /> : undefined} />
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
