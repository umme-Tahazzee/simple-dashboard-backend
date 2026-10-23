import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import config from '../../config';
import { AppError } from '../../utils/AppError';

export const globalErrorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
	if (err instanceof ZodError) {
		res.status(400).json({
			success: false,
			message: 'Validation failed',
			errors: err.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
		});
		return;
	}

	if (err instanceof AppError) {
		res.status(err.statusCode).json({ success: false, message: err.message });
		return;
	}

	// Client errors raised by Express middleware (malformed JSON, payload too large, ...)
	const status = (err as { status?: number }).status;
	if (typeof status === 'number' && status >= 400 && status < 500) {
		const message = (err as { type?: string }).type === 'entity.parse.failed' ? 'Malformed JSON body' : 'Bad request';
		res.status(status).json({ success: false, message });
		return;
	}

	console.error(err);
	res.status(500).json({
		success: false,
		message: 'Internal server error',
		...(config.isProduction ? {} : { error: err instanceof Error ? err.message : err }),
	});
};
