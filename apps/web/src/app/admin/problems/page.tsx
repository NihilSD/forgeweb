import type { AdminProblem } from '@forge/shared';
import { Alert } from '@forge/ui';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { apiServer } from '@/lib/api-server';
import { requireMe } from '@/lib/session';
import { AdminProblemsTable } from './table';

export const metadata: Metadata = { title: 'Admin · Problems' };

export default async function AdminProblemsPage() {
  const me = await requireMe();
  if (me.role !== 'content_editor' && me.role !== 'superadmin') redirect('/dashboard');
  const res = await apiServer<{ items: AdminProblem[]; error?: { message: string } }>(
    '/admin/problems',
  );
  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Problems</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Content is imported from <code>content/problems</code>. Only packages marked{' '}
        <code>review: approved</code> can be published.
      </p>
      {res?.status === 200 ? (
        <AdminProblemsTable initial={res.data.items} />
      ) : (
        <Alert variant="destructive" className="mt-6">
          {res?.data.error?.message ?? 'Could not load problems.'}
        </Alert>
      )}
    </div>
  );
}
