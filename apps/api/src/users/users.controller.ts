import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { Prisma, type User } from '@forge/db';
import {
  changePasswordSchema,
  deleteAccountSchema,
  ErrorCode,
  type Me,
  meSchema,
  MIN_AGE,
  onboardingSchema,
  sessionInfoSchema,
  updateProfileSchema,
} from '@forge/shared';
import type { Response } from 'express';
import { z } from 'zod';
import { ApiError } from '../common/api-error.js';
import {
  type AuthContext,
  clientIp,
  CurrentAuth,
  CurrentUser,
  type ForgeRequest,
} from '../common/request-context.js';
import { ResponseSchema } from '../common/response-schema.js';
import { ZodPipe } from '../common/zod.js';
import { ENV, type Env } from '../config/env.js';
import { AuditService } from '../audit/audit.service.js';
import { AuthService } from '../auth/auth.service.js';
import { PasswordService } from '../auth/password.service.js';
import { SessionService } from '../auth/session.service.js';
import { EmailService } from '../email/email.service.js';
import { emails } from '../email/templates.js';
import { PrismaService } from '../infra/prisma.service.js';
import { RateLimit } from '../rate-limit/rate-limit.guard.js';
import { DataExportService } from './data-export.service.js';
import { DELETION_GRACE_DAYS } from './me.mapper.js';
import { MeService } from './me.service.js';

const okSchema = z.object({ ok: z.literal(true) });

@Controller('me')
export class UsersController {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(MeService) private readonly me: MeService,
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(PasswordService) private readonly passwords: PasswordService,
    @Inject(SessionService) private readonly sessions: SessionService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(EmailService) private readonly email: EmailService,
    @Inject(DataExportService) private readonly exporter: DataExportService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  @Get()
  @ResponseSchema(meSchema)
  get(@CurrentUser() user: User): Promise<Me> {
    return this.me.build(user);
  }

  @Post('onboarding')
  @HttpCode(200)
  @ResponseSchema(meSchema)
  async onboarding(
    @Body(new ZodPipe(onboardingSchema)) body: z.infer<typeof onboardingSchema>,
    @CurrentUser() user: User,
  ): Promise<Me> {
    // With only a birth year we cannot know the exact age; anyone who turns 16 this year is allowed.
    if (new Date().getUTCFullYear() - body.birthYear < MIN_AGE) {
      throw new ApiError(
        ErrorCode.AGE_RESTRICTED,
        `Forge is for people aged ${MIN_AGE} and over. We haven't stored your birth year.`,
      );
    }
    try {
      const updated = await this.prisma.client.user.update({
        where: { id: user.id },
        data: {
          handle: body.handle,
          displayName: body.displayName,
          country: body.country ?? null,
          timeZone: body.timeZone,
          birthYear: body.birthYear,
          goal: body.goal,
          languages: body.languages,
          onboardedAt: user.onboardedAt ?? new Date(),
        },
      });
      return this.me.build(updated);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ApiError(ErrorCode.CONFLICT, 'That handle is taken. Try another.', {
          field: 'handle',
        });
      }
      throw err;
    }
  }

  @Patch('profile')
  @ResponseSchema(meSchema)
  async updateProfile(
    @Body(new ZodPipe(updateProfileSchema)) body: z.infer<typeof updateProfileSchema>,
    @CurrentUser() user: User,
  ): Promise<Me> {
    const updated = await this.prisma.client.user.update({ where: { id: user.id }, data: body });
    return this.me.build(updated);
  }

  @Post('password')
  @HttpCode(200)
  @RateLimit({ bucket: 'password-change', by: 'user', limit: 10, windowSec: 3600 })
  @ResponseSchema(okSchema)
  async changePassword(
    @Body(new ZodPipe(changePasswordSchema)) body: z.infer<typeof changePasswordSchema>,
    @CurrentAuth() auth: AuthContext,
    @Req() req: ForgeRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.auth.changePassword(
      auth,
      body,
      { ip: clientIp(req, this.env), userAgent: req.headers['user-agent'] },
      res,
    );
    return { ok: true as const };
  }

  @Get('sessions')
  @ResponseSchema(z.object({ items: z.array(sessionInfoSchema) }))
  async listSessions(@CurrentAuth() auth: AuthContext) {
    const rows = await this.prisma.client.session.findMany({
      where: { userId: auth.user.id, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { lastSeenAt: 'desc' },
      take: 100,
    });
    return {
      items: rows.map((s) => ({
        id: s.id,
        userAgent: s.userAgent,
        createdAt: s.createdAt.toISOString(),
        lastSeenAt: s.lastSeenAt.toISOString(),
        current: s.id === auth.session.id,
      })),
    };
  }

  @Delete('sessions/:id')
  @ResponseSchema(okSchema)
  async revokeSession(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentAuth() auth: AuthContext,
    @Req() req: ForgeRequest,
  ) {
    const session = await this.prisma.client.session.findFirst({
      where: { id, userId: auth.user.id },
    });
    if (!session) throw ApiError.notFound('Session');
    await this.sessions.revoke(id);
    await this.audit.log({
      actorId: auth.user.id,
      action: 'session.revoked',
      target: id,
      ip: clientIp(req, this.env),
    });
    return { ok: true as const };
  }

  @Post('sessions/revoke-others')
  @HttpCode(200)
  @ResponseSchema(okSchema)
  async revokeOthers(@CurrentAuth() auth: AuthContext, @Req() req: ForgeRequest) {
    await this.sessions.revokeAllForUser(auth.user.id, auth.session.id);
    await this.audit.log({
      actorId: auth.user.id,
      action: 'session.revoked_others',
      ip: clientIp(req, this.env),
    });
    return { ok: true as const };
  }

  @Get('export')
  @RateLimit({ bucket: 'export', by: 'user', limit: 5, windowSec: 3600 })
  async export(@CurrentUser() user: User, @Res({ passthrough: true }) res: Response) {
    res.setHeader('Content-Disposition', `attachment; filename="forge-export-${user.id}.json"`);
    return this.exporter.build(user.id);
  }

  @Post('delete')
  @HttpCode(200)
  @RateLimit({ bucket: 'delete', by: 'user', limit: 5, windowSec: 3600 })
  @ResponseSchema(okSchema)
  async requestDeletion(
    @Body(new ZodPipe(deleteAccountSchema)) body: z.infer<typeof deleteAccountSchema>,
    @CurrentAuth() auth: AuthContext,
    @Req() req: ForgeRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { user } = auth;
    if (
      user.passwordHash &&
      !(await this.passwords.verify(user.passwordHash, body.password ?? ''))
    ) {
      throw new ApiError(ErrorCode.INVALID_CREDENTIALS, 'Your password is incorrect.');
    }
    const now = new Date();
    await this.prisma.client.user.update({
      where: { id: user.id },
      data: { deletionRequestedAt: now },
    });
    await this.sessions.revokeAllForUser(user.id);
    this.sessions.clearCookie(res);
    const date = new Date(now.getTime() + DELETION_GRACE_DAYS * 86_400_000)
      .toISOString()
      .slice(0, 10);
    await this.email.send(emails.deletionScheduled(user.email, date));
    await this.audit.log({
      actorId: user.id,
      action: 'user.deletion_requested',
      target: user.id,
      ip: clientIp(req, this.env),
    });
    return { ok: true as const };
  }

  @Post('delete/cancel')
  @HttpCode(200)
  @ResponseSchema(okSchema)
  async cancelDeletion(@CurrentUser() user: User, @Req() req: ForgeRequest) {
    await this.prisma.client.user.update({
      where: { id: user.id },
      data: { deletionRequestedAt: null },
    });
    await this.audit.log({
      actorId: user.id,
      action: 'user.deletion_cancelled',
      target: user.id,
      ip: clientIp(req, this.env),
    });
    return { ok: true as const };
  }
}
