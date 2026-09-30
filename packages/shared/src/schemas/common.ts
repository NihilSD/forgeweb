import { z } from 'zod';
import { PAGE_SIZE_MAX } from '../constants.js';

export const cursorQuerySchema = z.object({
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(PAGE_SIZE_MAX).default(20),
});
export type CursorQuery = z.infer<typeof cursorQuerySchema>;

export const pageSchema = <T extends z.ZodType>(item: T) =>
  z.object({ items: z.array(item), nextCursor: z.string().nullable() });

export const healthSchema = z.object({
  status: z.enum(['ok', 'degraded']),
  version: z.string(),
  time: z.string(),
  checks: z.record(z.string(), z.enum(['ok', 'fail'])),
});
export type Health = z.infer<typeof healthSchema>;

export const uuidSchema = z.uuid();
export const idempotencyKeySchema = z.string().min(8).max(100);
