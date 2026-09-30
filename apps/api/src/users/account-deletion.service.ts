import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { ENV, type Env } from '../config/env.js';
import { AuditService } from '../audit/audit.service.js';
import { PrismaService } from '../infra/prisma.service.js';
import { DELETION_GRACE_DAYS } from './me.mapper.js';

/**
 * Spec 3.5: account deletion completes within 30 days. Requests wait out a grace period (so an
 * accidental deletion can be undone by signing in), then personal data is scrubbed. The row stays
 * as an anonymous tombstone so foreign keys and aggregate stats remain valid.
 */
@Injectable()
export class AccountDeletionService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger('AccountDeletion');
  private timer: NodeJS.Timeout | null = null;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  onApplicationBootstrap() {
    if (this.env.NODE_ENV === 'test') return;
    this.timer = setInterval(() => {
      this.purgeDue(new Date()).catch((err: Error) => this.logger.error(err.message));
    }, 3_600_000);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  /** Scrubs every account whose grace period ended before `now`. Returns how many. */
  async purgeDue(now: Date): Promise<number> {
    const cutoff = new Date(now.getTime() - DELETION_GRACE_DAYS * 86_400_000);
    const due = await this.prisma.client.user.findMany({
      where: { deletionRequestedAt: { lte: cutoff }, deletedAt: null },
      select: { id: true },
      take: 500,
    });
    for (const { id } of due) {
      await this.prisma.client.$transaction([
        this.prisma.client.session.deleteMany({ where: { userId: id } }),
        this.prisma.client.oAuthAccount.deleteMany({ where: { userId: id } }),
        this.prisma.client.totpSecret.deleteMany({ where: { userId: id } }),
        this.prisma.client.recoveryCode.deleteMany({ where: { userId: id } }),
        this.prisma.client.emailToken.deleteMany({ where: { userId: id } }),
        this.prisma.client.user.update({
          where: { id },
          data: {
            email: `deleted-${id}@deleted.invalid`,
            emailVerifiedAt: null,
            passwordHash: null,
            displayName: null,
            handle: null,
            avatarKey: null,
            country: null,
            birthYear: null,
            goal: null,
            languages: [],
            deletedAt: now,
          },
        }),
      ]);
      await this.audit.log({ actorId: null, action: 'user.purged', target: id });
    }
    return due.length;
  }
}
