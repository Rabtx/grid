import { createRouter } from "@solidjs/router";
import type { JSX } from "@solidjs/web";
import { lazy, Loading } from "solid-js";

import { EmptyState, Text, TextLink } from "@/kit";
import { AutomationsScreen } from "@/modules/automations";
import { AuthProvider, LoginForm, SetupForm } from "@/modules/auth";
import { BoardScreen, ProjectRedirect, TaskPanel } from "@/modules/projects";
import { EnvironmentsScreen } from "@/modules/environments";
import { HomeScreen } from "@/modules/home";
import { ConnectorsScreen } from "@/modules/github";
import { InboxScreen } from "@/modules/inbox";
import {
	AccountScreen,
	AgentsScreen,
	AppearanceScreen,
	DiagnosticsScreen,
	NotificationsScreen,
	SettingsIndexScreen,
	MembersScreen,
	WorktreesScreen,
} from "@/modules/settings";
import { InviteScreen } from "@/modules/workspaces";

import { workspaceHistory } from "./lib/workspace-history";

import { AppShell } from "./routes/app-shell";
import { RequireAuth } from "./routes/require-auth";

// The console has no landing page of its own — that still lives in the marketing site — so "/"
// opens the current project's chats and "/board" its board.
const Router = createRouter({
	// Every signed-in page lives under its workspace (`/acme/board/web`); the routes see `/board/web`.
	history: workspaceHistory(),
	routes: [
		{ path: "/", component: ProjectRoute },
		{ path: "/login", component: LoginRoute },
		{ path: "/setup", component: SetupRoute },
		// An invite link: join its workspace, signed in or with a new account.
		{ path: "/invite/:token", component: InviteRoute },
		// The first screen of the day: what needs you, the work in flight, and what runs next.
		{ path: "/home", component: () => <Authed screen={HomeScreen} /> },
		// What is waiting on the people in this workspace, across every project.
		{ path: "/inbox", component: InboxRoute },
		{ path: "/automations", component: () => <Authed screen={AutomationsScreen} /> },
		{ path: "/board", component: RedirectRoute },
		{ path: "/board/:slug", component: BoardRoute },
		{ path: "/files/:slug", component: FilesRoute },
		{ path: "/notes/:slug", component: NotesRoute },
		// A project's pull requests on GitHub; the open one is `?pr=`.
		{ path: "/pulls/:slug", component: PullsRoute },
		// The same board with one task open in the panel over it.
		{ path: "/board/:slug/tasks/:number", component: BoardRoute },
		// Chats with agents, inside their project; `new` is the new-chat composer, any other id a
		// chat. `/chat` opens the current project.
		{ path: "/chat", component: ChatRoute },
		{ path: "/chat/:project", component: ChatRoute },
		{ path: "/chat/:project/:id", component: ChatRoute },
		// Terminals on this machine; the id keeps a tab linkable and survives a reload.
		{ path: "/terminal", component: TerminalRoute },
		{ path: "/terminal/:id", component: TerminalRoute },
		// Settings is a section of its own, with its own sidebar: a list on phones, then each page.
		{ path: "/settings", component: () => <Authed screen={SettingsIndexScreen} /> },
		{ path: "/settings/appearance", component: () => <Authed screen={AppearanceScreen} /> },
		{ path: "/settings/notifications", component: () => <Authed screen={NotificationsScreen} /> },
		{ path: "/settings/agents", component: () => <Authed screen={AgentsScreen} /> },
		{ path: "/settings/environments", component: () => <Authed screen={EnvironmentsScreen} /> },
		{ path: "/settings/connectors", component: () => <Authed screen={ConnectorsScreen} /> },
		{ path: "/settings/members", component: () => <Authed screen={MembersScreen} /> },
		{ path: "/settings/worktrees", component: () => <Authed screen={WorktreesScreen} /> },
		{ path: "/settings/diagnostics", component: () => <Authed screen={DiagnosticsScreen} /> },
		{ path: "/settings/account", component: () => <Authed screen={AccountScreen} /> },
		// The design system, every piece in every state; loads on its own when opened.
		{ path: "/design", component: DesignRoute },
		{ path: "*", component: NotFoundRoute },
	],
});

export function App(): JSX.Element {
	return (
		<AuthProvider>
			<Router>{(route) => <AppShell>{route.children}</AppShell>}</Router>
		</AuthProvider>
	);
}

function LoginRoute(): JSX.Element {
	return <LoginForm />;
}

function SetupRoute(): JSX.Element {
	return <SetupForm />;
}

const DesignGallery = lazy(() => import("./routes/design-gallery"), { export: "DesignGallery" });

function DesignRoute(): JSX.Element {
	return (
		<Loading fallback={null}>
			<DesignGallery />
		</Loading>
	);
}

function InviteRoute(): JSX.Element {
	return <InviteScreen />;
}

function InboxRoute(): JSX.Element {
	return (
		<RequireAuth>
			<InboxScreen />
		</RequireAuth>
	);
}

function ProjectRoute(): JSX.Element {
	return (
		<RequireAuth>
			<ProjectRedirect to="chat" />
		</RequireAuth>
	);
}

function RedirectRoute(): JSX.Element {
	return (
		<RequireAuth>
			<ProjectRedirect to="board" />
		</RequireAuth>
	);
}

function BoardRoute(): JSX.Element {
	return (
		<RequireAuth>
			<BoardScreen />
			<TaskPanel />
		</RequireAuth>
	);
}

function FilesRoute(): JSX.Element {
	return (
		<RequireAuth>
			<Loading fallback={<Opening>Opening files…</Opening>}>
				<FilesScreen />
			</Loading>
		</RequireAuth>
	);
}

const FilesScreen = lazy(() => import("@/modules/projects/components/files-screen"), {
	export: "FilesScreen",
});

function NotesRoute(): JSX.Element {
	return (
		<RequireAuth>
			<Loading fallback={<Opening>Opening notes…</Opening>}>
				<NotesScreen />
			</Loading>
		</RequireAuth>
	);
}

const NotesScreen = lazy(() => import("@/modules/projects/components/notes-screen"), {
	export: "NotesScreen",
});

function PullsRoute(): JSX.Element {
	return (
		<RequireAuth>
			<Loading fallback={<Opening>Opening pull requests…</Opening>}>
				<PullsScreen />
			</Loading>
		</RequireAuth>
	);
}

// Pull requests bring the Markdown renderer and diff view, so they load when opened.
const PullsScreen = lazy(() => import("@/modules/github/components/pulls-screen"), {
	export: "PullsScreen",
});

// Chat brings a Markdown renderer; like the terminal, it loads when someone opens it.
const ChatScreen = lazy(() => import("@/modules/chat"), { export: "ChatScreen" });

function ChatRoute(): JSX.Element {
	return (
		<RequireAuth>
			<Loading fallback={<Opening>Opening chat…</Opening>}>
				<ChatScreen />
			</Loading>
		</RequireAuth>
	);
}

// The terminal brings xterm.js (a few hundred KB), so it loads only when someone opens it.
const TerminalScreen = lazy(() => import("@/modules/terminal"), { export: "TerminalScreen" });

function TerminalRoute(): JSX.Element {
	return (
		<RequireAuth>
			<Loading fallback={<Opening>Opening the terminal…</Opening>}>
				<TerminalScreen />
			</Loading>
		</RequireAuth>
	);
}

/** A signed-in screen that needs nothing from its route. */
function Authed(props: { screen: () => JSX.Element }): JSX.Element {
	return <RequireAuth>{props.screen()}</RequireAuth>;
}

function NotFoundRoute(): JSX.Element {
	return (
		<EmptyState
			title="That page does not exist"
			action={
				<TextLink tone="accent" href="/">
					Go to your board
				</TextLink>
			}
		/>
	);
}

/** What a screen shows while its code loads: a quiet line, rarely seen for long. */
function Opening(props: { children: JSX.Element }): JSX.Element {
	return (
		<Text tone="faint" class="p-4">
			{props.children}
		</Text>
	);
}
