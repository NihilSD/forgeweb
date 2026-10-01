import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@forge/db';
import { flagFor, type InstanceFile } from '@forge/problem-kit';
import { hmac, safeEqual, sha256 } from '../common/crypto.js';
import { ENV, type Env } from '../config/env.js';
import { AuditService } from '../audit/audit.service.js';
import { EngagementService } from '../engagement/engagement.service.js';
import { PrismaService } from '../infra/prisma.service.js';
import { ContentService, type LoadedProblem } from '../problems/content.service.js';

const URL_TTL_MS = 5 * 60_000;

/**
 * Per-user flags (spec 3.4): FORGE{HMAC(secret, userId + challengeId)[0:24]}. Flags are derived,
 * never stored; FlagIssue keeps only a hash so a flag submitted by someone else can be traced.
 * Files are served through short-lived signed URLs bound to the user.
 */
@Injectable()
export class FlagsService {
  private readonly secret: string;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ContentService) private readonly content: ContentService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(ENV) private readonly env: Env,
    @Inject(EngagementService) private readonly engagement: EngagementService,
  ) {
    // A dedicated key derived from APP_SECRET, so flags can't be computed from any other HMAC.
    this.secret = hmac(env.APP_SECRET, 'forge-flags-v1', 'hex');
  }

  flag(userId: string, problemId: string) {
    return flagFor(this.secret, userId, problemId);
  }

  private async recordIssue(userId: string, problemId: string, flag: string) {
    await this.prisma.client.flagIssue
      .create({ data: { userId, problemId, flagHash: sha256(flag) } })
      .catch((err: unknown) => {
        if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002'))
          throw err;
      });
  }

  /** The user's own files (with their flag embedded). */
  async files(userId: string, problem: LoadedProblem): Promise<Record<string, InstanceFile>> {
    const flag = this.flag(userId, problem.id);
    await this.recordIssue(userId, problem.id, flag);
    const gen = await this.content.instance(
      problem.current,
      this.content.practiceSeed(userId, problem.id),
      flag,
    );
    return gen.instance.files ?? {};
  }

  signUrl(userId: string, slug: string, name: string, now = Date.now()) {
    const exp = now + URL_TTL_MS;
    const sig = hmac(this.env.APP_SECRET, `file:${userId}:${slug}:${name}:${exp}`);
    const url = `/api/v1/problems/${slug}/files/${encodeURIComponent(name)}?exp=${exp}&sig=${sig}`;
    return { url, expiresAt: new Date(exp).toISOString() };
  }

  verifyUrl(userId: string, slug: string, name: string, exp: number, sig: string): boolean {
    if (!Number.isFinite(exp) || exp < Date.now() || exp > Date.now() + URL_TTL_MS) return false;
    return safeEqual(sig, hmac(this.env.APP_SECRET, `file:${userId}:${slug}:${name}:${exp}`));
  }

  /** Checks a submitted flag. Another user's flag is logged as a sharing signal. */
  async submit(userId: string, problem: LoadedProblem, value: string, ip: string | undefined) {
    const own = this.flag(userId, problem.id);
    const correct = safeEqual(value, own);
    const valueHash = sha256(value);
    let sharedFrom: string | null = null;
    if (!correct) {
      const issue = await this.prisma.client.flagIssue.findUnique({
        where: { flagHash: valueHash },
      });
      if (issue && issue.userId !== userId) sharedFrom = issue.userId;
    }
    await this.prisma.client.flagSubmission.create({
      data: { userId, problemId: problem.id, valueHash, correct, sharedFrom },
    });
    if (correct) await this.engagement.onFlagSolved(userId, problem, new Date());
    if (sharedFrom) {
      await this.audit.log({
        actorId: userId,
        action: 'flag.shared_suspected',
        target: problem.id,
        ip,
        meta: { owner: sharedFrom },
      });
    }
    return {
      correct,
      message: correct
        ? 'Correct flag. Well done!'
        : 'That is not the right flag. Flags are unique to each person, so make sure you use your own files.',
    };
  }
}
