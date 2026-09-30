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
  ],
  exports: [
    AuditService,
    EmailService,
    RateLimitService,
    SessionService,
    PasswordService,
    MeService,
    DataExportService,
  ],
})
export class CoreModule {}

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
  controllers: [SubmissionsController, RunnerCallbackController],
  providers: [SubmissionsService, RunnerQueueService],
  exports: [SubmissionsService],
})
export class SubmissionsModule implements OnModuleInit {
  constructor(
    @Inject(SolvedService) private readonly solved: SolvedService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {}

  onModuleInit() {
    // A problem is solved once the user has an Accepted practice submission for it.
    this.solved.resolver = async (userId) => {
      const rows = await this.prisma.client.submission.findMany({
        where: { userId, kind: 'submit', verdict: 'accepted', attemptId: null },
        distinct: ['problemId'],
        select: { problemId: true },
      });
      return new Set(rows.map((r) => r.problemId));
    };
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
