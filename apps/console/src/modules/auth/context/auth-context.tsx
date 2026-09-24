import type { JSX } from "@solidjs/web";
import { createContext, createSignal, onSettled, useContext } from "solid-js";

import { ApiError, registerTokenRenewal } from "@/lib/api-client";

import { authService } from "../services/auth.service";
import {
	type AuthSession,
	type AuthUser,
	isTwoFactorChallenge,
	type LoginInput,
} from "../types/auth.types";

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

	let timer: ReturnType<typeof setTimeout> | undefined;
	let expiresAt = 0;
	let generation = 0;
	let disposed = false;
	let renewing: Promise<string | null> | null = null;

	function clearSession(): void {
		clearTimeout(timer);
		expiresAt = 0;
		setToken(null);
		setUser(null);
	}

	function acceptSession(session: AuthSession): void {
		setToken(session.accessToken);
		setUser(session.user);
		expiresAt = Date.parse(session.accessTokenExpiresAt);
		clearTimeout(timer);
		if (Number.isFinite(expiresAt)) {
			timer = setTimeout(() => void state.renew(), Math.max(0, expiresAt - Date.now() - 60_000));
		}
	}

	const state: AuthState = {
		token,
		user,
		ready,
		renew: () => {
			if (disposed) return Promise.resolve(null);
			const started = generation;
			renewing ??= authService
				.refresh()
				.then((session) => {
					if (disposed || started !== generation) return null;
					acceptSession(session);
					return session.accessToken;
				})
				.catch((cause: unknown) => {
					if (disposed || started !== generation) return null;
					// Only a refused refresh ends the session; retry transient failures later.
					if (cause instanceof ApiError && cause.statusCode === 401) {
						clearSession();
					} else if (token()) {
						clearTimeout(timer);
						timer = setTimeout(() => void state.renew(), 30_000);
					}
					return null;
				})
				.finally(() => {
					if (started === generation) renewing = null;
				});
			return renewing;
		},
		login: async (input) => {
			const result = await authService.login(input);
			if (isTwoFactorChallenge(result)) {
				throw new Error("This account needs a second factor, which the console cannot do yet.");
			}
			generation++;
			renewing = null;
			acceptSession(result);
		},
		logout: async () => {
			generation++;
			renewing = null;
			clearSession();
			await authService.logout().catch(() => {
				// Clearing the client is worth doing even if the server call fails.
			});
		},
	};

	onSettled(() => {
		const unregister = registerTokenRenewal((failedToken) => {
			const current = token();
			if (!current || current !== failedToken) return Promise.resolve(current);
			return state.renew();
		});
		const onVisible = (): void => {
			if (document.visibilityState === "visible" && token() && expiresAt - Date.now() <= 60_000) {
				void state.renew();
			}
		};
		document.addEventListener("visibilitychange", onVisible);
		void state.renew().finally(() => {
			if (!disposed) setReady(true);
		});
		return () => {
			disposed = true;
			clearTimeout(timer);
			unregister();
			document.removeEventListener("visibilitychange", onVisible);
		};
	});

	return <AuthContext value={state}>{props.children}</AuthContext>;
}

/** Throws `ContextNotFoundError` outside an `AuthProvider`: the context has no default. */
export function useAuth(): AuthState {
	return useContext(AuthContext);
}
