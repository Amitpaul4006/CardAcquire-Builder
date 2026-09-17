import bcrypt from 'bcryptjs';

/**
 * Hashes a password before it is persisted.
 * A one-way hash limits the impact of a database leak and avoids storing reusable
 * applicant credentials in a system that protects a sensitive acquisition flow.
 */
export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

/**
 * Compares a login password with its stored hash.
 * The result is boolean so callers can return the same generic failure for unknown
 * emails and wrong passwords, reducing account-enumeration signals.
 */
export function verifyPassword(password: string, passwordHash: string): Promise<boolean> {
  return bcrypt.compare(password, passwordHash);
}