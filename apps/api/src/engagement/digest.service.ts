import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { hmac, safeEqual } from '../common/crypto.js';
import { localDay, localWeekStart } from '../common/time.js';
import { ENV, type Env } from '../config/env.js';
import { EmailService } from '../email/email.service.js';
import { emails } from '../email/templates.js';
import { PrismaService } from '../infra/prisma.service.js';
import { EngagementService } from './engagement.service.js';

/** Sent on Monday from this local hour on. */
const SEND_HOUR = 9;

function localWeekdayHour(at: Date, timeZone: string): { weekday: string; hour: number } {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      weekday: 'short',
      hour: 'numeric',
      hourCycle: 'h23',
    }).formatToParts(at);
    return {
      weekday: parts.find((p) => p.type === 'weekday')!.value,
      hour: Number(parts.find((p) => p.type === 'hour')!.value),
    };
  } catch {
    return { weekday: at.toUTCString().slice(0, 3), hour: at.getUTCHours() };
  }
}

/**
 * Spec L9 step 4: an opt-in weekly progress email. No dark patterns: it is only sent to users who
 * opted in, only when they did something that week (no "you're falling behind" mail), and every
 * message has one-click unsubscribe (RFC 8058) plus a link to settings.
 */
@Injectable()
export class DigestService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger('Digest');
  private timer: NodeJS.Timeout | null = null;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(EmailService) private readonly email: EmailService,
    @Inject(EngagementService) private readonly engagement: EngagementService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  onApplicationBootstrap() {
    if (this.env.NODE_ENV === 'test') return;
    this.timer = setInterval(() => {
      this.sendDue(new Date()).catch((err: Error) => this.logger.error(err.message));
    }, 15 * 60_000);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  unsubscribeToken(userId: string): string {
    return `${userId}.${hmac(this.env.APP_SECRET, `digest-unsubscribe:${userId}`)}`;
  }

  /** One-click unsubscribe. Returns false for a forged token. */
  async unsubscribe(token: string): Promise<boolean> {
    const [userId, sig] = token.split('.');
    if (!userId || !sig) return false;
    if (!safeEqual(sig, hmac(this.env.APP_SECRET, `digest-unsubscribe:${userId}`))) return false;
    await this.prisma.client.user.updateMany({
      where: { id: userId },
      data: { emailDigestOptIn: false },
    });
    return true;
  }

  /** Sends this week's email to every opted-in user whose local Monday 09:00 has passed. */
  async sendDue(now: Date): Promise<number> {
    const db = this.prisma.client;
    const users = await db.user.findMany({
      where: {
        emailDigestOptIn: true,
        emailVerifiedAt: { not: null },
        deletedAt: null,
        deletionRequestedAt: null,
      },
    });
    let sent = 0;
    for (const user of users) {
      const { weekday, hour } = localWeekdayHour(now, user.timeZone);
      if (weekday !== 'Mon' || hour < SEND_HOUR) continue;
      const week = localWeekStart(now, user.timeZone);
      if (user.digestSentWeek === week) continue;
      // Claim the week first, so two instances never send the same email twice.
      const claimed = await db.user.updateMany({
        where: { id: user.id, OR: [{ digestSentWeek: null }, { digestSentWeek: { not: week } }] },
        data: { digestSentWeek: week },
      });
      if (claimed.count !== 1) continue;
      const since = new Date(now.getTime() - 7 * 86_400_000);
      const events = await db.xpEvent.findMany({ where: { userId: user.id, at: { gte: since } } });
      if (events.length === 0) continue; // nothing happened: no nagging email
      const progress = await this.engagement.progress(user, now);
      const token = this.unsubscribeToken(user.id);
      await this.email.send(
        emails.weeklyDigest(user.email, {
          name: user.displayName ?? user.handle ?? 'there',
          weekOf: localDay(since, user.timeZone),
          xp: events.reduce((s, e) => s + e.amount, 0),
          solved: events.filter((e) => e.reason === 'solve').length,
          lessons: events.filter((e) => e.reason === 'lesson').length,
          dailies: events.filter((e) => e.reason === 'daily').length,
          level: progress.level,
          streak: progress.streak.current,
          dashboardUrl: `${this.env.WEB_ORIGIN}/dashboard`,
          settingsUrl: `${this.env.WEB_ORIGIN}/settings`,
          unsubscribeUrl: `${this.env.WEB_ORIGIN}/unsubscribe?token=${token}`,
          oneClickUrl: `${this.env.API_PUBLIC_URL}/api/v1/email/unsubscribe?token=${token}`,
        }),
      );
      sent++;
    }
    return sent;
  }
}
