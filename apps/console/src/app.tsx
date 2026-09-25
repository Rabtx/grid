import { createRouter, useNavigate } from "@solidjs/router";
import type { JSX } from "@solidjs/web";
import { createEffect, lazy, Loading } from "solid-js";

import { AuthProvider, LoginForm } from "@/modules/auth";
import { BoardScreen, ProjectRedirect, TaskPanel } from "@/modules/projects";
import { AgentsScreen, AppearanceScreen } from "@/modules/settings";
import { EmptyState } from "@/ui";

import { AppShell } from "./routes/app-shell";
import { DevUiRoute } from "./routes/dev-ui";
import { RequireAuth } from "./routes/require-auth";

// The console has no landing page of its own — that still lives in the marketing site — so "/"
// opens the current project's chats and "/board" its board.
const Router = createRouter({
	routes: [
		{ path: "/", component: ProjectRoute },
		{ path: "/login", component: LoginRoute },
		{ path: "/board", component: RedirectRoute },
		{ path: "/board/:slug", component: BoardRoute },
		{ path: "/files/:slug", component: FilesRoute },
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
		// Settings is a section of its own: appearance, and the coding agents.
		{ path: "/settings", component: SettingsRedirectRoute },
		{ path: "/settings/appearance", component: SettingsRoute },
		{ path: "/settings/agents", component: AgentsRoute },
		// Development-only primitives gallery; tree-shaken out of production builds.
		...(import.meta.env.DEV ? [{ path: "/dev/ui", component: DevUiRoute }] : []),
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
		<div class="flex justify-center pt-[12vh] pb-12">
			<LoginForm />
		</div>
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
			<Loading fallback={<p class="p-4 text-ink/45 text-ui-sm">Opening files…</p>}>
				<FilesScreen />
			</Loading>
		</RequireAuth>
	);
}

const FilesScreen = lazy(() => import("@/modules/projects/components/files-screen"), {
	export: "FilesScreen",
});

// Chat brings a Markdown renderer; like the terminal, it loads when someone opens it.
const ChatScreen = lazy(() => import("@/modules/chat"), { export: "ChatScreen" });

function ChatRoute(): JSX.Element {
	return (
		<RequireAuth>
			<Loading fallback={<p class="p-4 text-ink/45 text-ui-sm">Opening chat…</p>}>
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
			<Loading fallback={<p class="p-4 text-ink/45 text-ui-sm">Opening the terminal…</p>}>
				<TerminalScreen />
			</Loading>
		</RequireAuth>
	);
}

function SettingsRoute(): JSX.Element {
	return (
		<RequireAuth>
			<AppearanceScreen />
		</RequireAuth>
	);
}

function AgentsRoute(): JSX.Element {
	return (
		<RequireAuth>
			<AgentsScreen />
		</RequireAuth>
	);
}

function SettingsRedirectRoute(): JSX.Element {
	const navigate = useNavigate();

	createEffect(
		() => true,
		() => navigate("/settings/appearance", { replace: true }),
	);

	return <></>;
}

function NotFoundRoute(): JSX.Element {
	return (
		<EmptyState
			title="That page does not exist"
			action={
				<a
					href="/"
					class="focus-ring rounded-sm text-link text-ui-sm underline-offset-2 hover:underline"
				>
					Go to your board
				</a>
			}
		/>
	);
}
