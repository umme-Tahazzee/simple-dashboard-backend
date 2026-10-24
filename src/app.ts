import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';

import { globalErrorHandler } from './app/middlewares/globalErrorHandler';
import { AuthRoutes } from './app/modules/auth/auth.routes';
import { SubmissionRoutes } from './app/modules/submission/submission.routes';
import { prisma } from './lib/prisma';
import config from './config/index.js';

const app = express();

app.set('trust proxy', config.trustProxy);
app.disable('x-powered-by');

app.use(helmet());
app.use(cors({ origin: config.frontendUrl, credentials: true }));
app.use(express.json({ limit: '50kb' }));
app.use(cookieParser());

app.get('/', (_req, res) => {
	res.json({ success: true, message: 'Server is running' });
});

// Liveness + DB readiness for load balancers / uptime checks
app.get('/health', async (_req, res) => {
	try {
		await prisma.$queryRaw`SELECT 1`;
		res.json({ success: true, status: 'ok' });
	} catch {
		res.status(503).json({ success: false, status: 'database unavailable' });
	}
});

app.use('/api/v1/auth', AuthRoutes);
app.use('/api/v1/submissions', SubmissionRoutes);

app.use((req, res) => {
	res.status(404).json({ success: false, message: `Route not found: ${req.method} ${req.originalUrl}` });
});

app.use(globalErrorHandler);

export default app;
