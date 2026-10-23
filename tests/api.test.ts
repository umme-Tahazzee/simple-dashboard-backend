import bcrypt from 'bcryptjs';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import app from '../src/app';
import { prisma } from '../src/lib/prisma';

// Integration tests: run against the database in DATABASE_URL.
// Every row they create uses this run's unique tag and is deleted afterwards.
const tag = `t${Date.now()}`;
const studentEmail = `student-${tag}@test.local`;
const mentorEmail = `mentor-${tag}@test.local`;
const password = 'password1';

const project = (n: number) => ({
	projectName: `Project ${tag} ${n}`,
	repoUrl: `https://github.com/${tag}/repo-${n}`,
	liveLink: `https://${tag}-${n}.example.dev`,
	description: `Integration test project number ${n}, 
	long enough to pass validation.`,
});

const student = request.agent(app);
const mentor = request.agent(app);

beforeAll(async () => {
	await prisma.user.create({
		data: { 
			name: 'Test Mentor', 
			email: mentorEmail, 
			passwordHash: await bcrypt.hash(password, 4), 
			role: 'MENTOR' },
	});
});

afterAll(async () => {
	// Students first: deleting them cascades to their submissions and feedback, which frees the mentor
	await prisma.user.deleteMany({ where: { role: 'STUDENT', email: { endsWith: `-${tag}@test.local` } } });
	await prisma.user.deleteMany({ where: { role: 'MENTOR', email: { endsWith: `-${tag}@test.local` } } });
	await prisma.$disconnect();
});

describe('health and error handling', () => {
	it('reports DB-backed health', async () => {
		const res = await request(app).get('/health');
		expect(res.status).toBe(200);
	});

	it('returns 400 for malformed JSON', async () => {
		const res = await request(app).post('/api/v1/auth/login').set('Content-Type', 'application/json').send('{bad');
		expect(res.status).toBe(400);
		expect(res.body.message).toBe('Malformed JSON body');
	});

	it('sets security headers', async () => {
		const res = await request(app).get('/');
		expect(res.headers['x-content-type-options']).toBe('nosniff');
		expect(res.headers['x-powered-by']).toBeUndefined();
	});
});

describe('auth', () => {
	it('rejects weak passwords', async () => {
		const res = await request(app).post('/api/v1/auth/signup').send({ name: 'Weak', email: `weak-${tag}@test.local`, password: 'short' });
		expect(res.status).toBe(400);
	});

	it('signs up a student and ignores any client-supplied role', async () => {
		const res = await student
			.post('/api/v1/auth/signup')
			.send({ name: 'Test Student', email: studentEmail, password, role: 'ADMIN' });
		expect(res.status).toBe(201);
		expect(res.body.data.user.role).toBe('STUDENT');
	});

	it('rejects a duplicate email', async () => {
		const res = await request(app).post('/api/v1/auth/signup').send({ name: 'Again', email: studentEmail, password });
		expect(res.status).toBe(409);
	});

	it('rejects wrong credentials without revealing which part was wrong', async () => {
		const wrongPassword = await request(app).post('/api/v1/auth/login').send({ email: studentEmail, password: 'nope-nope1' });
		const unknownEmail = await request(app).post('/api/v1/auth/login').send({ email: `nobody-${tag}@test.local`, password });
		expect(wrongPassword.status).toBe(401);
		expect(unknownEmail.status).toBe(401);
		expect(wrongPassword.body.message).toBe(unknownEmail.body.message);
	});

	it('logs the mentor in', async () => {
		const res = await mentor.post('/api/v1/auth/login').send({ email: mentorEmail, password });
		expect(res.status).toBe(200);
		expect(res.body.data.user.role).toBe('MENTOR');
	});
});

describe('role-based access control', () => {
	it('requires authentication', async () => {
		expect((await request(app).get('/api/v1/submissions/stats')).status).toBe(401);
	});

	it('blocks students from mentor routes', async () => {
		expect((await student.get('/api/v1/submissions')).status).toBe(403);
		expect((await student.get('/api/v1/submissions/stats')).status).toBe(403);
		expect((await student.patch('/api/v1/submissions/x/review').send({ status: 'APPROVED' })).status).toBe(403);
	});

	it('blocks mentors from submitting projects', async () => {
		expect((await mentor.post('/api/v1/submissions').send(project(0))).status).toBe(403);
	});
});

describe('submission lifecycle', () => {
	let firstId: string;

	it('rejects an invalid submission with field errors', async () => {
		const res = await student.post('/api/v1/submissions').send({ ...project(1), repoUrl: 'https://example.com/a/b', liveLink: 'nope' });
		expect(res.status).toBe(400);
		expect(res.body.errors.map((e: { path: string }) => e.path)).toEqual(expect.arrayContaining(['repoUrl', 'liveLink']));
	});

	it('creates a submission as PENDING', async () => {
		const res = await student.post('/api/v1/submissions').send(project(1));
		expect(res.status).toBe(201);
		expect(res.body.data.status).toBe('PENDING');
		firstId = res.body.data.id;
	});

	it('treats differently written URLs of the same repo as a duplicate', async () => {
		const res = await student
			.post('/api/v1/submissions')
			.send({ ...project(2), repoUrl: `https://www.GitHub.com/${tag.toUpperCase()}/Repo-1.git/` });
		expect(res.status).toBe(409);
	});

	it('requires feedback to reject', async () => {
		const res = await mentor.patch(`/api/v1/submissions/${firstId}/review`).send({ status: 'REJECTED' });
		expect(res.status).toBe(400);
	});

	it('rejects with feedback, which the student can then see', async () => {
		const res = await mentor.patch(`/api/v1/submissions/${firstId}/review`).send({ status: 'REJECTED', feedback: 'Add a README' });
		expect(res.status).toBe(200);
		expect(res.body.data.status).toBe('REJECTED');

		const mine = await student.get('/api/v1/submissions/mine');
		expect(mine.body.data[0].feedbacks[0].message).toBe('Add a README');
	});

	it('does not allow a second review', async () => {
		const res = await mentor.patch(`/api/v1/submissions/${firstId}/review`).send({ status: 'APPROVED' });
		expect(res.status).toBe(409);
	});

	it('returns 404 for an unknown submission', async () => {
		const res = await mentor.patch('/api/v1/submissions/does-not-exist/review').send({ status: 'APPROVED' });
		expect(res.status).toBe(404);
	});

	it('filters and paginates on the server', async () => {
		await student.post('/api/v1/submissions').send(project(3));

		const rejected = await mentor.get('/api/v1/submissions').query({ status: 'REJECTED', search: tag });
		expect(rejected.body.data.map((s: { id: string }) => s.id)).toEqual([firstId]);

		const pending = await mentor.get('/api/v1/submissions').query({ status: 'PENDING', search: tag });
		expect(pending.body.data).toHaveLength(1);

		const paged = await mentor.get('/api/v1/submissions').query({ search: tag, limit: 1, page: 2 });
		expect(paged.body.data).toHaveLength(1);
		expect(paged.body.meta).toMatchObject({ page: 2, limit: 1, total: 2, totalPages: 2 });

		expect((await mentor.get('/api/v1/submissions').query({ status: 'BOGUS' })).status).toBe(400);
	});

	it('returns aggregate stats', async () => {
		const res = await mentor.get('/api/v1/submissions/stats');
		expect(res.status).toBe(200);
		const { total, pending, approved, rejected } = res.body.data;
		expect(total).toBe(pending + approved + rejected);
		expect(rejected).toBeGreaterThanOrEqual(1);
	});

	it('rate limits submissions per student (5 attempts per window, valid or not)', async () => {
		// Attempts so far: invalid, created, duplicate, project 3 = 4 (the mentor's 403 never reaches the limiter)
		expect((await student.post('/api/v1/submissions').send(project(4))).status).toBe(201);
		const res = await student.post('/api/v1/submissions').send(project(5));
		expect(res.status).toBe(429);
	});
});
