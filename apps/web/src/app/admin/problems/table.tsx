'use client';
import type { AdminProblem } from '@forge/shared';
import { Badge, Button, EmptyState } from '@forge/ui';
import { useState } from 'react';
import { FormError } from '@/components/form';
import { api, ApiClientError } from '@/lib/api-client';

export function AdminProblemsTable({ initial }: { initial: AdminProblem[] }) {
  const [items, setItems] = useState(initial);
  const [open, setOpen] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function act(p: AdminProblem, action: 'publish' | 'unpublish') {
    setError(null);
    try {
      const updated = await api<AdminProblem>(`/admin/problems/${p.id}/${action}`, {
        method: 'POST',
      });
      setItems((xs) => xs.map((x) => (x.id === p.id ? updated : x)));
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Something went wrong.');
    }
  }

  if (items.length === 0) {
    return (
      <EmptyState
        className="mt-6"
        title="No problems imported"
        description="Run pnpm problems:import to load content/problems."
      />
    );
  }
  return (
    <div className="mt-6 grid gap-3">
      <FormError message={error} />
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Problem</th>
              <th className="px-3 py-2">Version</th>
              <th className="px-3 py-2">Review</th>
              <th className="px-3 py-2">Validation</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((p) => (
              <tr key={p.id} className="border-t align-top">
                <td className="px-3 py-2">
                  <div className="font-medium">{p.title}</div>
                  <div className="text-xs text-muted-foreground">
                    {p.track} · {p.slug}
                  </div>
                  {open === p.id && p.validation ? (
                    <ul className="mt-2 grid gap-1 text-xs">
                      {p.validation.errors.map((e) => (
                        <li key={e} className="text-destructive">
                          error: {e}
                        </li>
                      ))}
                      {p.validation.warnings.map((w) => (
                        <li key={w} className="text-muted-foreground">
                          warning: {w}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </td>
                <td className="px-3 py-2">v{p.version}</td>
                <td className="px-3 py-2">
                  <Badge variant={p.reviewStatus === 'approved' ? 'success' : 'warning'}>
                    {p.reviewStatus.replace('_', ' ')}
                  </Badge>
                </td>
                <td className="px-3 py-2">
                  {p.validation ? (
                    <button
                      className="underline"
                      onClick={() => setOpen(open === p.id ? null : p.id)}
                    >
                      {p.validation.ok ? 'passed' : `${p.validation.errors.length} errors`}
                    </button>
                  ) : (
                    <span className="text-muted-foreground">not validated</span>
                  )}
                </td>
                <td className="px-3 py-2 capitalize">{p.status}</td>
                <td className="px-3 py-2 text-right">
                  {p.status === 'published' ? (
                    <Button size="sm" variant="outline" onClick={() => void act(p, 'unpublish')}>
                      Unpublish
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      onClick={() => void act(p, 'publish')}
                      disabled={p.reviewStatus !== 'approved'}
                    >
                      Publish
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
