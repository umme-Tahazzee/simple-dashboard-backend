import type { RequestHandler } from 'express';
import type { Role } from '../../../generated/prisma/client';
import config from '../../config';
import { AppError } from '../../utils/AppError';
import { type AuthPayload, verifyToken } from '../../utils/jwt';

declare global {
	namespace Express {
		interface Request {
			user?: AuthPayload;
		}
	}
}

const readToken = (header: string | undefined, cookie: string | undefined) =>
	header?.startsWith('Bearer ') ? header.slice(7) : cookie;

// Verifies the JWT (Bearer header or httpOnly cookie) and attaches { sub, role } to req.user
export const authenticate: RequestHandler = (req, _res, next) => {
	const token = readToken(req.headers.authorization, req.cookies?.accessToken);
	if (!token) throw new AppError(401, 'Authentication required');

	try {
		req.user = verifyToken(token, config.jwt.secret);
	} catch {
		throw new AppError(401, 'Invalid or expired token');
	}
	next();
};

// Role-based access control: must run after `authenticate`
export const authorize =
	(...roles: Role[]): RequestHandler =>
	(req, _res, next) => {
		if (!req.user || !roles.includes(req.user.role)) {
			throw new AppError(403, 'You do not have permission to perform this action');
		}
		next();
	};
