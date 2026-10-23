import bcrypt from 'bcryptjs';
import config from '../config';
import { prisma } from '../lib/prisma';

export const seedAdmin = async () => {
	const { name, email, password } = config.admin;
	if (!name || !email || !password) {
		console.warn('ADMIN_NAME / ADMIN_EMAIL / ADMIN_PASSWORD not set, skipping admin seed.');
		return;
	}

	const normalizedEmail = email.trim().toLowerCase();
	const exists = await prisma.user.findUnique({ where: { email: normalizedEmail } });
	if (exists) {
		console.log(`Admin already exists: ${normalizedEmail}`);
		return;
	}

	await prisma.user.create({
		data: {
			name,
			email: normalizedEmail,
			passwordHash: await bcrypt.hash(password, config.bcryptSaltRounds),
			role: 'ADMIN',
		},
	});
	console.log(`Seeded admin account: ${normalizedEmail}`);
};
