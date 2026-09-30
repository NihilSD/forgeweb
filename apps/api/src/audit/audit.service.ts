import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '@forge/db';
import { hashIp } from '../common/crypto.js';
import { ENV, type Env } from '../config/env.js';
import { PrismaService } from '../infra/prisma.service.js';

/** Audit log for sensitive actions (spec 3.3). Never pass secrets, tokens or full emails in meta. */
@Injectable()
export class AuditService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async log(entry: {
    actorId: string | null;
    action: string;
    target?: string | null;
    ip?: string | undefined;
    meta?: Prisma.InputJsonValue;
  }) {
    await this.prisma.client.auditLog.create({
      data: {
        actorId: entry.actorId,
        action: entry.action,
        target: entry.target ?? null,
        ipHash: hashIp(this.env.APP_SECRET, entry.ip),
        ...(entry.meta !== undefined ? { meta: entry.meta } : {}),
      },
    });
  }
}
