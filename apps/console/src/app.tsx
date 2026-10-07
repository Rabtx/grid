import { createRouter, useNavigate } from "@solidjs/router";
import type { JSX } from "@solidjs/web";
import { lazy, Loading, onSettled } from "solid-js";

import { EmptyState, Text, TextLink } from "@/kit";
import { AuthProvider } from "@/modules/auth";

import { workspaceHistory } from "./lib/workspace-history";

import { AppShell } from "./routes/app-shell";
import { RequireAuth } from "./routes/require-auth";

// Every screen loads when it is opened: the first load carries the shell and the screen in front
// of the person, not every page of the console. Each from its own file: a module's index is also
// imported by the shell, and importing that lazily would load all of it up front.
const LoginForm = lazy(() => import("@/modules/auth/components/login-form"), {
	export: "LoginForm",
});
const SetupForm = lazy(() => import("@/modules/auth/components/setup-form"), {
	export: "SetupForm",
});
const InviteScreen = lazy(() => import("@/modules/workspaces/components/invite-screen"), {
	export: "InviteScreen",
});
const HomeScreen = lazy(() => import("@/modules/home/components/home-screen"), {
	export: "HomeScreen",
});
const PulseScreen = lazy(() => import("@/modules/home/components/pulse-screen"), {
	export: "PulseScreen",
});
const InboxScreen = lazy(() => import("@/modules/inbox/components/inbox-screen"), {
	export: "InboxScreen",
});
const AutomationsScreen = lazy(
	() => import("@/modules/automations/components/automations-screen"),
	{
		export: "AutomationsScreen",
	},
);
const BoardScreen = lazy(() => import("@/modules/projects/components/board-screen"), {
	export: "BoardScreen",
});
const TaskPanel = lazy(() => import("@/modules/projects/components/task-panel"), {
	export: "TaskPanel",
});
const ProjectRedirect = lazy(() => import("@/modules/projects/components/project-redirect"), {
	export: "ProjectRedirect",
});
const MachinesScreen = lazy(() => import("@/modules/environments/components/machines-screen"), {
	export: "MachinesScreen",
});
const MachinesOverview = lazy(() => import("@/modules/environments/components/operations-screen"), {
	export: "MachinesOverview",
});
const AgentsOverview = lazy(() => import("@/modules/environments/components/operations-screen"), {
	export: "AgentsOverview",
});
const ConnectorScreen = lazy(() => import("@/modules/connectors/components/connector-screen"), {
	export: "ConnectorScreen",
});
const ConnectorsScreen = lazy(() => import("@/modules/connectors/components/connectors-screen"), {
	export: "ConnectorsScreen",
});
const OAuthCallback = lazy(() => import("@/modules/connectors/components/oauth-callback"), {
	export: "OAuthCallback",
});
const SkillsScreen = lazy(() => import("@/modules/skills/components/skills-screen"), {
	export: "SkillsScreen",
});
const AgentsScreen = lazy(() => import("@/modules/settings/components/agents-screen"), {
	export: "AgentsScreen",
});
const AppearanceScreen = lazy(() => import("@/modules/settings/components/appearance-screen"), {
	export: "AppearanceScreen",
});
const DiagnosticsScreen = lazy(() => import("@/modules/settings/components/diagnostics-screen"), {
	export: "DiagnosticsScreen",
});
const GeneralScreen = lazy(() => import("@/modules/settings/components/general-screen"), {
	export: "GeneralScreen",
});
const MembersScreen = lazy(() => import("@/modules/settings/components/members-screen"), {
	export: "MembersScreen",
});
const NotificationsScreen = lazy(
	() => import("@/modules/settings/components/notifications-screen"),
	{
		export: "NotificationsScreen",
	},
);
const ProfileScreen = lazy(() => import("@/modules/settings/components/profile-screen"), {
	export: "ProfileScreen",
});
const RolesScreen = lazy(() => import("@/modules/settings/components/roles-screen"), {
	export: "RolesScreen",
});
const SettingsRoute = lazy(() => import("@/modules/settings/components/settings-route"), {
	export: "SettingsRoute",
});
const WorktreesScreen = lazy(() => import("@/modules/settings/components/worktrees-screen"), {
	export: "WorktreesScreen",
});

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
		{ path: "/home/pulse", component: () => <Authed screen={PulseScreen} /> },
		// What is waiting on the people in this workspace, across every project.
		{ path: "/inbox", component: InboxRoute },
		// Automations; the open one by its id.
		{ path: "/automations/:id?", component: () => <Authed screen={AutomationsScreen} /> },
		{ path: "/board", component: RedirectRoute },
		{ path: "/board/:slug", component: BoardRoute },
		{ path: "/files/:slug", component: FilesRoute },
		// A project's notes; the open one (or `new`) after it.
		{ path: "/notes/:slug/:note?", component: NotesRoute },
		// A project's pull requests on GitHub; the open one by its number, its review after it.
		{ path: "/pulls/:slug/:number?/:view?", component: PullsRoute },
		// Ship: a project's environments, previews and pipelines; the open one after it.
		{ path: "/ship/:slug/:section?/:name?", component: ShipRoute },
		{ path: "/operate/:slug", component: OperateRoute },
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
		{ path: "/machines/:id?", component: () => <Authed screen={MachinesOverview} /> },
		{ path: "/agents/:provider?", component: () => <Authed screen={AgentsOverview} /> },
		// Settings is a section of its own, with its own sidebar: `/settings` opens it, then a page.
		{ path: "/settings", component: () => <Authed screen={SettingsRoute} /> },
		{ path: "/settings/appearance", component: () => <Authed screen={AppearanceScreen} /> },
		{ path: "/settings/notifications", component: () => <Authed screen={NotificationsScreen} /> },
		{ path: "/settings/agents", component: () => <Authed screen={AgentsScreen} /> },
		{ path: "/settings/skills", component: () => <Authed screen={SkillsScreen} /> },
		{ path: "/settings/roles", component: () => <Authed screen={RolesScreen} /> },
		{ path: "/settings/machines", component: () => <Authed screen={MachinesScreen} /> },
		// Environments became Machines: old links land there.
		{ path: "/settings/environments", component: () => <Moved to="/settings/machines" /> },
		{ path: "/settings/connectors", component: () => <Authed screen={ConnectorsScreen} /> },
		{ path: "/settings/connectors/:id", component: () => <Authed screen={ConnectorScreen} /> },
		{ path: "/oauth/callback", component: OAuthCallbackRoute },
		{ path: "/settings/general", component: () => <Authed screen={GeneralScreen} /> },
		{ path: "/settings/members", component: () => <Authed screen={MembersScreen} /> },
		{ path: "/settings/worktrees", component: () => <Authed screen={WorktreesScreen} /> },
		{ path: "/settings/diagnostics", component: () => <Authed screen={DiagnosticsScreen} /> },
		{ path: "/settings/profile", component: () => <Authed screen={ProfileScreen} /> },
		// Account became Profile: old links land there.
		{ path: "/settings/account", component: () => <Moved to="/settings/profile" /> },
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
	return (
		<Loading fallback={null}>
			<LoginForm />
		</Loading>
	);
}

function SetupRoute(): JSX.Element {
	return (
		<Loading fallback={null}>
			<SetupForm />
		</Loading>
	);
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
	return (
		<Loading fallback={null}>
			<InviteScreen />
		</Loading>
	);
}

function InboxRoute(): JSX.Element {
	return (
		<RequireAuth>
			<Loading fallback={<Opening>Opening…</Opening>}>
				<InboxScreen />
			</Loading>
		</RequireAuth>
	);
}

function ProjectRoute(): JSX.Element {
	return (
		<RequireAuth>
			<Loading fallback={null}>
				<ProjectRedirect to="chat" />
			</Loading>
		</RequireAuth>
	);
}

/** A page that moved: its old address goes to the new one. */
function Moved(props: { to: string }): JSX.Element {
	const navigate = useNavigate();
	onSettled(() => navigate(props.to, { replace: true }));
	return null;
}

function RedirectRoute(): JSX.Element {
	return (
		<RequireAuth>
			<Loading fallback={null}>
				<ProjectRedirect to="board" />
			</Loading>
		</RequireAuth>
	);
}

function BoardRoute(): JSX.Element {
	return (
		<RequireAuth>
			<Loading fallback={<Opening>Opening the board…</Opening>}>
				<BoardScreen />
				<TaskPanel />
			</Loading>
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

function ShipRoute(): JSX.Element {
	return (
		<RequireAuth>
			<Loading fallback={<Opening>Opening Ship…</Opening>}>
				<ShipScreen />
			</Loading>
		</RequireAuth>
	);
}

function OperateRoute(): JSX.Element {
	return (
		<RequireAuth>
			<Loading fallback={<Opening>Opening Operate…</Opening>}>
				<OperateScreen />
			</Loading>
		</RequireAuth>
	);
}
const OperateScreen = lazy(() => import("@/modules/operate/components/operate-screen"), {
	export: "OperateScreen",
});

// Ship brings diffs and logs, so it loads when opened.
const ShipScreen = lazy(() => import("@/modules/ship/components/ship-screen"), {
	export: "ShipScreen",
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
	return (
		<RequireAuth>
			<Loading fallback={<Opening>Opening…</Opening>}>{props.screen()}</Loading>
		</RequireAuth>
	);
}

function OAuthCallbackRoute(): JSX.Element {
	return (
		<Loading fallback={null}>
			<OAuthCallback />
		</Loading>
	);
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
