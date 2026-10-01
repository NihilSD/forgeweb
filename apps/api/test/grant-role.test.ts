/** Spec L13: the owner bootstraps the first admin from the server, never through the web UI. */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { grantRole } from '../src/admin/grant-role.js';
import { createTestContext, createUser, type TestContext } from './helpers.js';

let ctx: TestContext;
beforeAll(async () => {
  ctx = await createTestContext();
});
afterAll(async () => {
  await ctx.close();
});
beforeEach(async () => {
  await ctx.reset();
});

describe('grantRole (CLI)', () => {
  it('changes the role, signs the user out everywhere and writes an audit entry', async () => {
    const { user } = await createUser(ctx);
    expect(await ctx.prisma.session.count({ where: { userId: user.id } })).toBeGreaterThan(0);

    const result = await grantRole(ctx.prisma, user.email.toUpperCase(), 'superadmin');
    expect(result).toEqual({ id: user.id, from: 'user', to: 'superadmin' });
    expect((await ctx.prisma.user.findUniqueOrThrow({ where: { id: user.id } })).role).toBe(
      'superadmin',
    );
    expect(await ctx.prisma.session.count({ where: { userId: user.id } })).toBe(0);
    const audit = await ctx.prisma.auditLog.findFirstOrThrow({
      where: { target: user.id, action: 'user.role_changed' },
    });
    expect(audit).toMatchObject({ actorId: null, action: 'user.role_changed' });
    expect(audit.meta).toMatchObject({ from: 'user', to: 'superadmin', via: 'cli' });
    // The audit entry never holds the email.
    expect(JSON.stringify(audit)).not.toContain(user.email);
  });

  it('rejects unknown roles, unknown users and deleted accounts', async () => {
    const { user } = await createUser(ctx);
    await expect(grantRole(ctx.prisma, user.email, 'root' as never)).rejects.toThrow(/role/i);
    await expect(grantRole(ctx.prisma, 'nobody@example.com', 'moderator')).rejects.toThrow(
      /not found/i,
    );
    await ctx.prisma.user.update({ where: { id: user.id }, data: { deletedAt: new Date() } });
    await expect(grantRole(ctx.prisma, user.email, 'moderator')).rejects.toThrow(/not found/i);
  });
});
