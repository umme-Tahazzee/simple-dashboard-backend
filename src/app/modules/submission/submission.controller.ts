import { catchAsync } from '../../../utils/catchAsync';
import { SubmissionService } from './submission.service';

const create = catchAsync(async (req, res) => {
	const data = await SubmissionService.create(req.user!.sub, req.body);
	res.status(201).json({ success: true, message: 'Project submitted for review', data });
});

const listMine = catchAsync(async (req, res) => {
	res.json({ success: true, data: await SubmissionService.listMine(req.user!.sub) });
});

const list = catchAsync(async (_req, res) => {
	const { items, meta } = await SubmissionService.list(res.locals.query);
	res.json({ success: true, data: items, meta });
});

const stats = catchAsync(async (_req, res) => {
	res.json({ success: true, data: await SubmissionService.stats() });
});

const review = catchAsync(async (req, res) => {
	const data = await SubmissionService.review(String(req.params.id), req.user!.sub, req.body);
	res.json({ success: true, message: `Project ${data.status.toLowerCase()}`, data });
});

export const SubmissionController = { create, listMine, list, stats, review };
