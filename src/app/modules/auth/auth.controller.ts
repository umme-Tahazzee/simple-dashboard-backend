import type { CookieOptions, Request, Response } from 'express';
import config from '../../../config';
import { catchAsync } from '../../../utils/catchAsync';
import { AuthService } from './auth.service';

const cookieOptions: CookieOptions = {
	httpOnly: true,
	secure: config.isProduction,
	sameSite: config.isProduction ? 'none' : 'lax',
	maxAge: 24 * 60 * 60 * 1000,
};

const sendSession = (
	res: Response,
	status: number,
	message: string,
	session: { user: object; accessToken: string },
) => {
	res.cookie('accessToken', session.accessToken, cookieOptions);
	res.status(status).json({ success: true, message, data: session });
};

const signup = catchAsync(async (req, res) => {
	sendSession(res, 201, 'Account created', await AuthService.signup(req.body));
});

const login = catchAsync(async (req, res) => {
	sendSession(res, 200, 'Logged in successfully', await AuthService.login(req.body));
});

const logout = (_req: Request, res: Response) => {
	res.clearCookie('accessToken', { ...cookieOptions, maxAge: undefined });
	res.json({ success: true, message: 'Logged out' });
};

const me = catchAsync(async (req, res) => {
	res.json({ success: true, data: { user: await AuthService.me(req.user!.sub) } });
});

export const AuthController = { signup, login, logout, me };
