import { type PipeTransform } from '@nestjs/common';
import { ErrorCode } from '@forge/shared';
import type { z } from 'zod';
import { ApiError } from './api-error.js';

export function parseOrThrow<T extends z.ZodType>(schema: T, value: unknown): z.output<T> {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new ApiError(ErrorCode.VALIDATION_FAILED, 'Some fields are invalid.', {
      issues: result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    });
  }
  return result.data;
}

/** Validates a request part: `@Body(new ZodPipe(schema)) body: Input`. */
export class ZodPipe<T extends z.ZodType> implements PipeTransform<unknown, z.output<T>> {
  constructor(private readonly schema: T) {}
  transform(value: unknown): z.output<T> {
    return parseOrThrow(this.schema, value);
  }
}
