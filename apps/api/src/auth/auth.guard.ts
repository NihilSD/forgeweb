import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  type NestMiddleware,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ADMIN_ROLES, ErrorCode, type UserRole } from '@forge/shared';
import type { NextFunction, Response } from 'express';
import { ApiError } from '../common/api-error.js';
import {
  ALLOW_PENDING_2FA,
  type ForgeRequest,
  IS_PUBLIC,
  REQUIRE_VERIFIED_EMAIL,
} from '../common/request-context.js';
import { PrismaService } from '../infra/prisma.service.js';
import { SESSION_COOKIE, SessionService } from './session.service.js';

/** Attaches req.auth for every request that carries a valid session cookie. */
@Injectable()
export class SessionMiddleware implements NestMiddleware {
  constructor(@Inject(SessionService) private readonly sessions: SessionService) {}
  async use(req: ForgeRequest, _res: Response, next: NextFunction) {
    try {
      req.auth = await this.sessions.resolve(req.cookies?.[SESSION_COOKIE] as string | undefined);
      next();
    } catch (err) {
      next(err);
    }
  }
}

const ROLES = 'forge:roles';
/** Restricts a route to the given admin roles. Admin routes also require an active TOTP 2FA. */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES, roles);

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) return true;

    const req = context.switchToHttp().getRequest<ForgeRequest>();
    const auth = req.auth;
    if (!auth) throw ApiError.unauthenticated();

    if (
      !auth.session.twoFactorVerified &&
      !this.reflector.getAllAndOverride<boolean>(ALLOW_PENDING_2FA, targets)
    ) {
      throw new ApiError(ErrorCode.TWO_FACTOR_REQUIRED, 'Enter your two-factor code to continue.');
    }

    if (
      this.reflector.getAllAndOverride<boolean>(REQUIRE_VERIFIED_EMAIL, targets) &&
      !auth.user.emailVerifiedAt
    ) {
      throw new ApiError(ErrorCode.EMAIL_NOT_VERIFIED, 'Verify your email address to do this.');
    }

    const roles = this.reflector.getAllAndOverride<UserRole[] | undefined>(ROLES, targets);
    if (roles) {
      if (!ADMIN_ROLES.includes(auth.user.role) || !roles.includes(auth.user.role))
        throw ApiError.forbidden();
      const totp = await this.prisma.client.totpSecret.findUnique({
        where: { userId: auth.user.id },
      });
      if (!totp?.enabledAt) {
        throw new ApiError(
          ErrorCode.TWO_FACTOR_REQUIRED,
          'Admin access requires two-factor authentication. Turn it on in Settings.',
          undefined,
          403,
        );
      }
    }
    return true;
  }
}
