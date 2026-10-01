import type { PrismaClient } from '@forge/db';
import { USER_ROLES, type UserRole } from '@forge/shared';
import { z } from 'zod';

const inputSchema = z.object({ email: z.email(), role: z.enum(USER_ROLES) });

/**
 * Changes a user's role from the server (`pnpm --filter @forge/api admin:grant-role`). This is how
 * the owner bootstraps the first superadmin; after that, roles change in the admin panel. Like the
 * admin route, it signs the user out everywhere and writes an audit entry (actor: none, via cli).
 */
export async function grantRole(prisma: PrismaClient, email: string, role: UserRole) {
  const parsed = inputSchema.safeParse({ email: email.trim(), role });
  if (!parsed.success)
    throw new Error(
      `Invalid ${String(parsed.error.issues[0]?.path[0] ?? 'input')} (role or email).`,
    );
  const user = await prisma.user.findFirst({
    where: { email: { equals: parsed.data.email, mode: 'insensitive' }, deletedAt: null },
    select: { id: true, role: true },
  });
  if (!user) throw new Error('User not found (or the account is deleted).');
  await prisma.$transaction([
    prisma.user.update({ where: { id: user.id }, data: { role: parsed.data.role } }),
    prisma.session.deleteMany({ where: { userId: user.id } }),
    prisma.auditLog.create({
      data: {
        actorId: null,
        action: 'user.role_changed',
        target: user.id,
        meta: { from: user.role, to: parsed.data.role, via: 'cli' },
      },
    }),
  ]);
  return { id: user.id, from: user.role, to: parsed.data.role };
}
