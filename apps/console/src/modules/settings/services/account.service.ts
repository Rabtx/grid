import { apiClient } from "@/lib/api-client";
import { runnerCall } from "@/lib/runner-client";

/** The signed-in person as Settings → Profile shows them. */
export type Me = {
	id: string;
	email: string;
	username: string;
	emailVerified: boolean;
	hasPassword: boolean;
	passwordChangedAt: string | null;
	createdAt: string;
	profile: {
		displayName: string | null;
		avatarUrl: string | null;
		bio: string | null;
		timezone: string | null;
		locale: string | null;
	};
};

export type ProfilePatch = {
	username?: string;
	displayName?: string | null;
	timezone?: string | null;
};

/** A signed-in device: what it was, where from, and whether it is this one. */
export type SignInSession = {
	id: string;
	userAgent: string | null;
	ipAddress: string | null;
	createdAt: string;
	lastUsedAt: string;
	isCurrent: boolean;
};

export type Passkey = {
	id: string;
	name: string;
	deviceType: string;
	backedUp: boolean;
	lastUsedAt: string | null;
	createdAt: string;
};

export type Security = {
	mfa: { totpEnabled: boolean; recoveryCodesRemaining: number };
	passkeys: Passkey[];
};

export type TotpSetup = { secret: string; uri: string; qrCodeDataUrl: string };

/** The options a new passkey is made with, as the API sends them. */
export type PasskeyCreation = {
	challengeId: string;
	options: Record<string, unknown>;
};

/** Where each kind of update reaches someone. */
export type NotifyKind = "approvals" | "questions" | "runs" | "reviews" | "following";
export type Channels = { desktop: boolean; phone: boolean; email: boolean };

/** What a person sets for themselves on the runner (git identity, notifications). */
export type PersonPrefs = {
	git: { name: string | null; email: string | null; creditAgent: boolean; signCommits: boolean };
	notify: {
		channels: Record<NotifyKind, Channels>;
		quiet: {
			on: boolean;
			from: string;
			to: string;
			timezone: string;
			approvalsThrough: boolean;
			weekends: boolean;
		};
		lockScreen: boolean;
		digest: boolean;
	};
};

export type PrefsPatch = {
	git?: Partial<PersonPrefs["git"]>;
	notify?: {
		channels?: Partial<Record<NotifyKind, Partial<Channels>>>;
		quiet?: Partial<PersonPrefs["notify"]["quiet"]>;
		lockScreen?: boolean;
		digest?: boolean;
	};
};

export type PrefsAnswer = {
	prefs: PersonPrefs;
	signingKey: { path: string; type: string; addedAt: string } | null;
};

/** A device that gets notifications. */
export type PushDevice = {
	id: string;
	label: string;
	kind: "desktop" | "phone";
	createdAt: string;
};

export const accountService = {
	me: (accessToken: string) => apiClient.get<Me>("/users/me", { accessToken }),
	updateProfile: (accessToken: string, patch: ProfilePatch) =>
		apiClient.patch<Me>("/users/me/profile", patch, { accessToken }),
	uploadAvatar: (accessToken: string, file: File) => {
		const form = new FormData();
		form.append("file", file);
		return apiClient.upload<Me>("/users/me/avatar", form, { accessToken });
	},
	changePassword: (accessToken: string, currentPassword: string, newPassword: string) =>
		apiClient.post<unknown>(
			"/auth/change-password",
			{ currentPassword, newPassword },
			{ accessToken },
		),
	sessions: (accessToken: string) =>
		apiClient.get<SignInSession[]>("/auth/sessions", { accessToken }),
	revokeSession: (accessToken: string, id: string) =>
		apiClient.delete<unknown>(`/auth/sessions/${id}`, { accessToken }),
	security: (accessToken: string) => apiClient.get<Security>("/auth/security", { accessToken }),
	beginTotp: (accessToken: string) =>
		apiClient.post<TotpSetup>("/auth/security/totp/setup", undefined, { accessToken }),
	confirmTotp: (accessToken: string, code: string) =>
		apiClient.post<{ recoveryCodes: string[] }>(
			"/auth/security/totp/confirm",
			{ code },
			{ accessToken },
		),
	disableTotp: (accessToken: string, code: string) =>
		apiClient.post<unknown>("/auth/security/totp/disable", { code }, { accessToken }),
	beginPasskey: (accessToken: string) =>
		apiClient.post<PasskeyCreation>("/auth/security/passkeys/options", undefined, {
			accessToken,
		}),
	finishPasskey: (
		accessToken: string,
		input: { challengeId: string; name: string; response: Record<string, unknown> },
	) => apiClient.post<Passkey>("/auth/security/passkeys", input, { accessToken }),
	removePasskey: (accessToken: string, id: string) =>
		apiClient.delete<unknown>(`/auth/security/passkeys/${id}`, { accessToken }),
	prefs: (token: string) => runnerCall<PrefsAnswer>("/prefs", token),
	updatePrefs: (token: string, patch: PrefsPatch) =>
		runnerCall<PrefsAnswer>("/prefs", token, { method: "PATCH", body: JSON.stringify(patch) }),
	devices: (token: string) => runnerCall<PushDevice[]>("/push/devices", token),
	testDevice: (token: string, device: string) =>
		runnerCall<void>("/push/test", token, { method: "POST", body: JSON.stringify({ device }) }),
};
