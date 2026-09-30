import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import {
  type AuthResult,
  authResultSchema,
  forgotPasswordSchema,
  loginSchema,
  OAUTH_PROVIDERS,
  type OAuthProvider,
  recoveryCodesSchema,
  resetPasswordSchema,
  signupSchema,
  tokenSchema,
  totpCodeSchema,
  totpSetupSchema,
  twoFactorVerifySchema,
  disableTwoFactorSchema,
} from '@forge/shared';
import type { Response } from 'express';
import { z } from 'zod';
import { ApiError } from '../common/api-error.js';
import {
  AllowPending2fa,
  type AuthContext,
  clientIp,
  CurrentAuth,
  CurrentUser,
  type ForgeRequest,
  Public,
} from '../common/request-context.js';
import { ResponseSchema } from '../common/response-schema.js';
import { ZodPipe } from '../common/zod.js';
import { ENV, type Env } from '../config/env.js';
import { RateLimit } from '../rate-limit/rate-limit.guard.js';
import type { User } from '@forge/db';
import { AuthService, type ClientMeta } from './auth.service.js';
import { issueCsrfToken, isValidCsrfToken, CSRF_COOKIE, setCsrfCookie } from './csrf.js';
import { OAUTH_STATE_COOKIE, OAuthError, OAuthService } from './oauth.service.js';
import { SessionService } from './session.service.js';

const okSchema = z.object({ ok: z.literal(true) });
const csrfSchema = z.object({ csrfToken: z.string() });

@Controller('auth')
export class AuthController {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(SessionService) private readonly sessions: SessionService,
    @Inject(OAuthService) private readonly oauth: OAuthService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  private meta(req: ForgeRequest): ClientMeta {
    return { ip: clientIp(req, this.env), userAgent: req.headers['user-agent'] };
  }

  /** Issues (or re-issues) the CSRF cookie. The web app calls this before its first write. */
  @Public()
  @Get('csrf')
  @ResponseSchema(csrfSchema)
  csrf(@Req() req: ForgeRequest, @Res({ passthrough: true }) res: Response) {
    const existing = req.cookies?.[CSRF_COOKIE] as string | undefined;
    const token =
      existing && isValidCsrfToken(this.env.APP_SECRET, existing)
        ? existing
        : issueCsrfToken(this.env.APP_SECRET);
    setCsrfCookie(res, this.env, token);
    return { csrfToken: token };
  }

  @Public()
  @Post('signup')
  @RateLimit({ bucket: 'signup', by: 'ip', limit: 10, windowSec: 3600 })
  @ResponseSchema(authResultSchema)
  signup(
    @Body(new ZodPipe(signupSchema)) body: z.infer<typeof signupSchema>,
    @Req() req: ForgeRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResult> {
    return this.auth.signup(body, this.meta(req), res);
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  @RateLimit({ bucket: 'login', by: 'ip', limit: 10, windowSec: 300 })
  @ResponseSchema(authResultSchema)
  login(
    @Body(new ZodPipe(loginSchema)) body: z.infer<typeof loginSchema>,
    @Req() req: ForgeRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResult> {
    return this.auth.login(body, this.meta(req), res, req.auth?.session);
  }

  @Public()
  @Post('logout')
  @HttpCode(200)
  @ResponseSchema(okSchema)
  async logout(@Req() req: ForgeRequest, @Res({ passthrough: true }) res: Response) {
    if (req.auth) await this.sessions.revoke(req.auth.session.id);
    this.sessions.clearCookie(res);
    return { ok: true as const };
  }

  @Public()
  @Post('verify-email')
  @HttpCode(200)
  @RateLimit({ bucket: 'verify', by: 'ip', limit: 20, windowSec: 3600 })
  @ResponseSchema(okSchema)
  async verifyEmail(
    @Body(new ZodPipe(tokenSchema)) body: { token: string },
    @Req() req: ForgeRequest,
  ) {
    await this.auth.verifyEmail(body.token, this.meta(req));
    return { ok: true as const };
  }

  @Post('verify-email/resend')
  @HttpCode(200)
  @ResponseSchema(okSchema)
  async resend(@CurrentUser() user: User) {
    await this.auth.resendVerification(user);
    return { ok: true as const };
  }

  @Public()
  @Post('password/forgot')
  @HttpCode(200)
  @RateLimit({ bucket: 'forgot', by: 'ip', limit: 10, windowSec: 3600 })
  @ResponseSchema(okSchema)
  async forgot(
    @Body(new ZodPipe(forgotPasswordSchema)) body: { email: string },
    @Req() req: ForgeRequest,
  ) {
    await this.auth.forgotPassword(body.email, this.meta(req));
    return { ok: true as const };
  }

  @Public()
  @Post('password/reset')
  @HttpCode(200)
  @RateLimit({ bucket: 'reset', by: 'ip', limit: 10, windowSec: 3600 })
  @ResponseSchema(okSchema)
  async reset(
    @Body(new ZodPipe(resetPasswordSchema)) body: z.infer<typeof resetPasswordSchema>,
    @Req() req: ForgeRequest,
  ) {
    await this.auth.resetPassword(body.token, body.password, this.meta(req));
    return { ok: true as const };
  }

  // ------------------------------------------------------------------ two-factor

  @Post('2fa/setup')
  @HttpCode(200)
  @ResponseSchema(totpSetupSchema)
  setup2fa(@CurrentUser() user: User) {
    return this.auth.setupTotp(user);
  }

  @Post('2fa/enable')
  @HttpCode(200)
  @ResponseSchema(recoveryCodesSchema)
  enable2fa(
    @Body(new ZodPipe(totpCodeSchema)) body: { code: string },
    @CurrentAuth() auth: AuthContext,
    @Req() req: ForgeRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.auth.enableTotp(auth, body.code, this.meta(req), res);
  }

  @Post('2fa/disable')
  @HttpCode(200)
  @ResponseSchema(okSchema)
  async disable2fa(
    @Body(new ZodPipe(disableTwoFactorSchema)) body: { code: string },
    @CurrentAuth() auth: AuthContext,
    @Req() req: ForgeRequest,
  ) {
    await this.auth.disableTotp(auth, body.code, this.meta(req));
    return { ok: true as const };
  }

  @AllowPending2fa()
  @Post('2fa/verify')
  @HttpCode(200)
  @ResponseSchema(authResultSchema)
  verify2fa(
    @Body(new ZodPipe(twoFactorVerifySchema)) body: z.infer<typeof twoFactorVerifySchema>,
    @CurrentAuth() auth: AuthContext,
    @Req() req: ForgeRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.auth.verifySecondFactor(auth, body, this.meta(req), res);
  }

  // ------------------------------------------------------------------ OAuth

  @Public()
  @Get('oauth/providers')
  @ResponseSchema(z.object({ providers: z.array(z.enum(OAUTH_PROVIDERS)) }))
  providers() {
    return { providers: OAUTH_PROVIDERS.filter((p) => this.oauth.isEnabled(p)) };
  }

  @Public()
  @Get('oauth/:provider/start')
  @RateLimit({ bucket: 'oauth', by: 'ip', limit: 30, windowSec: 300 })
  async oauthStart(@Param('provider') provider: string, @Res() res: Response) {
    const p = parseProvider(provider);
    try {
      const { url, state } = await this.oauth.start(p);
      res.cookie(OAUTH_STATE_COOKIE, state, {
        httpOnly: true,
        secure: this.env.COOKIE_SECURE,
        sameSite: 'lax',
        path: '/api/v1/auth/oauth',
        maxAge: 600_000,
      });
      res.redirect(302, url);
    } catch (err) {
      if (err instanceof OAuthError)
        return res.redirect(302, `${this.env.WEB_ORIGIN}/login?error=${err.reason}`);
      throw err;
    }
  }

  @Public()
  @Get('oauth/:provider/callback')
  @RateLimit({ bucket: 'oauth', by: 'ip', limit: 30, windowSec: 300 })
  async oauthCallback(
    @Param('provider') provider: string,
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Req() req: ForgeRequest,
    @Res() res: Response,
  ) {
    const p = parseProvider(provider);
    res.clearCookie(OAUTH_STATE_COOKIE, { path: '/api/v1/auth/oauth' });
    try {
      const { user, created } = await this.oauth.callback(
        p,
        { code, state, cookieState: req.cookies?.[OAUTH_STATE_COOKIE] as string | undefined },
        clientIp(req, this.env),
      );
      if (req.auth) await this.sessions.revoke(req.auth.session.id);
      const result = await this.auth.startSession(user, this.meta(req), res);
      const next =
        result.status === 'two_factor_required'
          ? '/login/2fa'
          : created || !user.onboardedAt
            ? '/onboarding'
            : '/dashboard';
      res.redirect(302, `${this.env.WEB_ORIGIN}${next}`);
    } catch (err) {
      if (err instanceof OAuthError)
        return res.redirect(302, `${this.env.WEB_ORIGIN}/login?error=${err.reason}`);
      throw err;
    }
  }
}

function parseProvider(value: string): OAuthProvider {
  if ((OAUTH_PROVIDERS as readonly string[]).includes(value)) return value as OAuthProvider;
  throw ApiError.notFound('Provider');
}
