import { Prisma } from '../../../../generated/prisma/client';
import { prisma } from '../../../lib/prisma';
import { AppError } from '../../../utils/AppError';
import type { CreateSubmissionInput, ListSubmissionsQuery, ReviewSubmissionInput } from './submission.validation';

const withRelations = {
	student: {
		select: {
			id: true,
			name: true,
			email: true
		}
	},
	feedbacks: {
		orderBy: {
			createdAt: 'desc'
		},
		take: 1,
		select:
		{
			message: true,
			createdAt: true
		}
	},
} satisfies Prisma.SubmissionInclude;

const create = async (studentId: string, input: CreateSubmissionInput) => {
	try {
		return await prisma.submission.create({ data: { ...input, studentId }, include: withRelations });
	} catch (error) {
		// repoUrl is unique, so concurrent identical submissions are rejected by the database too
		if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
			throw new AppError(409, 'This repository has already been submitted');
		}
		throw error;
	}
};

const listMine = (studentId: string) =>
	prisma.submission.findMany({
		where: { studentId },
		orderBy: { createdAt: 'desc' },
		include: withRelations,
	});

// Filtering, search and pagination all run in the database
const list = async ({ page, limit, status, search }: ListSubmissionsQuery) => {
	const where: Prisma.SubmissionWhereInput = {
		...(status && { status }),
		...(search && {
			OR: [
				{ projectName: { contains: search, mode: 'insensitive' } },
				{ student: { name: { contains: search, mode: 'insensitive' } } },
				{ student: { email: { contains: search, mode: 'insensitive' } } },
			],
		}),
	};

	const [items, total] = await prisma.$transaction([
		prisma.submission.findMany({
			where,
			orderBy: { createdAt: 'desc' },
			skip: (page - 1) * limit,
			take: limit,
			include: withRelations,
		}),
		prisma.submission.count({ where }),
	]);

	return { items, meta: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) } };
};

const stats = async () => {
	const groups = await prisma.submission.groupBy({ by: ['status'], _count: { _all: true } });
	const count = (status: string) => groups.find((group) => group.status === status)?._count._all ?? 0;
	const pending = count('PENDING');
	const approved = count('APPROVED');
	const rejected = count('REJECTED');
	return { total: pending + approved + rejected, pending, approved, rejected };
};

const review = async (id: string, mentorId: string, { status, feedback }: ReviewSubmissionInput) => {
	// Conditional update makes the PENDING -> decision transition atomic (no double review)
	const updated = await prisma.$transaction(async (tx) => {
		const { count } = await tx.submission.updateMany({
			where: { id, status: 'PENDING' },
			data: { status, reviewedAt: new Date() },
		});
		if (count === 0) return null;
		if (feedback) await tx.feedback.create({ data: { message: feedback, submissionId: id, mentorId } });
		return tx.submission.findUnique({ where: { id }, include: withRelations });
	});

	if (updated) return updated;

	const exists = await prisma.submission.findUnique({ where: { id }, select: { id: true } });
	if (!exists) throw new AppError(404, 'Submission not found');
	throw new AppError(409, 'This submission has already been reviewed');
};

export const SubmissionService = { create, listMine, list, stats, review };
