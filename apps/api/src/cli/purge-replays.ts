/**
 * Deletes verified-attempt replays older than 12 months (spec 3.2). Run daily from the scheduler:
 *
 *   pnpm --filter @forge/api replays:purge
 */
import '../config/load-dotenv.js';
import { createPrismaClient } from '@forge/db';
import { purgeExpiredReplays } from '../attempts/replay-retention.js';

const prisma = createPrismaClient();
try {
  const count = await purgeExpiredReplays(prisma);
  console.info(`purged ${count} replay(s)`);
} finally {
  await prisma.$disconnect();
}
