import * as z from "zod";

const developmentJwtSecret = "development-only-jwt-secret-change-me";
const developmentTokenSecret = "development-only-auth-token-secret-change-me";

const booleanFromString = z
	.enum(["true", "false"])
	.default("false")
	.transform((value) => value === "true");

export const envSchema = z
	.object({
		NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
		PORT: z.coerce.number().int().positive().default(4000),
		API_PREFIX: z.string().min(1).default("api"),
		API_VERSION: z.string().regex(/^\d+$/).default("1"),
		SERVICE_NAME: z.string().min(1).default("grid-api"),
		APP_NAME: z.string().min(1).max(80).default("Grid"),
		/** The console: where emailed links (invites, magic links) and billing send people. */
		CONSOLE_URL: z.url().optional(),
		/** Its name from when the web app was the product; read when CONSOLE_URL is not set. */
		WEB_APP_URL: z.url().optional(),
		DATABASE_URL: z
			.string()
			.url()
			.optional()
			.or(z.literal("").transform(() => undefined)),
		DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(50).default(10),
		DATABASE_SSL: z.enum(["true", "false"]).optional(),
		JWT_SECRET: z.string().min(32).default(developmentJwtSecret),
		JWT_ACCESS_EXPIRES_IN: z
			.string()
			.regex(/^\d+[smhd]$/)
			.default("15m"),
		AUTH_TOKEN_SECRET: z.string().min(32).default(developmentTokenSecret),
		SESSION_TTL_DAYS: z.coerce.number().int().min(1).max(365).default(30),
		OTP_TTL_MINUTES: z.coerce.number().int().min(5).max(60).default(10),
		OTP_MAX_ATTEMPTS: z.coerce.number().int().min(3).max(10).default(5),
		MAGIC_LINK_TTL_MINUTES: z.coerce.number().int().min(5).max(60).default(15),
		MFA_CHALLENGE_TTL_MINUTES: z.coerce.number().int().min(2).max(15).default(5),
		PASSWORD_BCRYPT_ROUNDS: z.coerce.number().int().min(10).max(14).default(12),
		MAX_LOGIN_ATTEMPTS: z.coerce.number().int().min(3).max(20).default(5),
		LOGIN_LOCK_MINUTES: z.coerce.number().int().min(1).max(1440).default(15),
		REFRESH_COOKIE_NAME: z.string().min(1).default("grid_refresh_token"),
		COOKIE_DOMAIN: z.string().min(1).optional(),
		/**
		 * Use `none` when the console and API are on different sites (e.g. a static host and
		 * Render). Requires Secure cookies (production HTTPS).
		 */
		COOKIE_SAME_SITE: z.enum(["lax", "strict", "none"]).default("lax"),
		CORS_ORIGIN: z.string().min(1).default("http://localhost:3001,http://127.0.0.1:3001"),
		TRUST_PROXY: booleanFromString,
		AUTH_DEV_EXPOSE_CODES: z
			.enum(["true", "false"])
			.default("true")
			.transform((value) => value === "true"),
		RESEND_API_KEY: z.string().min(1).optional(),
		AUTH_EMAIL_FROM: z.string().min(3).default("Grid <auth@example.com>"),
		WEBAUTHN_RP_ID: z.string().min(1).default("localhost"),
		/** Comma-separated origins passkeys may be used from: the console's (and native apps'). */
		WEBAUTHN_ORIGIN: z.string().min(1).default("http://localhost:3001"),
		GOOGLE_CLIENT_ID: z.string().min(1).optional(),
		BILLING_DEFAULT_PROVIDER: z.enum(["stripe", "razorpay"]).default("stripe"),
		STRIPE_SECRET_KEY: z.string().min(1).optional(),
		STRIPE_WEBHOOK_SECRET: z.string().min(1).optional(),
		STRIPE_PRICE_TEAM_MONTHLY: z.string().min(1).optional(),
		STRIPE_PRICE_TEAM_YEARLY: z.string().min(1).optional(),
		STRIPE_PRICE_ENTERPRISE_MONTHLY: z.string().min(1).optional(),
		STRIPE_PRICE_ENTERPRISE_YEARLY: z.string().min(1).optional(),
		RAZORPAY_KEY_ID: z.string().min(1).optional(),
		RAZORPAY_KEY_SECRET: z.string().min(1).optional(),
		RAZORPAY_WEBHOOK_SECRET: z.string().min(1).optional(),
		RAZORPAY_PLAN_TEAM_MONTHLY: z.string().min(1).optional(),
		RAZORPAY_PLAN_TEAM_YEARLY: z.string().min(1).optional(),
		RAZORPAY_PLAN_ENTERPRISE_MONTHLY: z.string().min(1).optional(),
		RAZORPAY_PLAN_ENTERPRISE_YEARLY: z.string().min(1).optional(),
		/** Where uploaded files (avatars) live; the launcher puts them in Grid's data folder. */
		GRID_UPLOADS_DIR: z.string().min(1).optional(),
		/** Where database backups go; Grid's data folder by default. */
		GRID_BACKUPS_DIR: z.string().min(1).optional(),
		/**
		 * The key this Grid's runners send their threads with (`Authorization: Runner <key>`).
		 * Unset, the runner routes are off. The launcher makes one per data folder.
		 */
		GRID_RUNNER_KEY: z.string().min(32).optional(),
	})
	.superRefine((env, context) => {
		if (env.NODE_ENV !== "production") {
			return;
		}

		if (!env.DATABASE_URL) {
			context.addIssue({
				code: "custom",
				path: ["DATABASE_URL"],
				message: "DATABASE_URL is required in production",
			});
		}
		if (env.JWT_SECRET === developmentJwtSecret) {
			context.addIssue({
				code: "custom",
				path: ["JWT_SECRET"],
				message: "JWT_SECRET must be changed in production",
			});
		}
		if (env.AUTH_TOKEN_SECRET === developmentTokenSecret) {
			context.addIssue({
				code: "custom",
				path: ["AUTH_TOKEN_SECRET"],
				message: "AUTH_TOKEN_SECRET must be changed in production",
			});
		}
		if (!env.RESEND_API_KEY) {
			context.addIssue({
				code: "custom",
				path: ["RESEND_API_KEY"],
				message: "RESEND_API_KEY is required in production",
			});
		}
	});

export type Env = z.infer<typeof envSchema>;

export function parseEnv(env: Record<string, string | undefined> = process.env): Env {
	const result = envSchema.safeParse(env);
	if (result.success) {
		return result.data;
	}

	const issues = result.error.issues
		.map((issue) => `${issue.path.join(".")}: ${issue.message}`)
		.join("; ");
	throw new Error(`Invalid environment configuration: ${issues}`);
}
