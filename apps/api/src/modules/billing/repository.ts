import type { Database } from "@grid/db";
import { schema } from "@grid/db";
import { and, desc, eq, isNotNull, sql, type SQL } from "drizzle-orm";

import type { BillingInterval, PaymentProviderName, PlanCode, SubscriptionStatus } from "./types";

export type SubscriptionRecord = typeof schema.subscriptions.$inferSelect;
export type NewSubscriptionRecord = typeof schema.subscriptions.$inferInsert;

export async function findLatestSubscriptionForWorkspace(
	db: Database,
	workspaceId: string,
): Promise<SubscriptionRecord | null> {
	const rows = await db
		.select()
		.from(schema.subscriptions)
		.where(eq(schema.subscriptions.workspaceId, workspaceId))
		.orderBy(desc(schema.subscriptions.updatedAt))
		.limit(1);
	return rows[0] ?? null;
}

export async function findActiveCustomerForWorkspace(
	db: Database,
	workspaceId: string,
	provider: PaymentProviderName,
): Promise<SubscriptionRecord | null> {
	const rows = await db
		.select()
		.from(schema.subscriptions)
		.where(
			and(
				eq(schema.subscriptions.workspaceId, workspaceId),
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
		workspaceId: string;
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
	// One statement, not a lookup followed by an insert. Payment providers deliver webhooks at
	// least once and concurrently, so two deliveries of the same event both missed the lookup and
	// both inserted; the loser died on subscriptions_provider_sub_unique and the provider retried
	// forever. The upsert makes the second delivery converge on the row the first one made.
	const values: NewSubscriptionRecord = {
		userId: input.userId,
		workspaceId: input.workspaceId,
		provider: input.provider,
		providerCustomerId: input.providerCustomerId,
		providerSubscriptionId: input.providerSubscriptionId,
		planCode: input.planCode,
		billingInterval: input.billingInterval,
		status: input.status,
		currentPeriodEnd: input.currentPeriodEnd,
		cancelAtPeriodEnd: input.cancelAtPeriodEnd ?? false,
	};
	const [record] = await db
		.insert(schema.subscriptions)
		.values(values)
		.onConflictDoUpdate({
			target: [schema.subscriptions.provider, schema.subscriptions.providerSubscriptionId],
			set: {
				userId: input.userId,
				workspaceId: input.workspaceId,
				// Whatever this particular event did not carry, the stored value still holds.
				providerCustomerId: keepStored(
					input.providerCustomerId,
					sql`${schema.subscriptions.providerCustomerId}`,
				),
				planCode: input.planCode,
				billingInterval: input.billingInterval,
				status: input.status,
				currentPeriodEnd: keepStored(
					input.currentPeriodEnd,
					sql`${schema.subscriptions.currentPeriodEnd}`,
				),
				cancelAtPeriodEnd: keepStored(
					input.cancelAtPeriodEnd,
					sql`${schema.subscriptions.cancelAtPeriodEnd}`,
				),
				updatedAt: new Date(),
			},
		})
		.returning();
	return record;
}

/** The value the webhook carried, or a reference to what is already stored. */
function keepStored<T>(provided: T | undefined, stored: SQL): T | SQL {
	return provided ?? stored;
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
