import * as z from "zod";

export const createCheckoutSchema = z
	.object({
		provider: z.enum(["stripe", "razorpay"]).optional(),
		/** A workspace slug; the default workspace when left out. */
		workspace: z.string().trim().min(1).max(64).optional(),
		planCode: z.enum(["team", "enterprise"]),
		billingInterval: z.enum(["monthly", "yearly"]).default("monthly"),
		successUrl: z.url().optional(),
		cancelUrl: z.url().optional(),
	})
	.strict();

export const createPortalSchema = z
	.object({
		provider: z.enum(["stripe", "razorpay"]).optional(),
		workspace: z.string().trim().min(1).max(64).optional(),
		returnUrl: z.url().optional(),
	})
	.strict();

export type CreateCheckoutInput = z.infer<typeof createCheckoutSchema>;
export type CreatePortalInput = z.infer<typeof createPortalSchema>;
