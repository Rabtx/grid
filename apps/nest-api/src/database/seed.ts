import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';

import { hash } from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import * as schema from './schema';

/**
 * Development seed: one verified account you can sign in with, and a board with
 * real tasks loaded from the repository's `.agents/board/` (open, doing, done).
 *
 * Re-running replaces the demo account. Deleting the user cascades to projects and
 * tasks, so there is nothing to clean up by hand.
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

/**
 * Discover and parse real cards from `.agents/board/` to mirror the authentic
 * agent work history into the Grid console board.
 */
function loadAgentBoardTasks(): SeedTask[] {
	const candidates = [
		path.resolve(process.cwd(), '../../.agents/board'),
		path.resolve(process.cwd(), '.agents/board'),
		path.resolve(__dirname, '../../../../.agents/board'),
	];
	let boardDir: string | null = null;
	for (const candidate of candidates) {
		if (fs.existsSync(candidate)) {
			boardDir = candidate;
			break;
		}
	}
	if (!boardDir) return [];

	const subdirs = ['done', 'doing', 'open'] as const;
	const cardEntries: { file: string; sub: string; fullPath: string }[] = [];

	for (const sub of subdirs) {
		const dir = path.join(boardDir, sub);
		if (!fs.existsSync(dir)) continue;
		const files = fs.readdirSync(dir).filter((f) => f.endsWith('.md') && !f.startsWith('.'));
		for (const file of files) {
			cardEntries.push({ file, sub, fullPath: path.join(dir, file) });
		}
	}

	// Sort chronologically by date/filename prefix
	cardEntries.sort((a, b) => a.file.localeCompare(b.file));

	const tasks: SeedTask[] = [];

	for (const entry of cardEntries) {
		const raw = fs.readFileSync(entry.fullPath, 'utf8');
		const fmMatch = raw.match(/^---\n([\s\S]*?)\n---\n*([\s\S]*)$/);
		if (!fmMatch) continue;
		const [, fm, body] = fmMatch;
		const meta: Record<string, string> = {};
		for (const line of fm.split('\n')) {
			const idx = line.indexOf(':');
			if (idx > -1) {
				const k = line.slice(0, idx).trim();
				const v = line.slice(idx + 1).trim();
				meta[k] = v;
			}
		}

		const whatMatch = body.match(/## What\s*\n+([\s\S]*?)(?=\n## |$)/);
		const description = whatMatch ? whatMatch[1].trim() : body.trim().slice(0, 500) || undefined;

		let status: (typeof schema.taskStatus.enumValues)[number] =
			entry.sub === 'done' ? 'done' : entry.sub === 'doing' ? 'in_progress' : 'ready';
		if (meta.status) {
			const s = meta.status.toLowerCase();
			if (s === 'done') status = 'done';
			else if (s === 'doing' || s === 'in_progress') status = 'in_progress';
			else if (s === 'review') status = 'review';
			else if (s === 'qa') status = 'qa';
			else if (s === 'blocked') status = 'blocked';
			else if (s === 'ready') status = 'ready';
			else if (s === 'backlog') status = 'backlog';
		}

		const assignee = meta.assignee || 'none';
		let ownerKind: 'human' | 'agent' | undefined;
		let ownerName: string | undefined;
		if (assignee !== 'none' && assignee !== '') {
			if (assignee === 'human' || assignee === 'you') {
				ownerKind = 'human';
				ownerName = 'you';
			} else {
				ownerKind = 'agent';
				ownerName = assignee;
			}
		}

		tasks.push({
			title: (meta.title || entry.file.replace(/\.md$/, '')).slice(0, 200),
			description,
			status,
			ownerKind,
			ownerName: ownerName ? ownerName.slice(0, 120) : undefined,
			branch: meta.branch ? meta.branch.slice(0, 200) : undefined,
		});
	}

	return tasks;
}

const FALLBACK_GRID_TASKS: SeedTask[] = [
	{
		title: 'Right-aligned user chat bubbles and message action bars',
		description:
			'User messages right aligned with bubble styling and action bar (copy, note, handover, regenerate).',
		status: 'done',
		ownerKind: 'agent',
		ownerName: 'antigravity',
		branch: 'agent/ui-ux/chat-message-actions-alignment',
	},
	{
		title: 'Browse and create files and folders inside each project',
		description: 'Browse, create files and folders inside each project folder via runner.',
		status: 'done',
		ownerKind: 'agent',
		ownerName: 'codex',
		branch: 'agent/web/project-files',
	},
	{
		title: 'PWA improvement: native-feeling launch and system chrome',
		description: 'Polish the installed console first paint, system bar colour, and shell caching.',
		status: 'done',
		ownerKind: 'agent',
		ownerName: 'codex',
		branch: 'agent/web/pwa-improvement',
	},
	{
		title: 'Chat and terminals recover by themselves when the runner restarts',
		description: 'Chat and terminals recover automatically when runner restarts.',
		status: 'done',
		ownerKind: 'agent',
		ownerName: 'antigravity',
		branch: 'agent/web/runner-restart-recovery',
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

async function main(): Promise<void> {
	const databaseUrl = process.env.DATABASE_URL;
	if (!databaseUrl) throw new Error('DATABASE_URL is required to seed');

	const client = postgres(databaseUrl, { max: 1, prepare: false });
	const db = drizzle(client, { schema });

	try {
		// Start clean so the seed is repeatable; the cascade clears projects and tasks.
		await db.delete(schema.users).where(eq(schema.users.email, DEMO_EMAIL));

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

		const realGridTasks = loadAgentBoardTasks();
		const gridTaskList = realGridTasks.length > 0 ? realGridTasks : FALLBACK_GRID_TASKS;

		for (const [slug, name, summary, taskList] of [
			['grid', 'Grid', 'The control plane itself.', gridTaskList],
			['platform', 'Platform', 'Runtime and provider work.', PLATFORM_TASKS],
		] as const) {
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
