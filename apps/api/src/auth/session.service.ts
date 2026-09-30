import { Inject, Injectable } from '@nestjs/common';
import type { Session, User } from '@forge/db';
import type { Response } from 'express';
import { hashIp, randomToken, sha256 } from '../common/crypto.js';
import { ENV, type Env } from '../config/env.js';
import { PrismaService } from '../infra/prisma.service.js';

export const SESSION_COOKIE = 'forge_session';
const SESSION_DAYS = 30;
const PENDING_2FA_MINUTES = 10;
const TOUCH_INTERVAL_MS = 5 * 60_000;

/**
 * Server-side sessions (spec 3.1). The cookie holds a random token; the database stores only its
 * sha256, so a database leak does not leak usable sessions.
 */
@Injectable()
export class SessionService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async create(
    user: Pick<User, 'id'>,
    meta: { userAgent?: string | undefined; ip?: string | undefined; twoFactorVerified: boolean },
  ): Promise<{ token: string; session: Session }> {
    const token = randomToken(32);
    const ttl = meta.twoFactorVerified ? SESSION_DAYS * 86_400_000 : PENDING_2FA_MINUTES * 60_000;
    const session = await this.prisma.client.session.create({
      data: {
        userId: user.id,
        tokenHash: sha256(token),
        expiresAt: new Date(Date.now() + ttl),
        userAgent: meta.userAgent?.slice(0, 300) ?? null,
        ipHash: hashIp(this.env.APP_SECRET, meta.ip),
        twoFactorVerified: meta.twoFactorVerified,
      },
    });
    return { token, session };
  }

  /** Resolves a cookie token to a live session and its (not deleted) user. */
  async resolve(token: string | undefined): Promise<{ session: Session; user: User } | null> {
    if (!token || token.length > 100) return null;
    const session = await this.prisma.client.session.findUnique({
      where: { tokenHash: sha256(token) },
      include: { user: true },
    });
    if (!session || session.revokedAt || session.expiresAt < new Date() || session.user.deletedAt)
      return null;
    if (Date.now() - session.lastSeenAt.getTime() > TOUCH_INTERVAL_MS) {
      await this.prisma.client.session.update({
        where: { id: session.id },
        data: { lastSeenAt: new Date() },
      });
    }
    const { user, ...rest } = session;
    return { session: rest, user };
  }

  async revoke(sessionId: string) {
    await this.prisma.client.session.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async revokeAllForUser(userId: string, exceptSessionId?: string) {
    await this.prisma.client.session.updateMany({
      where: {
        userId,
        revokedAt: null,
        ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}),
      },
      data: { revokedAt: new Date() },
    });
  }

  /** Replaces the current session with a fresh one (login, 2FA, privilege change). */
  async rotate(
    current: Session,
    res: Response,
    meta: { userAgent?: string | undefined; ip?: string | undefined },
    twoFactorVerified = current.twoFactorVerified,
  ) {
    await this.revoke(current.id);
    const next = await this.create({ id: current.userId }, { ...meta, twoFactorVerified });
    this.setCookie(res, next.token, next.session.expiresAt);
    return next;
  }

  setCookie(res: Response, token: string, expires: Date) {
    res.cookie(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: this.env.COOKIE_SECURE,
      sameSite: 'lax',
      path: '/',
      expires,
    });
  }

  clearCookie(res: Response) {
    res.clearCookie(SESSION_COOKIE, {
      httpOnly: true,
      secure: this.env.COOKIE_SECURE,
      sameSite: 'lax',
      path: '/',
    });
  }
}
