import { Request, Response, NextFunction } from 'express';
import { Role } from '@prisma/client';
import { verifyAccessToken } from '../utils/jwt';
import { ApiError } from '../utils/ApiError';

export interface AuthUser {
  id: string;
  role: Role;
  email: string;
}

// Augment Express's Request type with the authenticated user.
declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

/**
 * Verifies the Bearer access token on every protected route. This is the
 * server-side enforcement point — the frontend hides UI for roles, but every
 * data-returning endpoint re-checks here and again in requireRole/ownership
 * checks in the controller layer. A modified/forged token fails signature
 * verification; a token for a real but under-privileged role is rejected by
 * requireRole below, regardless of what the client believes it can see.
 */
export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    throw ApiError.unauthorized('Missing access token');
  }
  const token = header.slice('Bearer '.length);
  try {
    const payload = verifyAccessToken(token);
    req.user = { id: payload.sub, role: payload.role, email: payload.email };
    next();
  } catch {
    throw ApiError.unauthorized('Invalid or expired access token');
  }
}

/** Restrict a route to a set of roles. Always used server-side, never trusted client-side. */
export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) throw ApiError.unauthorized();
    if (!roles.includes(req.user.role)) {
      throw ApiError.forbidden('You do not have permission to perform this action');
    }
    next();
  };
}
