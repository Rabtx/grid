import { createRouter, useNavigate } from "@solidjs/router";
import type { JSX } from "@solidjs/web";
import { createEffect } from "solid-js";

import { AuthProvider, LoginForm, useAuth } from "@/modules/auth";
import { BoardScreen, ProjectRedirect } from "@/modules/projects";
import { EmptyState } from "@/ui";

import { AppShell } from "./routes/app-shell";
import { DevUiRoute } from "./routes/dev-ui";
import { RequireAuth } from "./routes/require-auth";

// The console has no landing page of its own — that still lives in the marketing
// site — so the board is the front door: "/" and "/board" open the first project.
const Router = createRouter({
	routes: [
		{ path: "/", component: RedirectRoute },
		{ path: "/login", component: LoginRoute },
		{ path: "/board", component: RedirectRoute },
		{ path: "/board/:slug", component: BoardRoute },
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
	const auth = useAuth();
	const navigate = useNavigate();

	createEffect(
		() => auth.ready() && Boolean(auth.token()),
		(signedIn) => {
			if (signedIn) navigate("/board", { replace: true });
		},
	);

	return (
		<div class="flex justify-center pt-[12vh] pb-12">
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
