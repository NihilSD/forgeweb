import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../infra/prisma.service.js';

/**
 * Spec 3.5: users can export all their data. Each phase that adds user-owned tables registers a
 * section here. Secrets (password hashes, token hashes, TOTP secrets) are never included.
 */
@Injectable()
export class DataExportService {
  private readonly sections = new Map<string, (userId: string) => Promise<unknown>>();

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {
    this.register('sessions', (userId) =>
      this.prisma.client.session.findMany({
        where: { userId },
        select: {
          id: true,
          createdAt: true,
          lastSeenAt: true,
          expiresAt: true,
          revokedAt: true,
          userAgent: true,
        },
      }),
    );
    this.register('linkedAccounts', (userId) =>
      this.prisma.client.oAuthAccount.findMany({
        where: { userId },
        select: { provider: true, createdAt: true },
      }),
    );
    this.register('auditLog', (userId) =>
      this.prisma.client.auditLog.findMany({
        where: { actorId: userId },
        select: { action: true, target: true, at: true },
        orderBy: { at: 'desc' },
        take: 1000,
      }),
    );
  }

  register(name: string, loader: (userId: string) => Promise<unknown>) {
    this.sections.set(name, loader);
  }

  async build(userId: string) {
    const user = await this.prisma.client.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        emailVerifiedAt: true,
        displayName: true,
        handle: true,
        country: true,
        timeZone: true,
        birthYear: true,
        goal: true,
        languages: true,
        role: true,
        emailDigestOptIn: true,
        createdAt: true,
      },
    });
    const out: Record<string, unknown> = { exportedAt: new Date().toISOString(), account: user };
    for (const [name, loader] of this.sections) out[name] = await loader(userId);
    return out;
  }
}
