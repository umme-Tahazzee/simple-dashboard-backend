import type { RequestHandler } from 'express';
import type { ZodTypeAny } from 'zod';

type Source = 'body' | 'query';

// req.query is read-only in Express 5, so parsed query params are exposed on res.locals.query
export const validateRequest =
	(schema: ZodTypeAny, source: Source = 'body'): RequestHandler =>
	(req, res, next) => {
		const parsed = schema.parse(req[source]);
		if (source === 'body') req.body = parsed;
		else res.locals.query = parsed;
		next();
	};
