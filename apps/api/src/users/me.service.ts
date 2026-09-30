import { Inject, Injectable } from '@nestjs/common';
import type { User } from '@forge/db';
import type { Me, Plan } from '@forge/shared';
import { PrismaService } from '../infra/prisma.service.js';
import { toMe } from './me.mapper.js';

/** Builds the `Me` view. Plan resolution is overridable so billing can plug in (phase L10). */
@Injectable()
export class MeService {
  planResolver: (userId: string) => Promise<Plan> = async () => 'free';

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async build(user: User): Promise<Me> {
    const [totp, plan] = await Promise.all([
      this.prisma.client.totpSecret.findUnique({
        where: { userId: user.id },
        select: { enabledAt: true },
      }),
      this.planResolver(user.id),
    ]);
    return toMe(user, { twoFactorEnabled: Boolean(totp?.enabledAt), plan });
  }
}
