import { Module } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { ErrorFilter } from './common/error.filter.js';
import { ResponseSchemaInterceptor } from './common/response-schema.js';
import { HealthController } from './health/health.controller.js';
import { InfraModule } from './infra/infra.module.js';

@Module({
  imports: [InfraModule],
  controllers: [HealthController],
  providers: [
    { provide: APP_FILTER, useClass: ErrorFilter },
    { provide: APP_INTERCEPTOR, useClass: ResponseSchemaInterceptor },
  ],
})
export class AppModule {}
