import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  Inject,
  Logger,
  Optional,
} from '@nestjs/common';
import { ErrorCode } from '@forge/shared';
import type { Response } from 'express';
import { MonitoringService } from '../monitoring/monitoring.service.js';
import { ApiError } from './api-error.js';

const HTTP_CODES: Record<number, ErrorCode> = {
  400: ErrorCode.BAD_REQUEST,
  401: ErrorCode.UNAUTHENTICATED,
  403: ErrorCode.FORBIDDEN,
  404: ErrorCode.NOT_FOUND,
  413: ErrorCode.PAYLOAD_TOO_LARGE,
  429: ErrorCode.RATE_LIMITED,
};

@Catch()
export class ErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger('ErrorFilter');

  constructor(
    @Optional() @Inject(MonitoringService) private readonly monitoring?: MonitoringService,
  ) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    const { status, body } = toErrorBody(exception);
    // Deliberate 503s (SERVICE_UNAVAILABLE) are reported by their own checks, not counted here.
    if (status >= 500 && !(exception instanceof ApiError)) {
      this.logger.error(exception instanceof Error ? exception.stack : String(exception));
      void this.monitoring?.recordServerError().catch(() => undefined);
    }
    if (!res.headersSent) res.status(status).json(body);
  }
}

export function toErrorBody(exception: unknown) {
  if (exception instanceof ApiError) {
    return {
      status: exception.status,
      body: {
        error: {
          code: exception.code,
          message: exception.message,
          ...(exception.details !== undefined ? { details: exception.details } : {}),
        },
      },
    };
  }
  // body-parser errors (oversized or malformed JSON)
  const maybe = exception as { type?: string; status?: number } | null;
  if (maybe && maybe.type === 'entity.too.large') {
    return {
      status: 413,
      body: { error: { code: ErrorCode.PAYLOAD_TOO_LARGE, message: 'Request body is too large.' } },
    };
  }
  if (maybe && maybe.type === 'entity.parse.failed') {
    return {
      status: 400,
      body: { error: { code: ErrorCode.BAD_REQUEST, message: 'Request body is not valid JSON.' } },
    };
  }
  if (exception instanceof HttpException) {
    const status = exception.getStatus();
    const code = HTTP_CODES[status] ?? (status >= 500 ? ErrorCode.INTERNAL : ErrorCode.BAD_REQUEST);
    const message = status === 404 ? 'Not found.' : exception.message;
    return { status, body: { error: { code, message } } };
  }
  return {
    status: 500,
    body: {
      error: {
        code: ErrorCode.INTERNAL,
        message: 'Something went wrong on our side. Please try again.',
      },
    },
  };
}
