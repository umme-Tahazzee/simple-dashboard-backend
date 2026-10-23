import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { authenticate, authorize } from '../../middlewares/auth';
import { validateRequest } from '../../middlewares/validateRequest';
import { SubmissionController } from './submission.controller';
import {
	createSubmissionSchema,
	listSubmissionsSchema,
	reviewSubmissionSchema,
} from './submission.validation';

// Per-student limit (keyed by user id, falling back to IP) to stop spam submissions
const submitLimiter = rateLimit({
	windowMs: 10 * 60 * 1000,
	limit: 5,
	standardHeaders: 'draft-8',
	legacyHeaders: false,
	keyGenerator: (req) => req.user?.sub ?? req.ip ?? 'anonymous',
	validate: { keyGeneratorIpFallback: false },
	message: { success: false, message: 'Too many submissions, please try again in a few minutes' },
});

const router = Router();

router.use(authenticate);

// Student
router.post('/', authorize('STUDENT'), submitLimiter, validateRequest(createSubmissionSchema), SubmissionController.create);
router.get('/mine', authorize('STUDENT'), SubmissionController.listMine);

// Mentor / admin
router.get('/', authorize('MENTOR', 'ADMIN'), validateRequest(listSubmissionsSchema, 'query'), SubmissionController.list);
router.get('/stats', authorize('MENTOR', 'ADMIN'), SubmissionController.stats);
router.patch(
	'/:id/review',
	authorize('MENTOR', 'ADMIN'),
	validateRequest(reviewSubmissionSchema),
	SubmissionController.review,
);

export const SubmissionRoutes = router;
