export interface AuthUser {
	id: string;
	email: string;
	username: string;
}

export interface AuthSession {
	accessToken: string;
	accessTokenExpiresAt: string;
	user: AuthUser;
}

export interface TwoFactorChallenge {
	requiresTwoFactor: true;
	challengeToken: string;
	expiresAt: string;
	methods: Array<"totp" | "recovery_code">;
}

export type LoginResult = AuthSession | TwoFactorChallenge;

/** The second step for an account with 2FA: the login's challenge plus a code or recovery code. */
export interface TwoFactorInput {
	challengeToken: string;
	code: string;
}

/** First run: the owner account and the first workspace, with the code from the setup link. */
export interface SetupInput {
	code: string;
	email: string;
	username: string;
	password: string;
	displayName?: string;
	workspace: { name: string; slug: string };
}

/** Whether this Grid still needs its first-run setup, and whether anyone may sign up. */
export interface InstanceStatus {
	setupNeeded: boolean;
	signupOpen: boolean;
}

/** A new account; with an invite it joins that workspace straight away. */
export interface RegisterInput {
	email: string;
	username: string;
	password: string;
	inviteToken?: string;
}

/** A new account, and whether its email still needs the code sent to it. */
export interface RegisterResult {
	message: string;
	/** Only when the API runs in development, instead of sending mail. */
	developmentCode?: string;
	user: AuthUser & { emailVerified: boolean };
}

export interface LoginInput {
	email: string;
	password: string;
}

export function isTwoFactorChallenge(result: LoginResult): result is TwoFactorChallenge {
	return "requiresTwoFactor" in result && result.requiresTwoFactor;
}
