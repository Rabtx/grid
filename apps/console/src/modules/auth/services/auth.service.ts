import { apiClient } from "@/lib/api-client";
import type { PasskeyRequestJSON } from "@/lib/webauthn";

import type {
	AuthSession,
	AuthUser,
	InstanceStatus,
	LoginInput,
	LoginResult,
	RegisterInput,
	RegisterResult,
	SetupInput,
	TwoFactorInput,
} from "../types/auth.types";

// The browser applies Set-Cookie even when a component drops an obsolete result. Issuers and
// In this page, logout must finish in invocation order so a late refresh cannot restore a signed-out cookie.
let cookieMutations = Promise.resolve();
function changeCookie<T>(request: (signal: AbortSignal) => Promise<T>): Promise<T> {
	const work = cookieMutations.then(async () => {
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), 30_000);
		try {
			return await request(controller.signal);
		} finally {
			clearTimeout(timer);
		}
	});
	cookieMutations = work.then(
		() => {},
		() => {},
	);
	return work;
}

export const authService = {
	login: (input: LoginInput) =>
		changeCookie((signal) => apiClient.post<LoginResult>("/auth/login", input, { signal })),
	/** Finishes a sign-in the API held back for a second factor. */
	verifyTwoFactor: (input: TwoFactorInput) =>
		changeCookie((signal) =>
			apiClient.post<AuthSession>("/auth/methods/two-factor/verify", input, { signal }),
		),
	/**
	 * Emails a one-time sign-in link to the account, if there is one (the answer is the same either
	 * way). Outside production the API also returns the link's token, for a Grid that sends no email.
	 */
	requestMagicLink: (email: string) =>
		apiClient.post<{ accepted: true; message: string; developmentToken?: string }>(
			"/auth/methods/magic-link/request",
			{ email },
		),
	/** Signs in with an emailed link's token; an account with 2FA still owes its code. */
	consumeMagicLink: (token: string) =>
		changeCookie((signal) =>
			apiClient.post<LoginResult>("/auth/methods/magic-link/consume", { token }, { signal }),
		),
	/** Starts a passkey sign-in: the challenge, for the account with that email or any passkey. */
	passkeyOptions: (email?: string) =>
		apiClient.post<{ challengeId: string; options: PasskeyRequestJSON }>(
			"/auth/methods/passkeys/options",
			email ? { email } : {},
		),
	/** Finishes a passkey sign-in with what the device signed. */
	passkeyVerify: (input: { challengeId: string; response: Record<string, unknown> }) =>
		changeCookie((signal) =>
			apiClient.post<AuthSession>("/auth/methods/passkeys/verify", input, { signal }),
		),
	/** Trades the http-only refresh cookie for a fresh access token. */
	refresh: () =>
		changeCookie((signal) => apiClient.post<AuthSession>("/auth/refresh", undefined, { signal })),
	logout: (accessToken?: string) =>
		changeCookie((signal) =>
			apiClient.post<void>("/auth/logout", undefined, { signal, accessToken }),
		),
	instance: () => apiClient.get<InstanceStatus>("/instance"),
	register: (input: RegisterInput) => apiClient.post<RegisterResult>("/auth/register", input),
	verifyEmail: (input: { email: string; code: string }) =>
		apiClient.post<AuthUser>("/auth/verify-email", input),
	/** Creates the owner and signs them in. */
	setUp: (input: SetupInput) =>
		changeCookie((signal) => apiClient.post<AuthSession>("/instance/setup", input, { signal })),
};
