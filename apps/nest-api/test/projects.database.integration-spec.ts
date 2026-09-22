import 'dotenv/config';

import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppConfigService } from '@/config/app-config.service';
import { DatabaseService } from '@/database/database.service';
import { projects, tasks, users } from '@/database/schema';
import { ProjectsRepository } from '@/modules/projects/projects.repository';
import { ProjectsService } from '@/modules/projects/projects.service';

/**
 * Exercises the board against a real Postgres. The unit specs mock the repository,
 * so nothing else proves the SQL actually runs — and the first time this was run it
 * found a live concurrency bug in task-number allocation.
 */
describe('database-backed projects and tasks', () => {
	const config = new AppConfigService();
	const database = new DatabaseService(config);
	const service = new ProjectsService(new ProjectsRepository(database));

	const suffix = randomUUID().slice(0, 8);
	const ownerSlug = `owner-${suffix}`;
	const strangerSlug = `stranger-${suffix}`;
	let ownerId = '';
	let strangerId = '';

	beforeAll(async () => {
		const [owner] = await database.db
			.insert(users)
			.values({ email: `owner-${suffix}@example.com`, username: `owner${suffix}` })
			.returning();
		const [stranger] = await database.db
			.insert(users)
			.values({ email: `stranger-${suffix}@example.com`, username: `stranger${suffix}` })
			.returning();
		ownerId = owner?.id ?? '';
		strangerId = stranger?.id ?? '';
	});

	afterAll(async () => {
		for (const id of [ownerId, strangerId]) {
			if (id) await database.db.delete(users).where(eq(users.id, id));
		}
		await database.onModuleDestroy();
	});

	it('creates a project and rejects a duplicate slug for the same owner', async () => {
		const project = await service.createProject(ownerId, { slug: ownerSlug, name: 'Owner board' });
		expect(project.slug).toBe(ownerSlug);
		await expect(
			service.createProject(ownerId, { slug: ownerSlug, name: 'Again' }),
		).rejects.toThrow();
	});

	it('allows another owner to reuse the same slug', async () => {
		const mine = await service.createProject(strangerId, { slug: ownerSlug, name: 'Theirs' });
		expect(mine.slug).toBe(ownerSlug);
	});

	it('numbers tasks per project, starting at one', async () => {
		const first = await service.createTask(ownerId, ownerSlug, { title: 'first' });
		const second = await service.createTask(ownerId, ownerSlug, { title: 'second' });
		expect(first.number).toBe(1);
		expect(second.number).toBe(2);
		expect(first.key).toBe('TASK-1');
		expect(second.position).toBeGreaterThan(first.position);
	});

	it('gives concurrent creates distinct numbers', async () => {
		// The allocation used to read max(number) in a subquery, so parallel inserts
		// collided on the unique index. Each create must now get its own number.
		const results = await Promise.all(
			Array.from({ length: 8 }, (_, index) =>
				service.createTask(ownerId, ownerSlug, { title: `concurrent ${index}` }),
			),
		);
		const numbers = results.map((task) => task.number);
		expect(new Set(numbers).size).toBe(numbers.length);
		expect(new Set(results.map((task) => task.position)).size).toBe(results.length);
	});

	it('hides another owner behind a not-found rather than a forbidden', async () => {
		await expect(service.getProject(strangerId, strangerSlug)).rejects.toMatchObject({
			status: 404,
		});
		await expect(service.listTasks(strangerId, strangerSlug)).rejects.toMatchObject({
			status: 404,
		});
	});

	it('does not leak another owner tasks through a shared slug', async () => {
		const theirs = await service.listTasks(strangerId, ownerSlug);
		expect(theirs).toEqual([]);
		await expect(
			service.updateTask(strangerId, ownerSlug, 1, { status: 'done' }),
		).rejects.toMatchObject({ status: 404 });
	});

	it('persists a stage move', async () => {
		const moved = await service.updateTask(ownerId, ownerSlug, 1, { status: 'review' });
		expect(moved.status).toBe('review');
		const [reloaded] = await service.listTasks(ownerId, ownerSlug);
		expect(reloaded?.status).toBe('review');
	});

	it('cascades task deletion when a project is removed', async () => {
		const owned = await database.db.select().from(projects).where(eq(projects.ownerId, ownerId));
		const projectId = owned[0]?.id ?? '';
		expect(projectId).not.toBe('');

		const before = await database.db.select().from(tasks).where(eq(tasks.projectId, projectId));
		expect(before.length).toBeGreaterThan(0);

		await database.db.delete(projects).where(eq(projects.id, projectId));

		const after = await database.db.select().from(tasks).where(eq(tasks.projectId, projectId));
		expect(after).toEqual([]);
	});
});
