import 'dotenv/config';

import { hash } from 'bcryptjs';
import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import * as schema from './schema';

/**
 * Development seed: one verified account you can sign in with, and a board with
 * enough on it to see every stage rendered.
 *
 * Re-running only adds what is missing: an existing demo account keeps its id, password, projects
 * and tasks, so threads and folders tied to that account survive. `--reset` deletes the account
 * first (the cascade clears its projects and tasks) for a clean board.
 */
const DEMO_EMAIL = 'demo@grid.dev';
const DEMO_USERNAME = 'demo';
const DEMO_PASSWORD = 'GridDemo2026!';

type SeedTask = {
	title: string;
	description?: string;
	status: (typeof schema.taskStatus.enumValues)[number];
	ownerKind?: 'human' | 'agent';
	ownerName?: string;
	branch?: string;
};

const GRID_TASKS: SeedTask[] = [
	{
		title: 'Agent runs in isolated git worktrees',
		description:
			'A Run record per attempt, one worktree per task, output streamed back to the board.',
		status: 'backlog',
	},
	{ title: 'Event bus for task and run activity', status: 'backlog' },
	{
		title: 'Review surface: diff, comments, approvals',
		status: 'ready',
		ownerKind: 'human',
		ownerName: 'you',
	},
	{
		title: 'Task dependencies with cycle detection',
		description: 'Blocked-by edges so the board can express the DAG from the product definition.',
		status: 'ready',
	},
	{
		title: 'Wire the board to live task updates',
		status: 'in_progress',
		ownerKind: 'agent',
		ownerName: 'web agent',
		branch: 'agent/web/live-board',
	},
	{
		title: 'Deployment records tied to the task that produced them',
		status: 'in_progress',
		ownerKind: 'agent',
		ownerName: 'backend agent',
		branch: 'agent/backend/deployments',
	},
	{
		title: 'Serialise task number allocation',
		description: 'Row lock per project so concurrent creates cannot collide.',
		status: 'review',
		ownerKind: 'agent',
		ownerName: 'backend agent',
		branch: 'agent/backend/schema-proof',
	},
	{
		title: 'Landing page metadata and social cards',
		status: 'qa',
		ownerKind: 'agent',
		ownerName: 'web agent',
	},
	{
		title: 'Postgres for CI integration tests',
		status: 'blocked',
		description: 'Waiting on the runner image decision.',
	},
	{
		title: 'Pin bun 1.4.2 across the workspace',
		status: 'done',
		ownerKind: 'agent',
		ownerName: 'backend agent',
	},
	{
		title: 'Delete the starter residue',
		status: 'done',
		ownerKind: 'agent',
		ownerName: 'web agent',
	},
	{
		title: 'Docs accuracy pass against the real tree',
		status: 'done',
		ownerKind: 'agent',
		ownerName: 'web agent',
	},
];

const PLATFORM_TASKS: SeedTask[] = [
	{ title: 'Decide the agent runtime: harness fork or this spine', status: 'backlog' },
	{ title: 'Provider abstraction so no model is bedrock', status: 'ready' },
	{
		title: 'Runner abstraction: local, docker, ssh',
		status: 'in_progress',
		ownerKind: 'human',
		ownerName: 'you',
	},
];

type Db = ReturnType<typeof drizzle<typeof schema>>;

/** The demo account, created when missing and otherwise left exactly as it is. */
async function demoUser(db: Db): Promise<typeof schema.users.$inferSelect> {
	const [existing] = await db.select().from(schema.users).where(eq(schema.users.email, DEMO_EMAIL));
	if (existing) {
		console.log(`kept the demo account ${DEMO_EMAIL}`);
		return existing;
	}
	const [user] = await db
		.insert(schema.users)
		.values({
			email: DEMO_EMAIL,
			username: DEMO_USERNAME,
			passwordHash: await hash(DEMO_PASSWORD, 12),
			emailVerifiedAt: new Date(),
			isActive: true,
		})
		.returning();
	if (!user) throw new Error('Seed user was not created');
	await db.insert(schema.userProfiles).values({
		userId: user.id,
		displayName: 'Demo',
		bio: 'Seeded account for local development.',
	});
	return user;
}

async function main(): Promise<void> {
	const databaseUrl = process.env.DATABASE_URL;
	if (!databaseUrl) throw new Error('DATABASE_URL is required to seed');

	const client = postgres(databaseUrl, { max: 1, prepare: false });
	const db = drizzle(client, { schema });

	try {
		if (process.argv.includes('--reset')) {
			await db.delete(schema.users).where(eq(schema.users.email, DEMO_EMAIL));
			console.log('reset the demo account');
		}
		const user = await demoUser(db);

		for (const [slug, name, summary, taskList] of [
			['grid', 'Grid', 'The control plane itself.', GRID_TASKS],
			['platform', 'Platform', 'Runtime and provider work.', PLATFORM_TASKS],
		] as const) {
			const [existing] = await db
				.select({ id: schema.projects.id })
				.from(schema.projects)
				.where(and(eq(schema.projects.ownerId, user.id), eq(schema.projects.slug, slug)));
			if (existing) {
				console.log(`kept project "${slug}"`);
				continue;
			}
			const [project] = await db
				.insert(schema.projects)
				.values({ ownerId: user.id, slug, name, summary })
				.returning();
			if (!project) throw new Error(`Seed project ${slug} was not created`);

			let index = 0;
			for (const task of taskList) {
				index += 1;
				await db.insert(schema.tasks).values({
					projectId: project.id,
					number: index,
					position: index,
					title: task.title,
					description: task.description ?? null,
					status: task.status,
					ownerKind: task.ownerKind ?? null,
					ownerName: task.ownerName ?? null,
					branch: task.branch ?? null,
				});
			}
			console.log(`seeded project "${slug}" with ${taskList.length} tasks`);
		}

		console.log('\nSign in at http://localhost:3000/login');
		console.log(`  email:    ${DEMO_EMAIL}`);
		console.log(`  password: ${DEMO_PASSWORD}`);
	} finally {
		await client.end();
	}
}

void main();
