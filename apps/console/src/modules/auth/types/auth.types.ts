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

export interface LoginInput {
	email: string;
	password: string;
}

export function isTwoFactorChallenge(result: LoginResult): result is TwoFactorChallenge {
	return "requiresTwoFactor" in result && result.requiresTwoFactor;
}
