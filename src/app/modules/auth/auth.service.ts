import bcrypt from 'bcryptjs';
import type { User } from '../../../../generated/prisma/client';
import config from '../../../config';
import { prisma } from '../../../lib/prisma';
import { AppError } from '../../../utils/AppError';
import { signToken } from '../../../utils/jwt';
import type { LoginInput, SignupInput } from './auth.validation';

// Compared against when the email is unknown, so both failure paths take the same time
const DUMMY_HASH = bcrypt.hashSync('dummy-password', config.bcryptSaltRounds);

const publicUser = (user: User) => ({ id: user.id, name: user.name, email: user.email, role: user.role });

const issueSession = (user: User) => ({
	user: publicUser(user),
	accessToken: signToken({ sub: user.id, role: user.role }, config.jwt.secret, config.jwt.expiresIn),
});

const signup = async ({ name, email, password }: SignupInput) => {
	const exists = await prisma.user.findUnique({ where: { email } });
	if (exists) throw new AppError(409, 'An account with this email already exists');

	// Public signup always creates a STUDENT; mentors/admins are seeded
	const user = await prisma.user.create({
		data: 
		   { 
			name, email, 
			passwordHash: await bcrypt.hash(password, config.bcryptSaltRounds), 
			role: 'STUDENT' 
		},
	});
	return issueSession(user);
};

const login = async ({ email, password }: LoginInput) => {
	const user = await prisma.user.findUnique({ where: { email } });
	const passwordMatches = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
	if (!user || !passwordMatches) throw new AppError(401, 'Invalid email or password');
	return issueSession(user);
};

const me = async (userId: string) => {
	const user = await prisma.user.findUnique({ where: { id: userId } });
	if (!user) throw new AppError(401, 'Account no longer exists');
	return publicUser(user);
};

export const AuthService = { signup, login, me };
