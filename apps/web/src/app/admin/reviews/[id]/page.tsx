import type { Replay } from '@forge/shared';
import { Alert } from '@forge/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ReplayViewer } from '@/components/replay/replay-viewer';
import { apiServer } from '@/lib/api-server';
import { requireMe } from '@/lib/session';
import { DecisionForm } from './decision-form';

export const metadata: Metadata = { title: 'Admin · Review attempt' };

export default async function ReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireMe();
  if (me.role !== 'moderator' && me.role !== 'superadmin') redirect('/dashboard');
  const { id } = await params;
  const res = await apiServer<Replay & { error?: { message: string } }>(
    `/admin/attempts/${encodeURIComponent(id)}/replay`,
  );
  if (!res || res.status !== 200)
    return (
      <div className="mx-auto max-w-4xl px-4 py-10">
        <Alert variant="destructive">
          {res?.data.error?.message ?? 'Could not load the replay.'}
        </Alert>
      </div>
    );
  const r = res.data;
  return (
    <div className="mx-auto grid max-w-5xl gap-6 px-4 py-10">
      <p className="text-sm text-muted-foreground">
        <Link href="/admin/reviews" className="underline">
          Review queue
        </Link>
      </p>
      <h1 className="text-2xl font-semibold tracking-tight">{r.problemTitle}</h1>
      <section aria-labelledby="signals" className="grid gap-2">
        <h2 id="signals" className="font-semibold">
          Integrity score: {r.integrityScore ?? '—'}
        </h2>
        <table className="w-full max-w-2xl text-sm">
          <thead className="text-left text-muted-foreground">
            <tr>
              <th className="py-1 font-medium">Signal</th>
              <th className="font-medium">Value</th>
              <th className="font-medium">Effect</th>
            </tr>
          </thead>
          <tbody>
            {(r.signals ?? []).map((s) => (
              <tr key={s.id} className="border-t">
                <td className="py-1">{s.label}</td>
                <td className="font-mono">{s.value}</td>
                <td className={s.effect < 0 ? 'text-verdict-wrong' : undefined}>
                  {s.effect > 0 ? `+${s.effect}` : s.effect}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <ReplayViewer replay={r} />
      {r.status === 'review' || r.status === 'appealed' ? (
        <DecisionForm attemptId={r.attemptId} />
      ) : (
        <Alert>This attempt is not waiting for a decision.</Alert>
      )}
    </div>
  );
}
