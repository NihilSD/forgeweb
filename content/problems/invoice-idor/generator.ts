import type { GenContext, Instance } from '@forge/problem-kit';

const ROUTES = `const express = require('express');
const { requireLogin } = require('./auth');
const db = require('./db');

const router = express.Router();

// List the signed-in customer's invoices.
router.get('/api/invoices', requireLogin, async (req, res) => {
  const invoices = await db.invoices.findMany({ where: { owner: req.user.id } });
  res.json(invoices);
});

// Show one invoice.
router.get('/api/invoices/:id', requireLogin, async (req, res) => {
  const invoice = await db.invoices.findUnique({ where: { id: Number(req.params.id) } });
  if (!invoice) return res.status(404).json({ error: 'not_found' });
  res.json(invoice);
});

module.exports = router;
`;

export default function generate({ rng, flag }: GenContext): Instance {
  const users = rng.sample(['u-ana', 'u-ben', 'u-cleo', 'u-dev', 'u-emi', 'u-finn', 'u-gus'], 5);
  let nextId = rng.int(1000, 5000);
  const invoices = users.flatMap((owner) =>
    Array.from({ length: rng.int(2, 4) }, () => ({
      id: nextId++,
      owner,
      amount_cents: rng.int(500, 250_000),
      currency: rng.pick(['EUR', 'GBP', 'USD']),
      reference: `FORGE{${rng.hex(12)}}`,
    })),
  );
  const leaked = rng.pick(invoices);
  leaked.reference = flag ?? 'FORGE{flag-shown-only-to-signed-in-users}';
  const viewer = rng.pick(users.filter((u) => u !== leaked.owner));

  interface Entry {
    t: number;
    user: string;
    path: string;
    status: number;
  }
  const entries: Entry[] = [];
  for (const inv of invoices) {
    for (let n = rng.int(1, 3); n > 0; n--) {
      const t = rng.int(0, 86_000);
      entries.push({ t, user: inv.owner, path: '/api/invoices', status: 200 });
      entries.push({
        t: t + rng.int(2, 40),
        user: inv.owner,
        path: `/api/invoices/${inv.id}`,
        status: 200,
      });
    }
  }
  // A probe for an id that does not exist (404), then the real leak.
  const t = rng.int(0, 80_000);
  entries.push({
    t,
    user: viewer,
    path: `/api/invoices/${nextId + rng.int(50, 900)}`,
    status: 404,
  });
  entries.push({
    t: t + rng.int(3, 30),
    user: viewer,
    path: `/api/invoices/${leaked.id}`,
    status: 200,
  });
  entries.sort((a, b) => a.t - b.t);

  const iso = (s: number) =>
    `2026-05-02T${[Math.floor(s / 3600), Math.floor(s / 60) % 60, s % 60].map((n) => String(n).padStart(2, '0')).join(':')}Z`;
  const log = entries
    .map((e) =>
      JSON.stringify({ ts: iso(e.t), user: e.user, method: 'GET', path: e.path, status: e.status }),
    )
    .join('\n');
  return {
    params: { org: rng.pick(['Northwind Labs', 'Blue Owl Security', 'Kestrel Systems']) },
    files: {
      'invoices.js': ROUTES,
      'access.log': `${log}\n`,
      'invoices.json': `${JSON.stringify(rng.shuffle(invoices), null, 2)}\n`,
    },
    data: { leaked: leaked.id, viewer },
  };
}
