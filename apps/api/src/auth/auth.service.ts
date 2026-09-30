import { Inject, Injectable } from '@nestjs/common';
import { type EmailTokenKind, Prisma, type Session, type User } from '@forge/db';
import { type AuthResult, ErrorCode } from '@forge/shared';
import type { Response } from 'express';
import { ApiError } from '../common/api-error.js';
import { decrypt, encrypt, randomToken, sha256 } from '../common/crypto.js';
import { ENV, type Env } from '../config/env.js';
import { AuditService } from '../audit/audit.service.js';
import { EmailService } from '../email/email.service.js';
import { emails } from '../email/templates.js';
import { PrismaService } from '../infra/prisma.service.js';
import { RateLimitService } from '../rate-limit/rate-limit.service.js';
import { MeService } from '../users/me.service.js';
import { PasswordService } from './password.service.js';
import { SessionService } from './session.service.js';
import { generateTotpSecret, otpauthUrl, verifyTotp } from './totp.js';

export interface ClientMeta {
  ip?: string | undefined;
  userAgent?: string | undefined;
}

const LOCK_THRESHOLD = 5;
const MAX_LOCK_MINUTES = 60;
const TOKEN_TTL: Record<EmailTokenKind, number> = {
  verify_email: 24 * 3_600_000,
  reset_password: 3_600_000,
};
const RECOVERY_CODE_COUNT = 10;

@Injectable()
export class AuthService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PasswordService) private readonly passwords: PasswordService,
    @Inject(SessionService) private readonly sessions: SessionService,
    @Inject(EmailService) private readonly email: EmailService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(RateLimitService) private readonly limits: RateLimitService,
    @Inject(MeService) private readonly me: MeService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  // ------------------------------------------------------------------ sign-up / login

  async signup(
    input: { email: string; password: string },
    meta: ClientMeta,
    res: Response,
  ): Promise<AuthResult> {
    await this.passwords.assertStrong(input.password, { email: input.email });
    const passwordHash = await this.passwords.hash(input.password);
    let user: User;
    try {
      user = await this.prisma.client.user.create({ data: { email: input.email, passwordHash } });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ApiError(
          ErrorCode.CONFLICT,
          'An account with this email already exists. Try signing in.',
        );
      }
      throw err;
    }
    await this.sendVerification(user);
    await this.audit.log({ actorId: user.id, action: 'auth.signup', target: user.id, ip: meta.ip });
    const { token, session } = await this.sessions.create(user, {
      ...meta,
      twoFactorVerified: true,
    });
    this.sessions.setCookie(res, token, session.expiresAt);
    return { status: 'ok', me: await this.me.build(user) };
  }

  async login(
    input: { email: string; password: string },
    meta: ClientMeta,
    res: Response,
    currentSession: Session | undefined,
  ): Promise<AuthResult> {
    const user = await this.prisma.client.user.findUnique({ where: { email: input.email } });
    const invalid = () =>
      new ApiError(ErrorCode.INVALID_CREDENTIALS, 'Email or password is incorrect.');

    if (user?.lockedUntil && user.lockedUntil > new Date()) {
      throw new ApiError(
        ErrorCode.ACCOUNT_LOCKED,
        'Too many failed attempts. Your account is locked for a few minutes; try again later or reset your password.',
        { retryAfter: Math.ceil((user.lockedUntil.getTime() - Date.now()) / 1000) },
      );
    }
    const ok = await this.passwords.verify(user?.passwordHash, input.password);
    if (!user || user.deletedAt || !ok) {
      if (user && !user.deletedAt) await this.recordFailure(user, meta);
      throw invalid();
    }
    if (user.failedLoginCount > 0 || user.lockedUntil) {
      await this.prisma.client.user.update({
        where: { id: user.id },
        data: { failedLoginCount: 0, lockedUntil: null },
      });
    }
    if (currentSession) await this.sessions.revoke(currentSession.id);
    return this.startSession(user, meta, res);
  }

  /** Issues a session after a successful first factor (password or OAuth). */
  async startSession(user: User, meta: ClientMeta, res: Response): Promise<AuthResult> {
    const totp = await this.prisma.client.totpSecret.findUnique({ where: { userId: user.id } });
    const needs2fa = Boolean(totp?.enabledAt);
    const { token, session } = await this.sessions.create(user, {
      ...meta,
      twoFactorVerified: !needs2fa,
    });
    this.sessions.setCookie(res, token, session.expiresAt);
    if (needs2fa) return { status: 'two_factor_required', me: null };
    await this.audit.log({ actorId: user.id, action: 'auth.login', target: user.id, ip: meta.ip });
    return { status: 'ok', me: await this.me.build(user) };
  }

  private async recordFailure(user: User, meta: ClientMeta) {
    const failures = user.failedLoginCount + 1;
    // Exponential backoff: 1, 2, 4 ... minutes after the 5th failure, capped at an hour.
    const lockedUntil =
      failures >= LOCK_THRESHOLD
        ? new Date(
            Date.now() + Math.min(2 ** (failures - LOCK_THRESHOLD), MAX_LOCK_MINUTES) * 60_000,
          )
        : null;
    await this.prisma.client.user.update({
      where: { id: user.id },
      data: { failedLoginCount: failures, lockedUntil },
    });
    if (lockedUntil)
      await this.audit.log({ actorId: null, action: 'auth.locked', target: user.id, ip: meta.ip });
  }

  // ------------------------------------------------------------------ email tokens

  private async issueToken(userId: string, kind: EmailTokenKind): Promise<string> {
    const token = randomToken(32);
    await this.prisma.client.emailToken.updateMany({
      where: { userId, kind, usedAt: null },
      data: { usedAt: new Date() },
    });
    await this.prisma.client.emailToken.create({
      data: {
        userId,
        kind,
        tokenHash: sha256(token),
        expiresAt: new Date(Date.now() + TOKEN_TTL[kind]),
      },
    });
    return token;
  }

  /** Marks a token used atomically; returns its user id or throws TOKEN_INVALID. */
  private async consumeToken(token: string, kind: EmailTokenKind): Promise<string> {
    const row = await this.prisma.client.emailToken.findUnique({
      where: { tokenHash: sha256(token) },
    });
    const invalid = new ApiError(
      ErrorCode.TOKEN_INVALID,
      'This link is invalid or has expired. Request a new one.',
    );
    if (!row || row.kind !== kind || row.usedAt || row.expiresAt < new Date()) throw invalid;
    const claimed = await this.prisma.client.emailToken.updateMany({
      where: { id: row.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    if (claimed.count !== 1) throw invalid;
    return row.userId;
  }

  async sendVerification(user: User) {
    if (user.emailVerifiedAt) return;
    const token = await this.issueToken(user.id, 'verify_email');
    await this.email.send(
      emails.verify(user.email, `${this.env.WEB_ORIGIN}/verify-email?token=${token}`),
    );
  }

  async resendVerification(user: User) {
    await this.limits.consume(`verify-resend:${user.id}`, { limit: 3, windowSec: 3600 });
    await this.sendVerification(user);
  }

  async verifyEmail(token: string, meta: ClientMeta) {
    const userId = await this.consumeToken(token, 'verify_email');
    await this.prisma.client.user.update({
      where: { id: userId },
      data: { emailVerifiedAt: new Date() },
    });
    await this.audit.log({
      actorId: userId,
      action: 'auth.email_verified',
      target: userId,
      ip: meta.ip,
    });
  }

  async forgotPassword(email: string, meta: ClientMeta) {
    await this.limits.consume(`forgot:${sha256(email)}`, { limit: 5, windowSec: 3600 });
    const user = await this.prisma.client.user.findUnique({ where: { email } });
    if (!user || user.deletedAt) return; // same response either way
    const token = await this.issueToken(user.id, 'reset_password');
    await this.email.send(
      emails.reset(user.email, `${this.env.WEB_ORIGIN}/reset-password?token=${token}`),
    );
    await this.audit.log({
      actorId: null,
      action: 'auth.reset_requested',
      target: user.id,
      ip: meta.ip,
    });
  }

  async resetPassword(token: string, password: string, meta: ClientMeta) {
    const row = await this.prisma.client.emailToken.findUnique({
      where: { tokenHash: sha256(token) },
      include: { user: true },
    });
    if (row) await this.passwords.assertStrong(password, { email: row.user.email });
    const userId = await this.consumeToken(token, 'reset_password');
    const user = await this.prisma.client.user.update({
      where: { id: userId },
      data: {
        passwordHash: await this.passwords.hash(password),
        failedLoginCount: 0,
        lockedUntil: null,
        // Proving control of the inbox also verifies it.
        emailVerifiedAt: row?.user.emailVerifiedAt ?? new Date(),
      },
    });
    await this.sessions.revokeAllForUser(userId);
    await this.email.send(emails.passwordChanged(user.email));
    await this.audit.log({
      actorId: userId,
      action: 'auth.password_reset',
      target: userId,
      ip: meta.ip,
    });
  }

  async changePassword(
    auth: { user: User; session: Session },
    input: { currentPassword?: string | undefined; newPassword: string },
    meta: ClientMeta,
    res: Response,
  ) {
    const { user } = auth;
    if (user.passwordHash) {
      if (
        !input.currentPassword ||
        !(await this.passwords.verify(user.passwordHash, input.currentPassword))
      ) {
        throw new ApiError(ErrorCode.INVALID_CREDENTIALS, 'Your current password is incorrect.');
      }
    }
    await this.passwords.assertStrong(input.newPassword, { email: user.email });
    await this.prisma.client.user.update({
      where: { id: user.id },
      data: { passwordHash: await this.passwords.hash(input.newPassword) },
    });
    await this.sessions.revokeAllForUser(user.id, auth.session.id);
    await this.sessions.rotate(auth.session, res, meta);
    await this.email.send(emails.passwordChanged(user.email));
    await this.audit.log({
      actorId: user.id,
      action: 'auth.password_changed',
      target: user.id,
      ip: meta.ip,
    });
  }

  // ------------------------------------------------------------------ two-factor

  async setupTotp(user: User) {
    const existing = await this.prisma.client.totpSecret.findUnique({ where: { userId: user.id } });
    if (existing?.enabledAt)
      throw new ApiError(ErrorCode.CONFLICT, 'Two-factor authentication is already on.');
    const secret = generateTotpSecret();
    const encryptedSecret = encrypt(this.env.ENCRYPTION_KEY, secret);
    await this.prisma.client.totpSecret.upsert({
      where: { userId: user.id },
      create: { userId: user.id, encryptedSecret },
      update: { encryptedSecret, lastUsedStep: null },
    });
    return { secret, otpauthUrl: otpauthUrl(secret, user.email) };
  }

  /** Checks a TOTP code and records its step so it can never be used again. */
  private async checkTotp(userId: string, code: string, requireEnabled: boolean): Promise<boolean> {
    const row = await this.prisma.client.totpSecret.findUnique({ where: { userId } });
    if (!row || (requireEnabled && !row.enabledAt)) return false;
    const step = verifyTotp(
      decrypt(this.env.ENCRYPTION_KEY, row.encryptedSecret),
      code,
      Date.now(),
      row.lastUsedStep,
    );
    if (step === null) return false;
    const claimed = await this.prisma.client.totpSecret.updateMany({
      where: { id: row.id, OR: [{ lastUsedStep: null }, { lastUsedStep: { lt: step } }] },
      data: { lastUsedStep: step },
    });
    return claimed.count === 1;
  }

  async enableTotp(
    auth: { user: User; session: Session },
    code: string,
    meta: ClientMeta,
    res: Response,
  ) {
    const row = await this.prisma.client.totpSecret.findUnique({ where: { userId: auth.user.id } });
    if (!row) throw new ApiError(ErrorCode.BAD_REQUEST, 'Start two-factor setup first.');
    if (row.enabledAt)
      throw new ApiError(ErrorCode.CONFLICT, 'Two-factor authentication is already on.');
    if (!(await this.checkTotp(auth.user.id, code, false))) {
      throw new ApiError(
        ErrorCode.TWO_FACTOR_INVALID,
        'That code is not valid. Check your authenticator app.',
      );
    }
    const recoveryCodes = Array.from({ length: RECOVERY_CODE_COUNT }, () =>
      randomToken(8).replace(/[-_]/g, 'x').slice(0, 10).toLowerCase(),
    );
    await this.prisma.client.$transaction([
      this.prisma.client.totpSecret.update({
        where: { id: row.id },
        data: { enabledAt: new Date() },
      }),
      this.prisma.client.recoveryCode.deleteMany({ where: { userId: auth.user.id } }),
      this.prisma.client.recoveryCode.createMany({
        data: recoveryCodes.map((c) => ({ userId: auth.user.id, codeHash: sha256(c) })),
      }),
    ]);
    await this.sessions.revokeAllForUser(auth.user.id, auth.session.id);
    await this.sessions.rotate(auth.session, res, meta, true);
    await this.email.send(emails.twoFactorChanged(auth.user.email, true));
    await this.audit.log({
      actorId: auth.user.id,
      action: '2fa.enabled',
      target: auth.user.id,
      ip: meta.ip,
    });
    return { recoveryCodes };
  }

  async disableTotp(auth: { user: User; session: Session }, code: string, meta: ClientMeta) {
    if (!(await this.checkTotp(auth.user.id, code, true))) {
      throw new ApiError(ErrorCode.TWO_FACTOR_INVALID, 'That code is not valid.');
    }
    if (auth.user.role !== 'user') {
      throw new ApiError(
        ErrorCode.FORBIDDEN,
        'Staff accounts must keep two-factor authentication on.',
      );
    }
    await this.prisma.client.$transaction([
      this.prisma.client.totpSecret.delete({ where: { userId: auth.user.id } }),
      this.prisma.client.recoveryCode.deleteMany({ where: { userId: auth.user.id } }),
    ]);
    await this.email.send(emails.twoFactorChanged(auth.user.email, false));
    await this.audit.log({
      actorId: auth.user.id,
      action: '2fa.disabled',
      target: auth.user.id,
      ip: meta.ip,
    });
  }

  /** Completes a pending-2FA login with a TOTP or recovery code. */
  async verifySecondFactor(
    auth: { user: User; session: Session },
    input: { code: string } | { recoveryCode: string },
    meta: ClientMeta,
    res: Response,
  ): Promise<AuthResult> {
    await this.limits.consume(`2fa:${auth.user.id}`, { limit: 10, windowSec: 900 });
    let ok: boolean;
    if ('code' in input) {
      ok = await this.checkTotp(auth.user.id, input.code, true);
    } else {
      const hash = sha256(input.recoveryCode.trim().toLowerCase());
      const used = await this.prisma.client.recoveryCode.updateMany({
        where: { userId: auth.user.id, codeHash: hash, usedAt: null },
        data: { usedAt: new Date() },
      });
      ok = used.count === 1;
      if (ok)
        await this.audit.log({
          actorId: auth.user.id,
          action: '2fa.recovery_code_used',
          ip: meta.ip,
        });
    }
    if (!ok) throw new ApiError(ErrorCode.TWO_FACTOR_INVALID, 'That code is not valid.');
    await this.sessions.rotate(auth.session, res, meta, true);
    await this.audit.log({
      actorId: auth.user.id,
      action: 'auth.login',
      target: auth.user.id,
      ip: meta.ip,
    });
    return { status: 'ok', me: await this.me.build(auth.user) };
  }
}
