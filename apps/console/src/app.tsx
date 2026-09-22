import { createRouter, useNavigate } from "@solidjs/router";
import type { JSX } from "@solidjs/web";
import { createEffect } from "solid-js";

import { AuthProvider, LoginForm, useAuth } from "@/modules/auth";
import { BoardScreen, ProjectRedirect } from "@/modules/projects";

import { AppShell } from "./routes/app-shell";
import { RequireAuth } from "./routes/require-auth";

// The console has no landing page of its own — that still lives in the marketing
// site — so the board is the front door: "/" and "/board" open the first project.
const Router = createRouter({
	routes: [
		{ path: "/", component: RedirectRoute },
		{ path: "/login", component: LoginRoute },
		{ path: "/board", component: RedirectRoute },
		{ path: "/board/:slug", component: BoardRoute },
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
	const auth = useAuth();
	const navigate = useNavigate();

	createEffect(
		() => auth.ready() && Boolean(auth.token()),
		(signedIn) => {
			if (signedIn) navigate("/board", { replace: true });
		},
	);

	return (
		<div class="flex justify-center py-12">
			<LoginForm />
		</div>
	);
}

function RedirectRoute(): JSX.Element {
	return (
		<RequireAuth>
			<ProjectRedirect />
		</RequireAuth>
	);
}

function BoardRoute(): JSX.Element {
	return (
		<RequireAuth>
			<BoardScreen />
		</RequireAuth>
	);
}

function NotFoundRoute(): JSX.Element {
	return <p class="text-muted-foreground text-ui-sm">That page does not exist.</p>;
}
