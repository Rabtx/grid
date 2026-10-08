import { type Database, schema } from "@grid/db";
import { and, asc, count, desc, eq, gt, inArray, max, notExists, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import type { Machine, SyncInput, SyncThread } from "./schema";

const { threads, threadEvents, users, workspaces } = schema;

/** What a sync round answers: the last `seq` the server holds for each thread it was sent. */
export type SyncResult = { seqs: Record<string, number>; skipped: string[] };

/**
 * One runner's sync round. A thread is written only by the machine that holds it (or is new), so
 * once a thread is restored elsewhere its old machine coming back cannot take it back. Events are
 * keyed by `(thread, seq)`, so a round sent twice changes nothing. A thread in a workspace this
 * Grid does not have is skipped, not fatal: the rest of the round still lands.
 */
export async function sync(db: Database, input: SyncInput): Promise<SyncResult> {
	const skipped: string[] = [];
	const seqs: Record<string, number> = {};
	const workspaceIds = [...new Set(input.threads.map((thread) => thread.workspaceId))];
	const known = new Set(
		workspaceIds.length
			? (
					await db
						.select({ id: workspaces.id })
						.from(workspaces)
						.where(inArray(workspaces.id, workspaceIds))
				).map((row) => row.id)
			: [],
	);
	const ownerIds = [...new Set(input.threads.map((thread) => thread.ownerId).filter(isUuid))];
	const owners = new Set(
		ownerIds.length
			? (await db.select({ id: users.id }).from(users).where(inArray(users.id, ownerIds))).map(
					(row) => row.id,
				)
			: [],
	);

	for (const thread of input.threads) {
		if (!known.has(thread.workspaceId)) {
			skipped.push(thread.id);
			continue;
		}
		const kept = await keepThread(db, input.machine, thread, owners);
		if (!kept) {
			skipped.push(thread.id);
			continue;
		}
		if (thread.events.length) {
			await db
				.insert(threadEvents)
				.values(
					thread.events.map((event) => ({ threadId: thread.id, seq: event.seq, data: event.data })),
				)
				.onConflictDoNothing();
		}
	}

	const sent = input.threads.map((thread) => thread.id).filter((id) => !skipped.includes(id));
	if (sent.length) {
		const rows = await db
			.select({ id: threadEvents.threadId, top: max(threadEvents.seq), n: count() })
			.from(threadEvents)
			.where(inArray(threadEvents.threadId, sent))
			.groupBy(threadEvents.threadId);
		for (const id of sent) seqs[id] = 0;
		for (const row of rows) {
			// Events are numbered from 1 without gaps, so as many rows as the top number means the
			// copy is whole. Otherwise (a database restored from an older backup, say) the runner is
			// told where the first gap is, and sends everything after it again.
			seqs[row.id] = row.n === row.top ? (row.top ?? 0) : await wholeUpTo(db, row.id);
		}
	}

	if (input.deleted.length) {
		await db
			.delete(threads)
			.where(and(inArray(threads.id, input.deleted), eq(threads.machineId, input.machine.id)));
	}
	return { seqs, skipped };
}

/** The last `seq` a thread holds with every event before it: 0 when even the first is missing. */
async function wholeUpTo(db: Database, threadId: string): Promise<number> {
	const next = alias(threadEvents, "next");
	const [end] = await db
		.select({ seq: threadEvents.seq })
		.from(threadEvents)
		.where(
			and(
				eq(threadEvents.threadId, threadId),
				notExists(
					db
						.select({ one: sql`1` })
						.from(next)
						.where(
							and(
								eq(next.threadId, threadEvents.threadId),
								eq(next.seq, sql`${threadEvents.seq} + 1`),
							),
						),
				),
			),
		)
		.orderBy(asc(threadEvents.seq))
		.limit(1);
	const [first] = await db
		.select({ seq: threadEvents.seq })
		.from(threadEvents)
		.where(and(eq(threadEvents.threadId, threadId), eq(threadEvents.seq, 1)));
	return first ? (end?.seq ?? 0) : 0;
}

/** Writes a thread's details; false when another machine holds it now. */
async function keepThread(
	db: Database,
	machine: Machine,
	thread: SyncThread,
	owners: Set<string>,
): Promise<boolean> {
	const values = {
		id: thread.id,
		workspaceId: thread.workspaceId,
		project: thread.project,
		ownerId: thread.ownerId && owners.has(thread.ownerId) ? thread.ownerId : null,
		provider: thread.provider,
		title: thread.title,
		model: thread.model ?? null,
		mode: thread.mode ?? null,
		effort: thread.effort ?? null,
		machineId: machine.id,
		machineName: machine.name ?? null,
		createdAt: new Date(thread.createdAt),
		updatedAt: new Date(thread.updatedAt),
		syncedAt: new Date(),
	};
	const [row] = await db
		.insert(threads)
		.values(values)
		.onConflictDoUpdate({
			target: threads.id,
			set: {
				project: values.project,
				title: values.title,
				model: values.model,
				mode: values.mode,
				effort: values.effort,
				machineName: values.machineName,
				updatedAt: values.updatedAt,
				syncedAt: values.syncedAt,
			},
			// Only the machine holding it may change it.
			setWhere: eq(threads.machineId, machine.id),
		})
		.returning({ id: threads.id });
	return Boolean(row);
}

/** Every machine with threads in this Grid, newest sync first: what a restore picks from. */
export async function machines(db: Database) {
	return db
		.select({
			id: threads.machineId,
			name: sql<string | null>`max(${threads.machineName})`,
			threads: count(threads.id),
			lastSyncedAt: max(threads.syncedAt),
		})
		.from(threads)
		.groupBy(threads.machineId)
		.orderBy(desc(max(threads.syncedAt)));
}

/** A machine's threads, for a restore to import. */
export async function machineThreads(db: Database, machineId: string) {
	return db
		.select()
		.from(threads)
		.where(eq(threads.machineId, machineId))
		.orderBy(asc(threads.createdAt));
}

/** A page of a thread's events after `after`, oldest first. */
export async function events(db: Database, threadId: string, after: number, limit: number) {
	return db
		.select({ seq: threadEvents.seq, data: threadEvents.data })
		.from(threadEvents)
		.where(and(eq(threadEvents.threadId, threadId), gt(threadEvents.seq, after)))
		.orderBy(asc(threadEvents.seq))
		.limit(limit);
}

/** Moves every thread `from` holds to `machine`, after it has imported them. */
export async function claim(db: Database, from: string, machine: Machine): Promise<number> {
	const moved = await db
		.update(threads)
		.set({ machineId: machine.id, machineName: machine.name ?? null, syncedAt: new Date() })
		.where(eq(threads.machineId, from))
		.returning({ id: threads.id });
	return moved.length;
}

function isUuid(value: string | null): value is string {
	return (
		value !== null && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
	);
}
