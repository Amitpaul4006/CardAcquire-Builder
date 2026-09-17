import jwt from 'jsonwebtoken';
import type { UserRole } from '@prisma/client';
import type { AuthenticatedUser, TokenPair } from './types.js';

type TokenPayload = AuthenticatedUser & { type: 'access' | 'refresh' };

function getAccessTokenSecret(): string {
  const secret = process.env.JWT_ACCESS_SECRET;
  if (!secret) {
    throw new Error('JWT_ACCESS_SECRET is not configured');
  }
  return secret;
}

function getRefreshTokenSecret(): string {
  const secret = process.env.JWT_REFRESH_SECRET;
  if (!secret) {
    throw new Error('JWT_REFRESH_SECRET is not configured');
  }
  return secret;
}

/**
 * Creates short-lived access and longer-lived refresh tokens for an authenticated user.
 * The access token authorizes API requests; the refresh token supports session renewal
 * without repeatedly collecting credentials during an acquisition journey.
 */
export function createTokenPair(user: AuthenticatedUser): TokenPair {
  return {
    accessToken: jwt.sign({ ...user, type: 'access' }, getAccessTokenSecret(), { expiresIn: '15m' }),
    refreshToken: jwt.sign({ ...user, type: 'refresh' }, getRefreshTokenSecret(), { expiresIn: '7d' }),
  };
}

/**
 * Verifies an access token and returns its identity and role claims.
 * Invalid, expired, or wrongly typed tokens are rejected so applicants cannot
 * access another user's application and admins cannot be impersonated.
 */
export function verifyAccessToken(token: string): AuthenticatedUser {
  const payload = jwt.verify(token, getAccessTokenSecret()) as TokenPayload;
  if (payload.type !== 'access' || !payload.userId || !payload.role) {
    throw new Error('Invalid access token');
  }
  return { userId: payload.userId, role: payload.role };
}

/**
 * Verifies a refresh token before a future token-rotation endpoint uses it.
 * Keeping refresh verification separate prevents accidentally accepting a refresh
 * token as an API access credential.
 */
export function verifyRefreshToken(token: string): AuthenticatedUser {
  const payload = jwt.verify(token, getRefreshTokenSecret()) as TokenPayload;
  if (payload.type !== 'refresh' || !payload.userId || !payload.role) {
    throw new Error('Invalid refresh token');
  }
  return { userId: payload.userId, role: payload.role };
}