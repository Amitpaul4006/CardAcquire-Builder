import { UserRole } from '@prisma/client';
import { z } from 'zod';
import type { PrismaClient } from '@prisma/client';
import { hashPassword, verifyPassword } from './passwords.js';
import { createTokenPair } from './tokens.js';

export const credentialsSchema = z.object({
  email: z.string().email().max(320).transform((email) => email.toLowerCase()),
  password: z.string().min(8).max(128),
});

/**
 * Registers an applicant and returns an access/refresh token pair.
 * The database unique constraint on email makes duplicate identities explicit,
 * which prevents ambiguous ownership of applications in the acquisition funnel.
 */
export async function registerApplicant(
  prisma: PrismaClient,
  input: unknown,
) {
  const credentials = credentialsSchema.parse(input);
  const passwordHash = await hashPassword(credentials.password);
  const user = await prisma.user.create({
    data: { email: credentials.email, passwordHash, role: UserRole.APPLICANT },
  });
  const tokens = createTokenPair({ userId: user.id, role: user.role });
  return { user: { id: user.id, email: user.email, role: user.role }, tokens };
}

/**
 * Authenticates an existing user and returns tokens without revealing whether
 * an email exists. A generic failure response helps limit account enumeration.
 */
export async function loginUser(prisma: PrismaClient, input: unknown) {
  const credentials = credentialsSchema.parse(input);
  const user = await prisma.user.findUnique({ where: { email: credentials.email } });
  const valid = user ? await verifyPassword(credentials.password, user.passwordHash) : false;
  if (!user || !valid) {
    throw new Error('Invalid email or password');
  }
  const tokens = createTokenPair({ userId: user.id, role: user.role });
  return { user: { id: user.id, email: user.email, role: user.role }, tokens };
}