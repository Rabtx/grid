import type { Database } from "@grid/db";
import { schema } from "@grid/db";
import { and, desc, eq, isNotNull } from "drizzle-orm";

import type { BillingInterval, PaymentProviderName, PlanCode, SubscriptionStatus } from "./types";

export type SubscriptionRecord = typeof schema.subscriptions.$inferSelect;
export type NewSubscriptionRecord = typeof schema.subscriptions.$inferInsert;

export async function findLatestSubscriptionForUser(
	db: Database,
	userId: string,
): Promise<SubscriptionRecord | null> {
	const rows = await db
		.select()
		.from(schema.subscriptions)
		.where(eq(schema.subscriptions.userId, userId))
		.orderBy(desc(schema.subscriptions.updatedAt))
		.limit(1);
	return rows[0] ?? null;
}

export async function findSubscriptionByProvider(
	db: Database,
	provider: PaymentProviderName,
	providerSubscriptionId: string,
): Promise<SubscriptionRecord | null> {
	const rows = await db
		.select()
		.from(schema.subscriptions)
		.where(
			and(
				eq(schema.subscriptions.provider, provider),
				eq(schema.subscriptions.providerSubscriptionId, providerSubscriptionId),
			),
		)
		.limit(1);
	return rows[0] ?? null;
}

export async function findActiveCustomerForUser(
	db: Database,
	userId: string,
	provider: PaymentProviderName,
): Promise<SubscriptionRecord | null> {
	const rows = await db
		.select()
		.from(schema.subscriptions)
		.where(
			and(
				eq(schema.subscriptions.userId, userId),
				eq(schema.subscriptions.provider, provider),
				isNotNull(schema.subscriptions.providerCustomerId),
			),
		)
		.orderBy(desc(schema.subscriptions.updatedAt))
		.limit(1);
	return rows[0] ?? null;
}

export async function upsertSubscriptionFromWebhook(
	db: Database,
	input: {
		userId: string;
		provider: PaymentProviderName;
		providerCustomerId?: string;
		providerSubscriptionId?: string;
		planCode: PlanCode;
		billingInterval: BillingInterval;
		status: SubscriptionStatus;
		currentPeriodEnd?: Date;
		cancelAtPeriodEnd?: boolean;
	},
): Promise<SubscriptionRecord> {
	const existing = input.providerSubscriptionId
		? await findSubscriptionByProvider(db, input.provider, input.providerSubscriptionId)
		: null;

	if (existing) {
		const [updated] = await db
			.update(schema.subscriptions)
			.set({
				userId: input.userId,
				providerCustomerId: input.providerCustomerId ?? existing.providerCustomerId,
				planCode: input.planCode,
				billingInterval: input.billingInterval,
				status: input.status,
				currentPeriodEnd: input.currentPeriodEnd ?? existing.currentPeriodEnd,
				cancelAtPeriodEnd: input.cancelAtPeriodEnd ?? existing.cancelAtPeriodEnd,
				updatedAt: new Date(),
			})
			.where(eq(schema.subscriptions.id, existing.id))
			.returning();
		return updated;
	}

	const values: NewSubscriptionRecord = {
		userId: input.userId,
		provider: input.provider,
		providerCustomerId: input.providerCustomerId,
		providerSubscriptionId: input.providerSubscriptionId,
		planCode: input.planCode,
		billingInterval: input.billingInterval,
		status: input.status,
		currentPeriodEnd: input.currentPeriodEnd,
		cancelAtPeriodEnd: input.cancelAtPeriodEnd ?? false,
	};

	const [created] = await db.insert(schema.subscriptions).values(values).returning();
	return created;
}

export async function findUserById(
	db: Database,
	userId: string,
): Promise<{ id: string; email: string; isActive: boolean } | null> {
	const [user] = await db
		.select({
			id: schema.users.id,
			email: schema.users.email,
			isActive: schema.users.isActive,
		})
		.from(schema.users)
		.where(eq(schema.users.id, userId))
		.limit(1);
	return user ?? null;
}
