import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { env } from '../config/env';
import { Role } from '@prisma/client';

export interface AccessTokenPayload {
  sub: string; // user id
  role: Role;
  email: string;
}

export function signAccessToken(payload: AccessTokenPayload): string {
  const options: jwt.SignOptions = { expiresIn: env.jwt.accessExpiresIn as jwt.SignOptions['expiresIn'] };
  return jwt.sign(payload, env.jwt.accessSecret, options);
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, env.jwt.accessSecret) as AccessTokenPayload;
}

export interface RefreshTokenPayload {
  sub: string;
  jti: string; // token id, used to look up the stored hash for revocation
}

export function signRefreshToken(payload: RefreshTokenPayload): string {
  const options: jwt.SignOptions = { expiresIn: env.jwt.refreshExpiresIn as jwt.SignOptions['expiresIn'] };
  return jwt.sign(payload, env.jwt.refreshSecret, options);
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  return jwt.verify(token, env.jwt.refreshSecret) as RefreshTokenPayload;
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function refreshExpiryDate(): Date {
  // Mirrors JWT_REFRESH_EXPIRES_IN; kept simple (days) for the DB record.
  const days = env.jwt.refreshExpiresIn.endsWith('d')
    ? parseInt(env.jwt.refreshExpiresIn)
    : 7;
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}
