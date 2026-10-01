/**
 * Grants a role to an existing account (bootstrap the first admin):
 *
 *   pnpm --filter @forge/api admin:grant-role --email you@example.com --role superadmin
 *   docker compose run --rm tools node apps/api/dist/cli/grant-role.js --email … --role …
 *
 * Admin roles also need two-factor authentication: the user enrols TOTP in Settings → Security
 * before the admin panel opens.
 */
import '../config/load-dotenv.js';
import { parseArgs } from 'node:util';
import { createPrismaClient } from '@forge/db';
import type { UserRole } from '@forge/shared';
import { grantRole } from '../admin/grant-role.js';

const { values } = parseArgs({
  options: { email: { type: 'string' }, role: { type: 'string' } },
});
if (!values.email || !values.role) {
  console.error(
    'usage: grant-role --email <email> --role <user|content_editor|moderator|support|superadmin>',
  );
  process.exit(2);
}
const prisma = createPrismaClient();
try {
  const r = await grantRole(prisma, values.email, values.role as UserRole);
  console.info(`role ${r.from} -> ${r.to} for user ${r.id}; their sessions were revoked.`);
} catch (err) {
  console.error((err as Error).message);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
