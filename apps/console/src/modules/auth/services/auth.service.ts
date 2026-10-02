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

export const authService = {
	login: (input: LoginInput) => apiClient.post<LoginResult>("/auth/login", input),
	/** Finishes a sign-in the API held back for a second factor. */
	verifyTwoFactor: (input: TwoFactorInput) =>
		apiClient.post<AuthSession>("/auth/methods/two-factor/verify", input),
	/** Starts a passkey sign-in: the challenge, for the account with that email or any passkey. */
	passkeyOptions: (email?: string) =>
		apiClient.post<{ challengeId: string; options: PasskeyRequestJSON }>(
			"/auth/methods/passkeys/options",
			email ? { email } : {},
		),
	/** Finishes a passkey sign-in with what the device signed. */
	passkeyVerify: (input: { challengeId: string; response: Record<string, unknown> }) =>
		apiClient.post<AuthSession>("/auth/methods/passkeys/verify", input),
	/** Trades the http-only refresh cookie for a fresh access token. */
	refresh: () => apiClient.post<AuthSession>("/auth/refresh"),
	logout: () => apiClient.post<void>("/auth/logout"),
	instance: () => apiClient.get<InstanceStatus>("/instance"),
	register: (input: RegisterInput) => apiClient.post<RegisterResult>("/auth/register", input),
	verifyEmail: (input: { email: string; code: string }) =>
		apiClient.post<AuthUser>("/auth/verify-email", input),
	/** Creates the owner and signs them in. */
	setUp: (input: SetupInput) => apiClient.post<AuthSession>("/instance/setup", input),
};
