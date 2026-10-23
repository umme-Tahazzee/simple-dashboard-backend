import { z } from 'zod';

const ALLOWED_REPO_HOSTS = ['github.com', 'gitlab.com', 'bitbucket.org'];

const httpUrl = (label: string) =>
	z
		.string({ required_error: `${label} is required` })
		.trim()
		.max(300, `${label} is too long`)
		.url(`${label} must be a valid URL`)
		.refine((value) => /^https?:\/\//i.test(value), `${label} must start with http:// or https://`);

// Reduces equivalent spellings of a repo URL to one canonical form so the unique index catches duplicates
export const normalizeRepoUrl = (value: string) => {
	const url = new URL(value);
	const path = url.pathname.replace(/\/+$/, '').replace(/\.git$/i, '');
	return `https://${url.hostname.replace(/^www\./i, '')}${path}`.toLowerCase();
};

export const createSubmissionSchema = z.object({
	projectName: z
		.string({ required_error: 'Project name is required' })
		.trim()
		.min(3, 'Project name must be at least 3 characters')
		.max(100, 'Project name must be at most 100 characters'),
	repoUrl: httpUrl('Repo URL')
		.refine((value) => {
			const { hostname, pathname } = new URL(value);
			const host = hostname.replace(/^www\./i, '').toLowerCase();
			return ALLOWED_REPO_HOSTS.includes(host) && pathname.split('/').filter(Boolean).length >= 2;
		}, 'Repo URL must point to a repository on GitHub, GitLab or Bitbucket (e.g. https://github.com/owner/repo)')
		.transform(normalizeRepoUrl),
	liveLink: httpUrl('Live link'),
	description: z
		.string({ required_error: 'Description is required' })
		.trim()
		.min(20, 'Description must be at least 20 characters')
		.max(1000, 'Description must be at most 1000 characters'),
});

const statusEnum = z.enum(['PENDING', 'APPROVED', 'REJECTED']);

export const listSubmissionsSchema = z.object({
	page: z.coerce.number().int().min(1).default(1),
	limit: z.coerce.number().int().min(1).max(50).default(10),
	status: statusEnum.optional(),
	search: z.string().trim().max(100).optional(),
});

export const reviewSubmissionSchema = z
	.object({
		status: z.enum(['APPROVED', 'REJECTED']),
		feedback: z.string().trim().max(1000, 'Feedback must be at most 1000 characters').optional(),
	})
	.refine((value) => value.status !== 'REJECTED' || !!value.feedback, {
		path: ['feedback'],
		message: 'Feedback is required when rejecting a project',
	});

export type CreateSubmissionInput = z.infer<typeof createSubmissionSchema>;
export type ListSubmissionsQuery = z.infer<typeof listSubmissionsSchema>;
export type ReviewSubmissionInput = z.infer<typeof reviewSubmissionSchema>;
