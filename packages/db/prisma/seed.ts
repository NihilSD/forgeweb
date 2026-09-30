// Seeds reference data. Idempotent: safe to run repeatedly.
import { createPrismaClient } from '../src/index.js';

const prisma = createPrismaClient();

async function main() {
  console.info('Seed complete');
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
