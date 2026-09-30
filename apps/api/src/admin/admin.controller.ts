import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  Req,
} from '@nestjs/common';
import type { User } from '@forge/db';
import { cursorQuerySchema, USER_ROLES } from '@forge/shared';
import { z } from 'zod';
import { ApiError } from '../common/api-error.js';
import { clientIp, CurrentUser, type ForgeRequest } from '../common/request-context.js';
import { ResponseSchema } from '../common/response-schema.js';
import { ZodPipe } from '../common/zod.js';
import { ENV, type Env } from '../config/env.js';
import { AuditService } from '../audit/audit.service.js';
import { Roles } from '../auth/auth.guard.js';
import { SessionService } from '../auth/session.service.js';
import { PrismaService } from '../infra/prisma.service.js';

const auditEntrySchema = z.object({
  id: z.string(),
  actorId: z.string().nullable(),
  action: z.string(),
  target: z.string().nullable(),
  at: z.string(),
});

@Controller('admin')
export class AdminController {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(SessionService) private readonly sessions: SessionService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  @Get('audit-log')
  @Roles('superadmin', 'support')
  @ResponseSchema(z.object({ items: z.array(auditEntrySchema), nextCursor: z.string().nullable() }))
  async auditLog(@Query(new ZodPipe(cursorQuerySchema)) q: z.infer<typeof cursorQuerySchema>) {
    const rows = await this.prisma.client.auditLog.findMany({
      orderBy: [{ at: 'desc' }, { id: 'desc' }],
      take: q.limit + 1,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
    });
    const items = rows.slice(0, q.limit);
    return {
      items: items.map((r) => ({ ...r, at: r.at.toISOString() })),
      nextCursor: rows.length > q.limit ? items[items.length - 1]!.id : null,
    };
  }

  @Patch('users/:id/role')
  @Roles('superadmin')
  @ResponseSchema(z.object({ id: z.string(), role: z.enum(USER_ROLES) }))
  async setRole(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodPipe(z.object({ role: z.enum(USER_ROLES) })))
    body: { role: (typeof USER_ROLES)[number] },
    @CurrentUser() actor: User,
    @Req() req: ForgeRequest,
  ) {
    if (id === actor.id) throw ApiError.forbidden('You cannot change your own role.');
    const target = await this.prisma.client.user.findUnique({ where: { id } });
    if (!target || target.deletedAt) throw ApiError.notFound('User');
    const updated = await this.prisma.client.user.update({
      where: { id },
      data: { role: body.role },
    });
    // Privilege change: force the user to sign in again.
    await this.sessions.revokeAllForUser(id);
    await this.audit.log({
      actorId: actor.id,
      action: 'user.role_changed',
      target: id,
      ip: clientIp(req, this.env),
      meta: { from: target.role, to: body.role },
    });
    return { id: updated.id, role: updated.role };
  }
}
