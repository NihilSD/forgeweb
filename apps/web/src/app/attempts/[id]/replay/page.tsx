import type { Replay } from '@forge/shared';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ReplayViewer } from '@/components/replay/replay-viewer';
import { apiServer } from '@/lib/api-server';
import { requireMe } from '@/lib/session';

export const metadata: Metadata = { title: 'Attempt replay' };

export default async function ReplayPage({ params }: { params: Promise<{ id: string }> }) {
  await requireMe();
  const { id } = await params;
  const res = await apiServer<Replay>(`/attempts/${encodeURIComponent(id)}/replay`);
  if (!res || res.status !== 200) notFound();
  return (
    <div className="mx-auto grid max-w-4xl gap-4 px-4 py-10">
      <p className="text-sm text-muted-foreground">
        <Link href={`/attempts/${id}`} className="underline">
          Back to the result
        </Link>
      </p>
      <h1 className="text-2xl font-semibold tracking-tight">Replay: {res.data.problemTitle}</h1>
      <p className="text-sm text-muted-foreground">
        Only you and Forge moderators can see this replay.
      </p>
      <ReplayViewer replay={res.data} />
    </div>
  );
}
