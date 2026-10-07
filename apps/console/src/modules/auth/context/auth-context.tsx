import type { JSX } from "@solidjs/web";
import { createContext, createSignal, onSettled, useContext } from "solid-js";

import { ApiError, registerTokenRenewal } from "@/lib/api-client";
import { localStore } from "@/lib/local-store";
import { getPasskeyAssertion } from "@/lib/webauthn";

import { authService } from "../services/auth.service";
import {
	type AuthSession,
	type AuthUser,
	isTwoFactorChallenge,
	type LoginInput,
	type SetupInput,
	type TwoFactorChallenge,
	type TwoFactorInput,
} from "../types/auth.types";

type AuthState = {
	token: () => string | null;
	user: () => AuthUser | null;
	/** False only until the first refresh attempt settles, so guards can wait it out. */
	ready: () => boolean;
	/**
	 * True while the app opens for someone who was signed in on this device last time: it shows
	 * their Grid from what the device kept straight away, while the session is confirmed. Ends
	 * (false) once confirmed, or when it turns out to be over (then it is the login page).
	 */
	restoring: () => boolean;
	/** The access token once the session is confirmed; null when there is none. */
	waitForToken: () => Promise<string | null>;
	/**
	 * Swap the access token for a fresh one using the refresh cookie. Long-lived connections (a
	 * terminal socket) call it when the runner turns their token away. Resolves to the new
	 * token, or null when it could not: signed out if the API refused the session, left as is
	 * if the API was unreachable.
	 */
	renew: () => Promise<string | null>;
	login: (input: LoginInput) => Promise<TwoFactorChallenge | null>;
	/**
	 * Finishes a sign-in the API held for a second factor. The challenge from `login` is only good
	 * for a few minutes, so a refused code leaves the caller to ask for another.
	 */
	verifyTwoFactor: (input: TwoFactorInput) => Promise<void>;
	/** Signs in with an emailed link; like `login`, a challenge back means the code is still owed. */
	signInWithMagicLink: (token: string) => Promise<TwoFactorChallenge | null>;
	/** Signs in with a passkey on this device; with an email, only that account's passkeys. */
	signInWithPasskey: (email?: string) => Promise<void>;
	/** First run: create the owner and sign in as them. */
	setUp: (input: SetupInput) => Promise<void>;
	logout: () => Promise<void>;
};

const AuthContext = createContext<AuthState>();

// Who was signed in on this device last time: only who they are (never a token), so the app can
// open straight into their Grid while it confirms the session.
const LAST_USER_KEY = "grid.session.user";

function lastUser(): AuthUser | null {
	try {
		const kept = JSON.parse(localStorage.getItem(LAST_USER_KEY) ?? "null") as AuthUser | null;
		return kept && typeof kept.id === "string" ? kept : null;
	} catch {
		return null;
	}
}

function rememberUser(user: AuthUser | null): void {
	try {
		if (user) localStorage.setItem(LAST_USER_KEY, JSON.stringify(user));
		else localStorage.removeItem(LAST_USER_KEY);
	} catch {
		// Not remembered: the next open waits for the session, as before.
	}
}

/**
 * Holds the access token in memory only.
 *
 * Persisting it to localStorage would survive a reload but hands any script on the
 * page a bearer token. The refresh token already lives in an http-only cookie, so a
 * reload can recover a session by calling `/auth/refresh` instead — same continuity,
 * nothing readable left lying around.
 */
export function AuthProvider(props: { children: JSX.Element }): JSX.Element {
	const known = lastUser();
	// Read what this device kept for them from the first render.
	if (known) localStore.restoreUser(known.id);
	const [token, setToken] = createSignal<string | null>(null);
	const [user, setUser] = createSignal<AuthUser | null>(known);
	const [ready, setReady] = createSignal(false);
	const [restoring, setRestoring] = createSignal(known !== null);
	// Callers of `waitForToken` waiting for the session to be confirmed, or found to be over.
	let waiters: (() => void)[] = [];
	const settle = () => {
		const waiting = waiters;
		waiters = [];
		for (const resolve of waiting) resolve();
	};

	let timer: ReturnType<typeof setTimeout> | undefined;
	let expiresAt = 0;
	let generation = 0;
	let disposed = false;
	let renewing: Promise<string | null> | null = null;
	const sessionTokens = new Set<string>();

	function startSignIn(): number {
		renewing = null;
		return ++generation;
	}
	function checkSignIn(started: number): void {
		if (disposed || started !== generation) throw new Error("Sign-in was cancelled");
	}
	function acceptSignIn(started: number, session: AuthSession): void {
		checkSignIn(started);
		generation++;
		renewing = null;
		// Tokens from the previous sign-in must never authorize a replay for the new account.
		sessionTokens.clear();
		acceptSession(session);
	}

	function clearSession(): void {
		sessionTokens.clear();
		clearTimeout(timer);
		expiresAt = 0;
		setToken(null);
		setUser(null);
		setRestoring(false);
		localStore.setUser(null);
		rememberUser(null);
		settle();
	}

	function acceptSession(session: AuthSession): void {
		if (user()?.id !== session.user.id) sessionTokens.clear();
		sessionTokens.add(session.accessToken);
		// What this device keeps is per account: set whose it is before anything reads it.
		localStore.setUser(session.user.id);
		rememberUser(session.user);
		setToken(session.accessToken);
		setUser(session.user);
		setRestoring(false);
		settle();
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
		restoring,
		waitForToken: async () => {
			if (disposed) return null;
			if (token() || (ready() && !restoring())) return token();
			await new Promise<void>((resolve) => waiters.push(resolve));
			return disposed ? null : token();
		},
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
					} else if (token() || restoring()) {
						// Unreachable (offline, say): keep the session, or the Grid shown from what this
						// device kept, and try again soon.
						clearTimeout(timer);
						timer = setTimeout(() => void state.renew(), token() ? 30_000 : 10_000);
					}
					return null;
				})
				.finally(() => {
					if (started === generation) renewing = null;
				});
			return renewing;
		},
		login: async (input) => {
			const started = startSignIn();
			const result = await authService.login(input);
			checkSignIn(started);
			// The account has a second factor: no session yet, the form asks for the code.
			if (isTwoFactorChallenge(result)) return result;
			acceptSignIn(started, result);
			return null;
		},
		verifyTwoFactor: async (input) => {
			const started = startSignIn();
			const session = await authService.verifyTwoFactor(input);
			acceptSignIn(started, session);
		},
		signInWithMagicLink: async (token) => {
			const started = startSignIn();
			const result = await authService.consumeMagicLink(token);
			checkSignIn(started);
			if (isTwoFactorChallenge(result)) return result;
			acceptSignIn(started, result);
			return null;
		},
		signInWithPasskey: async (email) => {
			const started = startSignIn();
			const { challengeId, options } = await authService.passkeyOptions(email);
			checkSignIn(started);
			const response = await getPasskeyAssertion(options);
			checkSignIn(started);
			const session = await authService.passkeyVerify({ challengeId, response });
			acceptSignIn(started, session);
		},
		setUp: async (input) => {
			const started = startSignIn();
			const session = await authService.setUp(input);
			acceptSignIn(started, session);
		},
		logout: async () => {
			const endingToken = token();
			generation++;
			renewing = null;
			clearSession();
			// Queue the cookie deletion now, before any later sign-in and before waiting for IDB.
			const ending = authService.logout(endingToken ?? undefined).catch(() => {
				// Clearing the client is worth doing even if the server call fails.
			});
			// Clear the account's IndexedDB data; private route memories remain account-scoped.
			await localStore.clear();
			await ending;
		},
	};

	onSettled(() => {
		const unregister = registerTokenRenewal((failedToken) => {
			const current = token();
			if (!current || !sessionTokens.has(failedToken)) return Promise.resolve(null);
			if (current !== failedToken) return Promise.resolve(current);
			return state.renew();
		});
		const onVisible = (): void => {
			if (document.visibilityState === "visible" && token() && expiresAt - Date.now() <= 60_000) {
				void state.renew();
			}
		};
		document.addEventListener("visibilitychange", onVisible);
		void state.renew().finally(() => {
			if (disposed) return;
			setReady(true);
			// Still restoring means the API was unreachable: the kept Grid stays up while it retries.
			if (!restoring()) settle();
		});
		return () => {
			disposed = true;
			settle();
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
