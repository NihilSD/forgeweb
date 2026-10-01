import {
  Global,
  Inject,
  type MiddlewareConsumer,
  Module,
  type NestModule,
  type OnModuleInit,
} from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { AdminController } from './admin/admin.controller.js';
import { AdminAttemptsController, AttemptsController } from './attempts/attempts.controller.js';
import { AttemptsService } from './attempts/attempts.service.js';
import { AuditService } from './audit/audit.service.js';
import { AuthController } from './auth/auth.controller.js';
import { AuthGuard, SessionMiddleware } from './auth/auth.guard.js';
import { AuthService } from './auth/auth.service.js';
import { CsrfGuard } from './auth/csrf.js';
import { OAuthService } from './auth/oauth.service.js';
import { PasswordService } from './auth/password.service.js';
import { SessionService } from './auth/session.service.js';
import { ErrorFilter } from './common/error.filter.js';
import { ResponseSchemaInterceptor } from './common/response-schema.js';
import { EmailService } from './email/email.service.js';
import { HealthController } from './health/health.controller.js';
import { InfraModule } from './infra/infra.module.js';
import { RateLimitGuard } from './rate-limit/rate-limit.guard.js';
import { RateLimitService } from './rate-limit/rate-limit.service.js';
import { AccountDeletionService } from './users/account-deletion.service.js';
import { DataExportService } from './users/data-export.service.js';
import { EntitlementsService } from './entitlements/entitlements.service.js';
import { DailyService } from './engagement/daily.service.js';
import { EngagementController } from './engagement/engagement.controller.js';
import { EngagementService } from './engagement/engagement.service.js';
import { PracticeController } from './practice/practice.controller.js';
import { PracticeService } from './practice/practice.service.js';
import { CoursesController } from './courses/courses.controller.js';
import { MeService } from './users/me.service.js';
import { AdminProblemsController } from './problems/admin-problems.controller.js';
import { ContentService } from './problems/content.service.js';
import { ProblemsController } from './problems/problems.controller.js';
import { SolvedService } from './problems/solved.service.js';
import { RunnerQueueService } from './submissions/runner-queue.service.js';
import {
  RunnerCallbackController,
  SubmissionsController,
} from './submissions/submissions.controller.js';
import { SubmissionsService } from './submissions/submissions.service.js';
import { FlagsService } from './flags/flags.service.js';
import { WorkspaceController } from './workspace/workspace.controller.js';
import { PrismaService } from './infra/prisma.service.js';
import { UsersController } from './users/users.controller.js';

/** Cross-cutting services every feature module may inject. */
@Global()
@Module({
  providers: [
    AuditService,
    EmailService,
    RateLimitService,
    SessionService,
    PasswordService,
    MeService,
    DataExportService,
    EntitlementsService,
    DailyService,
    EngagementService,
  ],
  exports: [
    AuditService,
    EmailService,
    RateLimitService,
    SessionService,
    PasswordService,
    MeService,
    DataExportService,
    EntitlementsService,
    DailyService,
    EngagementService,
  ],
})
export class CoreModule implements OnModuleInit {
  constructor(
    @Inject(MeService) private readonly me: MeService,
    @Inject(EntitlementsService) private readonly entitlements: EntitlementsService,
  ) {}

  onModuleInit() {
    // The plan shown in /me always comes from the entitlements service.
    this.me.planResolver = (userId) => this.entitlements.plan(userId);
  }
}

@Module({
  controllers: [AuthController, UsersController],
  providers: [AuthService, OAuthService, AccountDeletionService],
  exports: [AuthService],
})
export class AccountsModule {}

@Module({ controllers: [AdminController] })
export class AdminModule {}

@Module({
  controllers: [ProblemsController, AdminProblemsController],
  providers: [ContentService, SolvedService],
  exports: [ContentService, SolvedService],
})
export class ProblemsModule {}

@Module({
  imports: [ProblemsModule],
  controllers: [SubmissionsController, RunnerCallbackController, WorkspaceController],
  providers: [SubmissionsService, RunnerQueueService, FlagsService],
  exports: [SubmissionsService, FlagsService],
})
export class SubmissionsModule implements OnModuleInit {
  constructor(
    @Inject(SolvedService) private readonly solved: SolvedService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(DataExportService) private readonly exporter: DataExportService,
  ) {}

  onModuleInit() {
    const db = this.prisma.client;
    this.exporter.register('submissions', (userId) =>
      db.submission.findMany({
        where: { userId },
        select: {
          problem: { select: { slug: true } },
          language: true,
          kind: true,
          verdict: true,
          code: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
    );
    this.exporter.register('drafts', (userId) =>
      db.draft.findMany({
        where: { userId },
        select: {
          problem: { select: { slug: true } },
          language: true,
          code: true,
          updatedAt: true,
        },
      }),
    );
    this.exporter.register('flagSubmissions', (userId) =>
      db.flagSubmission.findMany({
        where: { userId },
        select: { problem: { select: { slug: true } }, correct: true, createdAt: true },
      }),
    );
    // A problem is solved once the user has an Accepted practice submission for it.
    this.solved.resolver = async (userId) => {
      const [code, flags] = await Promise.all([
        db.submission.findMany({
          where: { userId, kind: 'submit', verdict: 'accepted', attemptId: null },
          distinct: ['problemId'],
          select: { problemId: true },
        }),
        db.flagSubmission.findMany({
          where: { userId, correct: true },
          distinct: ['problemId'],
          select: { problemId: true },
        }),
      ]);
      return new Set([...code, ...flags].map((r) => r.problemId));
    };
  }
}

@Module({
  imports: [ProblemsModule, SubmissionsModule],
  controllers: [PracticeController, CoursesController, EngagementController],
  providers: [PracticeService],
  exports: [PracticeService],
})
export class PracticeModule implements OnModuleInit {
  constructor(
    @Inject(PracticeService) private readonly practice: PracticeService,
    @Inject(SubmissionsService) private readonly submissions: SubmissionsService,
    @Inject(DataExportService) private readonly exporter: DataExportService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(EngagementService) private readonly engagement: EngagementService,
  ) {}

  onModuleInit() {
    this.submissions.hooks.push({ onFinished: (sub) => this.practice.onSubmissionFinished(sub) });
    // Spec 8: XP for first solves, streak days and the daily bonus.
    this.practice.hooks.push({
      onSolved: (userId, problem, info) =>
        this.engagement.onFirstSolve(userId, problem, info.hintsUsed, info.at),
    });
    this.submissions.hooks.push({
      onFinished: async (sub) => {
        if (sub.kind !== 'submit' || sub.verdict !== 'accepted') return;
        await this.engagement.onSolved(sub.userId, sub.problemId, sub.finishedAt ?? new Date(), {
          practice: !sub.attemptId,
        });
      },
    });
    const db = this.prisma.client;
    this.exporter.register('lessons', (userId) =>
      db.lessonProgress.findMany({
        where: { userId },
        select: {
          lesson: { select: { slug: true, course: { select: { slug: true } } } },
          completedAt: true,
        },
      }),
    );
    this.exporter.register('mastery', (userId) =>
      db.mastery.findMany({ where: { userId }, select: { tag: true, level: true, points: true } }),
    );
    this.exporter.register('notes', (userId) =>
      db.note.findMany({
        where: { userId },
        select: { problem: { select: { slug: true } }, text: true, updatedAt: true },
      }),
    );
    this.exporter.register('bookmarks', (userId) =>
      db.bookmark.findMany({
        where: { userId },
        select: { problem: { select: { slug: true } }, createdAt: true },
      }),
    );
    this.exporter.register('xp', (userId) =>
      db.xpEvent.findMany({
        where: { userId },
        select: { amount: true, reason: true, at: true },
        orderBy: { at: 'asc' },
      }),
    );
    this.exporter.register('streak', (userId) =>
      db.streak.findUnique({
        where: { userId },
        select: { current: true, longest: true, lastDay: true, frozenDays: true },
      }),
    );
    this.exporter.register('placement', (userId) =>
      db.placementResult.findUnique({
        where: { userId },
        select: { skipped: true, score: true, total: true, answers: true, createdAt: true },
      }),
    );
    this.exporter.register('hints', (userId) =>
      db.hintUse.findMany({
        where: { userId },
        select: { problem: { select: { slug: true } }, level: true, createdAt: true },
      }),
    );
  }
}

@Module({
  imports: [ProblemsModule, SubmissionsModule],
  controllers: [AttemptsController, AdminAttemptsController],
  providers: [AttemptsService],
  exports: [AttemptsService],
})
export class AttemptsModule implements OnModuleInit {
  constructor(
    @Inject(AttemptsService) private readonly attempts: AttemptsService,
    @Inject(SubmissionsService) private readonly submissions: SubmissionsService,
    @Inject(DataExportService) private readonly exporter: DataExportService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {}

  onModuleInit() {
    this.submissions.hooks.push({ onFinished: (sub) => this.attempts.onSubmissionFinished(sub) });
    this.exporter.register('verifiedAttempts', (userId) =>
      this.prisma.client.attempt.findMany({
        where: { userId },
        select: {
          id: true,
          problem: { select: { slug: true } },
          language: true,
          status: true,
          startedAt: true,
          submittedAt: true,
          score: true,
          integrityScore: true,
          followUps: { select: { prompt: true, answer: true, correct: true, answeredMs: true } },
          appeal: { select: { reason: true, outcome: true } },
        },
        orderBy: { startedAt: 'desc' },
      }),
    );
  }
}

@Module({
  imports: [
    InfraModule,
    CoreModule,
    AccountsModule,
    AdminModule,
    ProblemsModule,
    SubmissionsModule,
    PracticeModule,
    AttemptsModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_FILTER, useClass: ErrorFilter },
    { provide: APP_INTERCEPTOR, useClass: ResponseSchemaInterceptor },
    // Order matters: throttle first, then CSRF, then authentication/authorization.
    { provide: APP_GUARD, useClass: RateLimitGuard },
    { provide: APP_GUARD, useClass: CsrfGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(SessionMiddleware).forRoutes('*path');
  }
}
