import { createHash } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { Prisma, type User } from '@forge/db';
import type { OAuthProvider } from '@forge/shared';
import { randomToken } from '../common/crypto.js';
import { ENV, type Env } from '../config/env.js';
import { AuditService } from '../audit/audit.service.js';
import { PrismaService } from '../infra/prisma.service.js';
import { RedisService } from '../infra/redis.service.js';

interface ProviderConfig {
  clientId: string;
  clientSecret: string;
}

export interface OAuthProfile {
  id: string;
  email: string;
  verified: boolean;
}

const PROVIDERS: Record<OAuthProvider, { authorize: string; token: string; scope: string }> = {
  github: {
    authorize: 'https://github.com/login/oauth/authorize',
    token: 'https://github.com/login/oauth/access_token',
    scope: 'read:user user:email',
  },
  google: {
    authorize: 'https://accounts.google.com/o/oauth2/v2/auth',
    token: 'https://oauth2.googleapis.com/token',
    scope: 'openid email',
  },
};

const STATE_TTL_SEC = 600;
export const OAUTH_STATE_COOKIE = 'forge_oauth_state';

export class OAuthError extends Error {
  constructor(
    readonly reason: 'oauth_state' | 'oauth_unverified_email' | 'oauth_failed' | 'oauth_disabled',
  ) {
    super(reason);
  }
}

/**
 * GitHub and Google sign-in with PKCE (S256) and state (spec 3.1). Accounts are linked by email
 * only when the provider says that email is verified.
 */
@Injectable()
export class OAuthService {
  private readonly logger = new Logger('OAuthService');
  private readonly configs: Partial<Record<OAuthProvider, ProviderConfig>> = {};
  /** Test seam: replaces the code exchange + profile fetch with a fixture. */
  fetchProfileOverride:
    ((provider: OAuthProvider, code: string, verifier: string) => Promise<OAuthProfile>) | null =
    null;

  constructor(
    @Inject(ENV) private readonly env: Env,
    @Inject(RedisService) private readonly redis: RedisService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {
    if (env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET) {
      this.configs.github = {
        clientId: env.GITHUB_CLIENT_ID,
        clientSecret: env.GITHUB_CLIENT_SECRET,
      };
    }
    if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) {
      this.configs.google = {
        clientId: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
      };
    }
  }

  setProviderConfig(provider: OAuthProvider, config: ProviderConfig) {
    this.configs[provider] = config;
  }

  isEnabled(provider: OAuthProvider) {
    return Boolean(this.configs[provider]);
  }

  private redirectUri(provider: OAuthProvider) {
    return `${this.env.WEB_ORIGIN}/api/v1/auth/oauth/${provider}/callback`;
  }

  /** Returns the provider URL and the state value to bind to the browser via cookie. */
  async start(provider: OAuthProvider): Promise<{ url: string; state: string }> {
    const cfg = this.configs[provider];
    if (!cfg) throw new OAuthError('oauth_disabled');
    const state = randomToken(24);
    const verifier = randomToken(48);
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    await this.redis.client.set(
      `oauth:${state}`,
      JSON.stringify({ provider, verifier }),
      'EX',
      STATE_TTL_SEC,
    );
    const p = PROVIDERS[provider];
    const url = new URL(p.authorize);
    url.search = new URLSearchParams({
      client_id: cfg.clientId,
      redirect_uri: this.redirectUri(provider),
      response_type: 'code',
      scope: p.scope,
      state,
      code_challenge: challenge,
      code_challenge_method: 'S256',
    }).toString();
    return { url: url.toString(), state };
  }

  /** Validates state, exchanges the code and returns the local user (created or linked). */
  async callback(
    provider: OAuthProvider,
    params: { code?: string; state?: string; cookieState?: string },
    ip: string | undefined,
  ): Promise<{ user: User; created: boolean }> {
    const { code, state, cookieState } = params;
    if (!code || !state || !cookieState || state !== cookieState)
      throw new OAuthError('oauth_state');
    const key = `oauth:${state}`;
    const raw = await this.redis.client.getdel(key);
    if (!raw) throw new OAuthError('oauth_state');
    const stored = JSON.parse(raw) as { provider: OAuthProvider; verifier: string };
    if (stored.provider !== provider) throw new OAuthError('oauth_state');

    let profile: OAuthProfile;
    try {
      profile = this.fetchProfileOverride
        ? await this.fetchProfileOverride(provider, code, stored.verifier)
        : await this.fetchProfile(provider, code, stored.verifier);
    } catch (err) {
      this.logger.warn(`OAuth exchange with ${provider} failed: ${(err as Error).message}`);
      throw new OAuthError('oauth_failed');
    }
    const email = profile.email.trim().toLowerCase();

    const linked = await this.prisma.client.oAuthAccount.findUnique({
      where: { provider_providerUserId: { provider, providerUserId: profile.id } },
      include: { user: true },
    });
    if (linked) {
      if (linked.user.deletedAt) throw new OAuthError('oauth_failed');
      return { user: linked.user, created: false };
    }

    const existing = await this.prisma.client.user.findUnique({ where: { email } });
    if (existing) {
      if (!profile.verified || existing.deletedAt) throw new OAuthError('oauth_unverified_email');
      await this.prisma.client.oAuthAccount.create({
        data: { userId: existing.id, provider, providerUserId: profile.id },
      });
      if (!existing.emailVerifiedAt) {
        await this.prisma.client.user.update({
          where: { id: existing.id },
          data: { emailVerifiedAt: new Date() },
        });
      }
      await this.audit.log({
        actorId: existing.id,
        action: 'auth.oauth_linked',
        target: provider,
        ip,
      });
      return { user: existing, created: false };
    }

    try {
      const user = await this.prisma.client.user.create({
        data: {
          email,
          emailVerifiedAt: profile.verified ? new Date() : null,
          oauthAccounts: { create: { provider, providerUserId: profile.id } },
        },
      });
      await this.audit.log({ actorId: user.id, action: 'auth.signup', target: provider, ip });
      return { user, created: true };
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new OAuthError('oauth_failed');
      }
      throw err;
    }
  }

  private async fetchProfile(
    provider: OAuthProvider,
    code: string,
    verifier: string,
  ): Promise<OAuthProfile> {
    const cfg = this.configs[provider]!;
    const tokenRes = await fetch(PROVIDERS[provider].token, {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: cfg.clientId,
        client_secret: cfg.clientSecret,
        code,
        code_verifier: verifier,
        grant_type: 'authorization_code',
        redirect_uri: this.redirectUri(provider),
      }),
      signal: AbortSignal.timeout(10_000),
    });
    const tokenBody = (await tokenRes.json()) as { access_token?: string };
    if (!tokenRes.ok || !tokenBody.access_token)
      throw new Error(`token exchange status ${tokenRes.status}`);
    const auth = { authorization: `Bearer ${tokenBody.access_token}`, accept: 'application/json' };

    if (provider === 'github') {
      const [userRes, emailsRes] = await Promise.all([
        fetch('https://api.github.com/user', {
          headers: auth,
          signal: AbortSignal.timeout(10_000),
        }),
        fetch('https://api.github.com/user/emails', {
          headers: auth,
          signal: AbortSignal.timeout(10_000),
        }),
      ]);
      const u = (await userRes.json()) as { id: number };
      const list = (await emailsRes.json()) as {
        email: string;
        primary: boolean;
        verified: boolean;
      }[];
      const primary = list.find((e) => e.primary) ?? list[0];
      if (!primary) throw new Error('no email on GitHub account');
      return { id: String(u.id), email: primary.email, verified: primary.verified };
    }
    const res = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
      headers: auth,
      signal: AbortSignal.timeout(10_000),
    });
    const g = (await res.json()) as { sub: string; email: string; email_verified: boolean };
    return { id: g.sub, email: g.email, verified: g.email_verified === true };
  }
}
