import jwt, { type SignOptions } from 'jsonwebtoken';
import type { Role } from '../../generated/prisma/client';

export type AuthPayload = { sub: string; role: Role };

export const signToken = (payload: AuthPayload, secret: string, expiresIn: string) =>
	jwt.sign(payload, secret, { expiresIn: expiresIn as SignOptions['expiresIn'] });

export const verifyToken = (token: string, secret: string) => jwt.verify(token, secret) as AuthPayload;
