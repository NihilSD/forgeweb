import {
  type CallHandler,
  type ExecutionContext,
  Inject,
  Injectable,
  type NestInterceptor,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { map, type Observable } from 'rxjs';
import type { z } from 'zod';

const RESPONSE_SCHEMA = 'forge:response-schema';

/**
 * Declares the response schema of a route. The interceptor parses every response with it,
 * which strips unknown keys: a stray hidden field on a DB row can never reach the client.
 */
export const ResponseSchema = (schema: z.ZodType) => SetMetadata(RESPONSE_SCHEMA, schema);

@Injectable()
export class ResponseSchemaInterceptor implements NestInterceptor {
  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const schema = this.reflector.get<z.ZodType | undefined>(RESPONSE_SCHEMA, context.getHandler());
    if (!schema) return next.handle();
    return next.handle().pipe(map((data) => schema.parse(data)));
  }
}
