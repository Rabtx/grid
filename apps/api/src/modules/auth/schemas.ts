import * as z from "zod";

export const emailSchema = z.email().trim().toLowerCase().max(320);
export const passwordSchema = z.string().min(12).max(128);
const otpSchema = z.string().regex(/^\d{6}$/, "Code must contain exactly 6 digits");
export const usernameSchema = z
	.string()
	.trim()
	.toLowerCase()
	.min(3)
	.max(64)
	.regex(
		/^[a-z0-9._-]+$/,
		"Username may only contain lowercase letters, numbers, dots, underscores, and hyphens",
	);

export const registerBodySchema = z
	.object({
		email: emailSchema,
		username: usernameSchema,
		password: passwordSchema,
		/** Needed unless this Grid's owner has opened signup. */
		inviteToken: z.string().min(1).max(128).optional(),
	})
	.strict();

export const loginBodySchema = z
	.object({ email: emailSchema, password: z.string().min(1).max(128) })
	.strict();
export const emailBodySchema = z.object({ email: emailSchema }).strict();
export const verifyEmailBodySchema = z.object({ email: emailSchema, code: otpSchema }).strict();
export const resetPasswordBodySchema = z
	.object({ email: emailSchema, code: otpSchema, newPassword: passwordSchema })
	.strict();
export const changePasswordBodySchema = z
	.object({
		currentPassword: z.string().min(1).max(128),
		newPassword: passwordSchema,
	})
	.strict()
	.refine((input) => input.currentPassword !== input.newPassword, {
		path: ["newPassword"],
		message: "New password must be different from the current password",
	});

export const challengeTokenBodySchema = z
	.object({ challengeToken: z.string().min(20).max(512), code: z.string().min(6).max(32) })
	.strict();
export const magicLinkBodySchema = z.object({ token: z.string().min(20).max(512) }).strict();
export const totpCodeBodySchema = z.object({ code: z.string().min(6).max(32) }).strict();
export const googleCredentialBodySchema = z
	.object({ credential: z.string().min(100).max(10_000) })
	.strict();
export const passkeyOptionsBodySchema = z.object({ email: emailSchema.optional() }).strict();
export const passkeyRegistrationBodySchema = z
	.object({
		challengeId: z.uuid(),
		name: z.string().trim().min(1).max(100),
		response: z.record(z.string(), z.unknown()),
	})
	.strict();
export const passkeyAuthenticationBodySchema = z
	.object({
		challengeId: z.uuid(),
		response: z.record(z.string(), z.unknown()),
	})
	.strict();

/** Optional body for native clients that store the refresh token in SecureStore. */
export const refreshBodySchema = z.preprocess(
	(value) => (value == null || value === "" ? {} : value),
	z
		.object({
			refreshToken: z.string().min(20).max(2048).optional(),
		})
		.strict(),
);
