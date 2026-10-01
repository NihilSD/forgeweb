import type { PrismaClient } from '@forge/db';

/** Spec 3.2: replays are deleted after 12 months unless the user keeps them public. */
export const REPLAY_RETENTION_DAYS = 365;

/** Deletes the recorded events of finished attempts past retention. Returns how many. */
export async function purgeExpiredReplays(db: PrismaClient, now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - REPLAY_RETENTION_DAYS * 86_400_000);
  const due = await db.attempt.findMany({
    where: { finishedAt: { lt: cutoff }, replayPublic: false, replayDeletedAt: null },
    select: { id: true },
  });
  for (const { id } of due) {
    await db.$transaction([
      db.attemptEvent.deleteMany({ where: { attemptId: id } }),
      db.attempt.update({ where: { id }, data: { replayDeletedAt: now } }),
    ]);
  }
  return due.length;
}
