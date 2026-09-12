import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { z } from 'zod';
import { prisma } from '../config/prisma';
import { ApiError } from '../utils/ApiError';
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  hashToken,
  refreshExpiryDate,
} from '../utils/jwt';
import { env } from '../config/env';

const REFRESH_COOKIE = 'refreshToken';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

function setRefreshCookie(res: Response, token: string) {
  // HttpOnly + Secure(in prod) + SameSite=Lax: JS on the page can never read
  // this cookie, which is why the refresh token lives here and not in
  // localStorage (localStorage is readable by any injected/XSS script).
  res.cookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    secure: env.nodeEnv === 'production',
    sameSite: 'lax',
    path: '/api/auth',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

function publicUser(user: { id: string; name: string; email: string; role: string }) {
  return { id: user.id, name: user.name, email: user.email, role: user.role };
}

export async function login(req: Request, res: Response) {
  const { email, password } = loginSchema.parse(req.body);

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw ApiError.unauthorized('Invalid email or password', 'INVALID_CREDENTIALS');

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) throw ApiError.unauthorized('Invalid email or password', 'INVALID_CREDENTIALS');

  const accessToken = signAccessToken({ sub: user.id, role: user.role, email: user.email });

  const jti = crypto.randomUUID();
  const refreshToken = signRefreshToken({ sub: user.id, jti });
  await prisma.refreshToken.create({
    data: {
      id: jti,
      tokenHash: hashToken(refreshToken),
      userId: user.id,
      expiresAt: refreshExpiryDate(),
    },
  });

  setRefreshCookie(res, refreshToken);
  res.json({ accessToken, user: publicUser(user) });
}

export async function refresh(req: Request, res: Response) {
  const token = req.cookies?.[REFRESH_COOKIE];
  if (!token) throw ApiError.unauthorized('Missing refresh token');

  let payload;
  try {
    payload = verifyRefreshToken(token);
  } catch {
    throw ApiError.unauthorized('Invalid or expired refresh token');
  }

  const stored = await prisma.refreshToken.findUnique({ where: { id: payload.jti } });
  if (!stored || stored.revokedAt || stored.tokenHash !== hashToken(token)) {
    throw ApiError.unauthorized('Refresh token has been revoked');
  }
  if (stored.expiresAt < new Date()) {
    throw ApiError.unauthorized('Refresh token expired');
  }

  const user = await prisma.user.findUnique({ where: { id: payload.sub } });
  if (!user) throw ApiError.unauthorized('User no longer exists');

  // Rotate: revoke the old token, issue a new one. Prevents replay of a
  // stolen refresh token once the legitimate client rotates past it.
  await prisma.refreshToken.update({
    where: { id: stored.id },
    data: { revokedAt: new Date() },
  });

  const newJti = crypto.randomUUID();
  const newRefreshToken = signRefreshToken({ sub: user.id, jti: newJti });
  await prisma.refreshToken.create({
    data: {
      id: newJti,
      tokenHash: hashToken(newRefreshToken),
      userId: user.id,
      expiresAt: refreshExpiryDate(),
    },
  });
  setRefreshCookie(res, newRefreshToken);

  const accessToken = signAccessToken({ sub: user.id, role: user.role, email: user.email });
  res.json({ accessToken, user: publicUser(user) });
}

export async function logout(req: Request, res: Response) {
  const token = req.cookies?.[REFRESH_COOKIE];
  if (token) {
    try {
      const payload = verifyRefreshToken(token);
      await prisma.refreshToken.updateMany({
        where: { id: payload.jti },
        data: { revokedAt: new Date() },
      });
    } catch {
      // token already invalid/expired — nothing to revoke
    }
  }
  res.clearCookie(REFRESH_COOKIE, { path: '/api/auth' });
  res.json({ success: true });
}

export async function me(req: Request, res: Response) {
  const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
  if (!user) throw ApiError.notFound('User not found');
  res.json({ user: publicUser(user) });
}
