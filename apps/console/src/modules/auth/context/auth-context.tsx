import type { JSX } from "@solidjs/web";
import { createContext, createSignal, onSettled, useContext } from "solid-js";

import { authService } from "../services/auth.service";
import { type AuthUser, isTwoFactorChallenge, type LoginInput } from "../types/auth.types";

type AuthState = {
	token: () => string | null;
	user: () => AuthUser | null;
	/** False only until the first refresh attempt settles, so guards can wait it out. */
	ready: () => boolean;
	login: (input: LoginInput) => Promise<void>;
	logout: () => Promise<void>;
};

const AuthContext = createContext<AuthState>();

/**
 * Holds the access token in memory only.
 *
 * Persisting it to localStorage would survive a reload but hands any script on the
 * page a bearer token. The refresh token already lives in an http-only cookie, so a
 * reload can recover a session by calling `/auth/refresh` instead — same continuity,
 * nothing readable left lying around.
 */
export function AuthProvider(props: { children: JSX.Element }): JSX.Element {
	const [token, setToken] = createSignal<string | null>(null);
	const [user, setUser] = createSignal<AuthUser | null>(null);
	const [ready, setReady] = createSignal(false);

	onSettled(() => {
		void authService
			.refresh()
			.then((session) => {
				setToken(session.accessToken);
				setUser(session.user);
			})
			.catch(() => {
				// No usable refresh cookie: this is a signed-out visitor, not an error.
			})
			.finally(() => setReady(true));
	});

	const state: AuthState = {
		token,
		user,
		ready,
		login: async (input) => {
			const result = await authService.login(input);
			if (isTwoFactorChallenge(result)) {
				throw new Error("This account needs a second factor, which the console cannot do yet.");
			}
			setToken(result.accessToken);
			setUser(result.user);
		},
		logout: async () => {
			await authService.logout().catch(() => {
				// Clearing the client is worth doing even if the server call fails.
			});
			setToken(null);
			setUser(null);
		},
	};

	return <AuthContext value={state}>{props.children}</AuthContext>;
}

/** Throws `ContextNotFoundError` outside an `AuthProvider`: the context has no default. */
export function useAuth(): AuthState {
	return useContext(AuthContext);
}
