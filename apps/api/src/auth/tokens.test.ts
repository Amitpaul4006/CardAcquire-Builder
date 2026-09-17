import jwt from 'jsonwebtoken';
import { createTokenPair, verifyAccessToken, verifyRefreshToken } from './tokens.js';

describe('token validation', () => {
  const user = { userId: 'user-123', role: 'APPLICANT' as const };

  beforeAll(() => {
    process.env.JWT_ACCESS_SECRET = 'test-access-secret';
    process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
  });

  it('creates verifiable access and refresh tokens', () => {
    const tokens = createTokenPair(user);
    expect(verifyAccessToken(tokens.accessToken)).toEqual(user);
    expect(verifyRefreshToken(tokens.refreshToken)).toEqual(user);
  });

  it('rejects a refresh token presented as an access token', () => {
    const tokens = createTokenPair(user);
    expect(() => verifyAccessToken(tokens.refreshToken)).toThrow();
  });

  it('rejects an expired access token', () => {
    const token = jwt.sign({ ...user, type: 'access' }, process.env.JWT_ACCESS_SECRET as string, {
      expiresIn: -1,
    });
    expect(() => verifyAccessToken(token)).toThrow();
  });
});