import { homedir } from "node:os";
import { join, resolve } from "node:path";

import { type Env, parseEnv } from "./env";
import { isLocalNetworkVariant } from "./local-network";

export type AppConfig = {
	nodeEnv: Env["NODE_ENV"];
	port: number;
	apiPrefix: string;
	apiVersion: string;
	serviceName: string;
	appName: string;
	webAppUrl: string;
	databaseUrl?: string;
	databasePoolMax: number;
	databaseSsl: boolean;
	jwtSecret: string;
	jwtAccessExpiresIn: string;
	authTokenSecret: string;
	sessionTtlDays: number;
	otpTtlMinutes: number;
	otpMaxAttempts: number;
	magicLinkTtlMinutes: number;
	mfaChallengeTtlMinutes: number;
	passwordBcryptRounds: number;
	maxLoginAttempts: number;
	loginLockMinutes: number;
	refreshCookieName: string;
	cookieDomain?: string;
	cookieSameSite: "lax" | "strict" | "none";
	uploadsDir: string;
	/** Where nightly and on-demand database backups are written. */
	backupsDir: string;
	corsOrigin: string;
	trustProxy: boolean;
	authDevExposeCodes: boolean;
	resendApiKey?: string;
	authEmailFrom: string;
	webAuthnRpId: string;
	webAuthnOrigins: string[];
	googleClientId?: string;
	billingDefaultProvider: "stripe" | "razorpay";
	stripeSecretKey?: string;
	stripeWebhookSecret?: string;
	razorpayKeyId?: string;
	razorpayKeySecret?: string;
	razorpayWebhookSecret?: string;
	billingPrices: {
		stripe: {
			team: { monthly?: string; yearly?: string };
			enterprise: { monthly?: string; yearly?: string };
		};
		razorpay: {
			team: { monthly?: string; yearly?: string };
			enterprise: { monthly?: string; yearly?: string };
		};
	};
};

export function createConfig(env: Env = parseEnv()): AppConfig {
	return {
		nodeEnv: env.NODE_ENV,
		port: env.PORT,
		apiPrefix: env.API_PREFIX,
		apiVersion: env.API_VERSION,
		serviceName: env.SERVICE_NAME,
		appName: env.APP_NAME,
		webAppUrl: env.WEB_APP_URL.replace(/\/$/, ""),
		databaseUrl: env.DATABASE_URL,
		databasePoolMax: env.DATABASE_POOL_MAX,
		databaseSsl:
			env.DATABASE_SSL !== undefined
				? env.DATABASE_SSL === "true"
				: Boolean(env.DATABASE_URL && /(?:neon\.tech|sslmode=require)/i.test(env.DATABASE_URL)),
		jwtSecret: env.JWT_SECRET,
		jwtAccessExpiresIn: env.JWT_ACCESS_EXPIRES_IN,
		authTokenSecret: env.AUTH_TOKEN_SECRET,
		sessionTtlDays: env.SESSION_TTL_DAYS,
		otpTtlMinutes: env.OTP_TTL_MINUTES,
		otpMaxAttempts: env.OTP_MAX_ATTEMPTS,
		magicLinkTtlMinutes: env.MAGIC_LINK_TTL_MINUTES,
		mfaChallengeTtlMinutes: env.MFA_CHALLENGE_TTL_MINUTES,
		passwordBcryptRounds: env.PASSWORD_BCRYPT_ROUNDS,
		maxLoginAttempts: env.MAX_LOGIN_ATTEMPTS,
		loginLockMinutes: env.LOGIN_LOCK_MINUTES,
		refreshCookieName: env.REFRESH_COOKIE_NAME,
		...(env.COOKIE_DOMAIN ? { cookieDomain: env.COOKIE_DOMAIN } : {}),
		cookieSameSite: env.COOKIE_SAME_SITE,
		uploadsDir: env.GRID_UPLOADS_DIR ?? resolve(import.meta.dir, "../../uploads"),
		backupsDir: env.GRID_BACKUPS_DIR ?? join(homedir(), ".local", "share", "grid", "backups"),
		corsOrigin: env.CORS_ORIGIN,
		trustProxy: env.TRUST_PROXY,
		authDevExposeCodes: env.AUTH_DEV_EXPOSE_CODES,
		...(env.RESEND_API_KEY ? { resendApiKey: env.RESEND_API_KEY } : {}),
		authEmailFrom: env.AUTH_EMAIL_FROM,
		webAuthnRpId: env.WEBAUTHN_RP_ID,
		webAuthnOrigins: env.WEBAUTHN_ORIGIN.split(",")
			.map((origin) => origin.trim().replace(/\/$/, ""))
			.filter(Boolean),
		...(env.GOOGLE_CLIENT_ID ? { googleClientId: env.GOOGLE_CLIENT_ID } : {}),
		billingDefaultProvider: env.BILLING_DEFAULT_PROVIDER,
		...(env.STRIPE_SECRET_KEY ? { stripeSecretKey: env.STRIPE_SECRET_KEY } : {}),
		...(env.STRIPE_WEBHOOK_SECRET ? { stripeWebhookSecret: env.STRIPE_WEBHOOK_SECRET } : {}),
		...(env.RAZORPAY_KEY_ID ? { razorpayKeyId: env.RAZORPAY_KEY_ID } : {}),
		...(env.RAZORPAY_KEY_SECRET ? { razorpayKeySecret: env.RAZORPAY_KEY_SECRET } : {}),
		...(env.RAZORPAY_WEBHOOK_SECRET ? { razorpayWebhookSecret: env.RAZORPAY_WEBHOOK_SECRET } : {}),
		billingPrices: {
			stripe: {
				team: {
					...(env.STRIPE_PRICE_TEAM_MONTHLY ? { monthly: env.STRIPE_PRICE_TEAM_MONTHLY } : {}),
					...(env.STRIPE_PRICE_TEAM_YEARLY ? { yearly: env.STRIPE_PRICE_TEAM_YEARLY } : {}),
				},
				enterprise: {
					...(env.STRIPE_PRICE_ENTERPRISE_MONTHLY
						? { monthly: env.STRIPE_PRICE_ENTERPRISE_MONTHLY }
						: {}),
					...(env.STRIPE_PRICE_ENTERPRISE_YEARLY
						? { yearly: env.STRIPE_PRICE_ENTERPRISE_YEARLY }
						: {}),
				},
			},
			razorpay: {
				team: {
					...(env.RAZORPAY_PLAN_TEAM_MONTHLY ? { monthly: env.RAZORPAY_PLAN_TEAM_MONTHLY } : {}),
					...(env.RAZORPAY_PLAN_TEAM_YEARLY ? { yearly: env.RAZORPAY_PLAN_TEAM_YEARLY } : {}),
				},
				enterprise: {
					...(env.RAZORPAY_PLAN_ENTERPRISE_MONTHLY
						? { monthly: env.RAZORPAY_PLAN_ENTERPRISE_MONTHLY }
						: {}),
					...(env.RAZORPAY_PLAN_ENTERPRISE_YEARLY
						? { yearly: env.RAZORPAY_PLAN_ENTERPRISE_YEARLY }
						: {}),
				},
			},
		},
	};
}

/** The API's base path, `/api/v1`. */
export function basePath(config: AppConfig): string {
	return `/${config.apiPrefix}/v${config.apiVersion}`;
}

export function isProduction(config: AppConfig): boolean {
	return config.nodeEnv === "production";
}

/** The configured console origins, plus (outside production) the same served from this machine's LAN IPs. */
export function isAllowedOrigin(config: AppConfig, origin: string): boolean {
	const allowed = config.corsOrigin.split(",").map((item) => item.trim());
	if (allowed.includes(origin)) return true;
	return !isProduction(config) && isLocalNetworkVariant(origin, allowed);
}
