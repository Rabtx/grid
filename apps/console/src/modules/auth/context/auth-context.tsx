import type { JSX } from "@solidjs/web";
import { createContext, createSignal, onSettled, useContext } from "solid-js";

import { ApiError } from "@/lib/api-client";

import { authService } from "../services/auth.service";
import { type AuthUser, isTwoFactorChallenge, type LoginInput } from "../types/auth.types";

type AuthState = {
	token: () => string | null;
	user: () => AuthUser | null;
	/** False only until the first refresh attempt settles, so guards can wait it out. */
	ready: () => boolean;
	/**
	 * Swap the access token for a fresh one using the refresh cookie. Long-lived connections (a
	 * terminal socket) call it when the runner turns their token away. Resolves to the new
	 * token, or null when it could not: signed out if the API refused the session, left as is
	 * if the API was unreachable.
	 */
	renew: () => Promise<string | null>;
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

	// One refresh in flight at a time, however many callers ask.
	let renewing: Promise<string | null> | null = null;

	const state: AuthState = {
		token,
		user,
		ready,
		renew: () => {
			renewing ??= authService
				.refresh()
				.then((session) => {
					setToken(session.accessToken);
					setUser(session.user);
					return session.accessToken;
				})
				.catch((cause: unknown) => {
					// Only a refused refresh ends the session; a dropped connection is retried later.
					if (cause instanceof ApiError && cause.statusCode === 401) {
						setToken(null);
						setUser(null);
					}
					return null;
				})
				.finally(() => {
					renewing = null;
				});
			return renewing;
		},
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
