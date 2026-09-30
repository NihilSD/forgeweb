import { resolve } from 'node:path';
import { findPackages, generateInstance, loadModule } from '@forge/problem-kit';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { totpAt } from '../src/auth/totp.js';
import { ContentService } from '../src/problems/content.service.js';
import { importProblems } from '../src/problems/importer.js';
import { createTestContext, createUser, type TestContext } from './helpers.js';

const ROOT = resolve(import.meta.dirname, '../../../content/problems');
let ctx: TestContext;

beforeAll(async () => {
  ctx = await createTestContext();
});
afterAll(async () => {
  await ctx.close();
});
beforeEach(async () => {
  await ctx.reset();
  await importProblems(ctx.prisma, ROOT, { publishDrafts: true });
});

async function admin() {
  const a = await createUser(ctx);
  await ctx.prisma.user.update({ where: { id: a.user.id }, data: { role: 'content_editor' } });
  const setup = await a.client.post('/auth/2fa/setup');
  await a.client.post('/auth/2fa/enable', { code: totpAt(setup.body.secret, Date.now()) });
  return a;
}

describe('import', () => {
  it('is idempotent', async () => {
    const again = await importProblems(ctx.prisma, ROOT, { publishDrafts: true });
    expect(again.created).toEqual([]);
    expect(again.updated).toEqual([]);
    const total = (await findPackages(ROOT)).length;
    expect(again.unchanged.length).toBe(total);
    expect(await ctx.prisma.problemVersion.count()).toBe(total);
    expect(await ctx.prisma.track.count()).toBe(4);
  });

  it('refuses --publish-drafts in production', async () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      await expect(importProblems(ctx.prisma, ROOT, { publishDrafts: true })).rejects.toThrow(
        /development only/,
      );
    } finally {
      process.env.NODE_ENV = prev;
    }
  });
});

describe('library', () => {
  it('lists published problems with filters and search', async () => {
    const c = ctx.client();
    const all = await c.get('/problems?limit=100');
    expect(all.status).toBe(200);
    expect(all.body.items).toHaveLength(
      await ctx.prisma.problem.count({ where: { listed: true } }),
    );
    const sql = await c.get('/problems?track=sql');
    expect(sql.body.items.map((p: { slug: string }) => p.slug)).toEqual(['city-top-customers']);
    const easy = await c.get('/problems?difficulty=easy');
    expect(easy.body.items.every((p: { difficulty: string }) => p.difficulty === 'easy')).toBe(
      true,
    );
    const tag = await c.get('/problems?tag=sliding-window');
    expect(tag.body.items.map((p: { slug: string }) => p.slug)).toEqual(['budget-window']);
    const search = await c.get('/problems?q=restock');
    expect(search.body.items.map((p: { slug: string }) => p.slug)).toEqual(['fix-restock-report']);
    const tracks = await c.get('/tracks');
    expect(
      tracks.body.items.find((t: { slug: string }) => t.slug === 'algorithms').problemCount,
    ).toBe(
      await ctx.prisma.problem.count({ where: { listed: true, track: { slug: 'algorithms' } } }),
    );
  });

  it('paginates with a cursor', async () => {
    const c = ctx.client();
    const listed = await ctx.prisma.problem.count({ where: { listed: true } });
    const seen: string[] = [];
    let cursor: string | null = null;
    do {
      const page = await c.get(`/problems?limit=4${cursor ? `&cursor=${cursor}` : ''}`);
      expect(page.body.items.length).toBeLessThanOrEqual(4);
      seen.push(...page.body.items.map((p: { slug: string }) => p.slug));
      cursor = page.body.nextCursor;
    } while (cursor);
    expect(seen).toHaveLength(listed);
    expect(new Set(seen).size).toBe(listed);
  });

  it('rejects invalid filters', async () => {
    const res = await ctx.client().get('/problems?difficulty=impossible');
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    const big = await ctx.client().get('/problems?limit=1000');
    expect(big.status).toBe(400);
  });

  it('hides unpublished and competitive-only problems', async () => {
    await ctx.prisma.problem.update({
      where: { slug: 'budget-window' },
      data: { status: 'draft' },
    });
    await ctx.prisma.problem.update({
      where: { slug: 'fix-average-rating' },
      data: { mode: 'competitive' },
    });
    const c = ctx.client();
    const slugs = (await c.get('/problems')).body.items.map((p: { slug: string }) => p.slug);
    expect(slugs).not.toContain('budget-window');
    expect(slugs).not.toContain('fix-average-rating');
    expect((await c.get('/problems/budget-window')).status).toBe(404);
    expect((await c.get('/problems/fix-average-rating')).status).toBe(404);
  });

  it('renders a practice instance with a filled statement and starters', async () => {
    const res = await ctx.client().get('/problems/two-sum-orders');
    expect(res.status).toBe(200);
    expect(res.body.statement).not.toMatch(/\{\{/);
    expect(res.body.starters.python).toContain('def match_orders');
    expect(res.body.visibleTests.length).toBeGreaterThan(0);
    expect(res.body.hiddenTestCount).toBeGreaterThan(0);
    expect(res.body.hintCount).toBe(4);
  });

  it('gives each user a stable instance', async () => {
    const a = await createUser(ctx);
    const b = await createUser(ctx);
    const a1 = await a.client.get('/problems/two-sum-orders');
    const a2 = await a.client.get('/problems/two-sum-orders');
    const b1 = await b.client.get('/problems/two-sum-orders');
    expect(a1.body.statement).toBe(a2.body.statement);
    expect(a1.body.statement).not.toBe(b1.body.statement);
  });
});

describe('secrets never leave the server', () => {
  it('no endpoint returns hidden tests, reference solutions or package code', async () => {
    const editor = await admin();
    const user = await createUser(ctx);
    const content = ctx.app.get(ContentService);
    const problems = await ctx.prisma.problem.findMany({ include: { versions: true } });

    for (const p of problems) {
      const v = p.versions[0]!;
      const mod = await loadModule(v.moduleCode, v.packageHash);
      for (const [who, client, userId] of [
        ['anonymous', ctx.client(), null],
        ['user', user.client, user.user.id],
      ] as const) {
        const seed = content.practiceSeed(userId, p.id);
        const gen = generateInstance(mod, seed);
        const bodies = [
          JSON.stringify((await client.get(`/problems/${p.slug}`)).body),
          JSON.stringify((await client.get('/problems')).body),
          JSON.stringify((await editor.client.get('/admin/problems')).body),
          JSON.stringify((await editor.client.get(`/admin/problems/${p.id}`)).body),
        ].join('\n');
        for (const hidden of gen.suite.hidden) {
          const probe = JSON.stringify(hidden.args ?? hidden.setupSql);
          if (probe && probe.length > 12)
            expect(bodies, `${p.slug} hidden ${hidden.id} leaked to ${who}`).not.toContain(probe);
        }
        const starters = v.starters as Record<string, string>;
        for (const [lang, ref] of Object.entries(v.references as Record<string, string>)) {
          // Probe with the longest line that only the reference has (signatures are shared).
          const line = ref
            .split('\n')
            .filter(
              (l) =>
                l.trim().length > 15 &&
                !(starters[lang] ?? '').includes(l.trim()) &&
                !l.includes('{{'),
            )
            .sort((a, b) => b.length - a.length)[0];
          if (!line) continue;
          expect(bodies, `${p.slug} ${lang} reference leaked`).not.toContain(
            JSON.stringify(line.trim()).slice(1, -1),
          );
        }
        expect(bodies).not.toContain('moduleCode');
        expect(bodies).not.toContain(v.moduleCode.slice(0, 40));
        // Flag files contain the user's flag; they are served by a separate signed download.
        expect(bodies).not.toMatch(/FORGE\{[0-9a-f]{24}\}/);
      }
    }
  });
});

describe('admin publishing', () => {
  it('requires a content role with 2FA', async () => {
    const u = await createUser(ctx);
    expect((await u.client.get('/admin/problems')).status).toBe(403);
  });

  it('only publishes human-approved problems', async () => {
    const editor = await admin();
    const p = await ctx.prisma.problem.findUniqueOrThrow({ where: { slug: 'budget-window' } });
    await editor.client.post(`/admin/problems/${p.id}/unpublish`);
    expect((await ctx.client().get('/problems/budget-window')).status).toBe(404);

    const refused = await editor.client.post(`/admin/problems/${p.id}/publish`);
    expect(refused.status).toBe(409);

    await ctx.prisma.problem.update({ where: { id: p.id }, data: { reviewStatus: 'approved' } });
    const ok = await editor.client.post(`/admin/problems/${p.id}/publish`);
    expect(ok.status).toBe(200);
    expect(ok.body.status).toBe('published');
    expect((await ctx.client().get('/problems/budget-window')).status).toBe(200);
    expect(
      await ctx.prisma.auditLog.count({ where: { action: 'problem.published', target: p.id } }),
    ).toBe(1);
  });
});
