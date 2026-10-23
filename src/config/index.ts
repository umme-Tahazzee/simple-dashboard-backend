import 'dotenv/config';

const required = (key: string): string => {
	const value = process.env[key];
	if (!value) throw new Error(`Missing required environment variable: ${key}`);
	return value;
};

const isProduction = process.env.NODE_ENV === 'production';

const jwtSecret = required('JWT_SECRET');
if (isProduction && jwtSecret.length < 32) {
	throw new Error('JWT_SECRET must be at least 32 characters in production');
}

const config = {
	env: process.env.NODE_ENV ?? 'development',
	isProduction,
	port: Number(process.env.PORT) || 5000,
	frontendUrl: process.env.FRONTEND_URL ?? 'http://localhost:3000',
	bcryptSaltRounds: Number(process.env.BCRYPT_SALT_ROUNDS) || 10,
	// Set to the number of reverse proxies in front of the API (e.g. 1 on Render/Heroku/nginx)
	// so rate limiting sees the real client IP instead of the proxy's.
	trustProxy: Number(process.env.TRUST_PROXY) || 0,

	jwt: {
		secret: jwtSecret,
		expiresIn: process.env.JWT_EXPIRES_IN || '1d',
	},

	// Mentor account created by the seed script if it does not exist yet
	admin: {
		name: process.env.ADMIN_NAME,
		email: process.env.ADMIN_EMAIL,
		password: process.env.ADMIN_PASSWORD,
	},
};

export default config;
