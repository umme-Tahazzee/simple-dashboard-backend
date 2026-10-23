import { z } from 'zod';

const email = z.string().trim().toLowerCase().email('Invalid email address');

export const loginSchema = z.object({
	email,
	password: z.string().min(1, 'Password is required'),
});

export const signupSchema = z.object({
	name: z.string().trim().min(2, 'Name must be at least 2 characters').max(60, 'Name is too long'),
	email,
	password: z
		.string()
		.min(8, 'Password must be at least 8 characters')
		.max(72, 'Password must be at most 72 characters')
		.regex(/[A-Za-z]/, 'Password must contain a letter')
		.regex(/\d/, 'Password must contain a number'),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type SignupInput = z.infer<typeof signupSchema>;
