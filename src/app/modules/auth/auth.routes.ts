import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { authenticate } from '../../middlewares/auth';
import { validateRequest } from '../../middlewares/validateRequest';
import { AuthController } from './auth.controller';
import { loginSchema, signupSchema } from './auth.validation';

const authLimiter = rateLimit({
	windowMs: 15 * 60 * 1000,
	limit: 20,
	standardHeaders: 'draft-8',
	legacyHeaders: false,
	message: { success: false, message: 'Too many attempts, please try again later' },
});

const router = Router();

router.post('/signup', authLimiter, validateRequest(signupSchema), AuthController.signup);
router.post('/login', authLimiter, validateRequest(loginSchema), AuthController.login);
router.post('/logout', AuthController.logout);
router.get('/me', authenticate, AuthController.me);

export const AuthRoutes = router;
