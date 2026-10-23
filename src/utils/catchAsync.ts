import type { Request, RequestHandler, Response } from 'express';

export const catchAsync =
	(fn: (req: Request, res: Response) => Promise<void>): RequestHandler =>
	(req, res, next) => {
		fn(req, res).catch(next);
	};
