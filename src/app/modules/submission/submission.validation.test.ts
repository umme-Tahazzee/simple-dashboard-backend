import { describe, expect, it } from 'vitest';
import { createSubmissionSchema, normalizeRepoUrl, reviewSubmissionSchema } from './submission.validation';

const valid = {
	projectName: 'My Portfolio',
	repoUrl: 'https://github.com/owner/repo',
	liveLink: 'https://example.dev',
	description: 'A portfolio site built with Next.js and Tailwind.',
};

describe('normalizeRepoUrl', () => {
	it.each([
		['https://github.com/Owner/Repo', 'https://github.com/owner/repo'],
		['https://www.GitHub.com/owner/repo.git', 'https://github.com/owner/repo'],
		['https://github.com/owner/repo.git/', 'https://github.com/owner/repo'],
		['http://github.com/owner/repo/', 'https://github.com/owner/repo'],
		['https://github.com/owner/repo?tab=readme#top', 'https://github.com/owner/repo'],
	])('%s -> %s', (input, expected) => {
		expect(normalizeRepoUrl(input)).toBe(expected);
	});
});

describe('createSubmissionSchema', () => {
	it('accepts a valid payload and normalizes the repo URL', () => {
		const result = createSubmissionSchema.parse({ ...valid, repoUrl: 'https://GitHub.com/Owner/Repo.git' });
		expect(result.repoUrl).toBe('https://github.com/owner/repo');
	});

	it.each([
		['short name', { projectName: 'ab' }],
		['non-repo host', { repoUrl: 'https://example.com/owner/repo' }],
		['repo URL without a repository path', { repoUrl: 'https://github.com/owner' }],
		['non-http live link', { liveLink: 'ftp://example.dev' }],
		['garbage live link', { liveLink: 'not a url' }],
		['short description', { description: 'too short' }],
	])('rejects %s', (_label, override) => {
		expect(createSubmissionSchema.safeParse({ ...valid, ...override }).success).toBe(false);
	});
});

describe('reviewSubmissionSchema', () => {
	it('allows approving without feedback', () => {
		expect(reviewSubmissionSchema.safeParse({ status: 'APPROVED' }).success).toBe(true);
	});

	it('requires feedback when rejecting', () => {
		expect(reviewSubmissionSchema.safeParse({ status: 'REJECTED' }).success).toBe(false);
		expect(reviewSubmissionSchema.safeParse({ status: 'REJECTED', feedback: '   ' }).success).toBe(false);
		expect(reviewSubmissionSchema.safeParse({ status: 'REJECTED', feedback: 'Add a README' }).success).toBe(true);
	});

	it('does not allow setting a submission back to PENDING', () => {
		expect(reviewSubmissionSchema.safeParse({ status: 'PENDING' }).success).toBe(false);
	});
});
