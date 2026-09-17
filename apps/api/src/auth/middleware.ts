import type { NextFunction, Request, Response } from 'express';
import type { UserRole } from '@prisma/client';
import { verifyAccessToken } from './tokens.js';
import type { AuthenticatedUser } from './types.js';

declare global {
  namespace Express {
    interface Request {
      auth?: AuthenticatedUser;
    }
  }
}

/**
 * Authenticates a Bearer access token and attaches its identity to the request.
 * Protected application and administration routes use this boundary so ownership
 * and role checks are consistent instead of being reimplemented per controller.
 */
export function requireAuth(request: Request, response: Response, next: NextFunction): void {
  const header = request.header('authorization');
  const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
  if (!token) {
    response.status(401).json({ error: 'Authentication required' });
    return;
  }

  try {
    request.auth = verifyAccessToken(token);
    next();
  } catch {
    response.status(401).json({ error: 'Invalid or expired access token' });
  }
}

/**
 * Restricts a route to one or more roles from the verified token.
 * This prevents applicants from reaching admin analytics and keeps authorization
 * decisions close to the route boundary where they are easy to audit.
 */
export function requireRole(...roles: UserRole[]) {
  return (request: Request, response: Response, next: NextFunction): void => {
    if (!request.auth || !roles.includes(request.auth.role)) {
      response.status(403).json({ error: 'Insufficient permissions' });
      return;
    }
    next();
  };
}