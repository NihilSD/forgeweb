'use client';
import type { Attempt } from '@forge/shared';
import { Alert, Button, Label } from '@forge/ui';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AttemptStatusBadge } from '@/components/attempt-status-badge';
import { api, ApiClientError } from '@/lib/api-client';

const EXPLAIN: Record<string, string> = {
  verified: 'Your result is verified and counts on your profile.',
  unverified:
    "Your solution was accepted, but the session didn't give us enough confidence to verify it. The result is shown, not counted. You can appeal.",
  review: 'A Forge moderator will watch the replay and decide. Nobody is banned by a machine.',
  appealed: 'Your appeal is waiting for a moderator. They will watch the replay and decide.',
  expired: 'Time ran out before an accepted submission.',
};

export function AttemptResult({
  attempt,
  onChange,
}: {
  attempt: Attempt;
  onChange: () => Promise<Attempt>;
}) {
  useEffect(() => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
  }, []);
  return (
    <div className="mx-auto grid max-w-2xl gap-6 px-4 py-10" data-testid="attempt-result">
      <header className="grid gap-2">
        <p className="text-sm text-muted-foreground">
          <Link href="/verified" className="underline">
            Verified challenges
          </Link>
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">{attempt.problemTitle}</h1>
        <AttemptStatusBadge status={attempt.status} className="w-fit text-sm" />
        <p>{EXPLAIN[attempt.status]}</p>
      </header>
      <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-2 text-sm">
        <dt className="text-muted-foreground">Tests passed</dt>
        <dd>{attempt.score === null ? '—' : `${attempt.score}%`}</dd>
        <dt className="text-muted-foreground">Integrity score</dt>
        <dd>{attempt.integrityScore === null ? '—' : `${attempt.integrityScore} / 100`}</dd>
        <dt className="text-muted-foreground">Follow-up questions</dt>
        <dd>
          {attempt.followUps.total
            ? `${attempt.followUps.correct} of ${attempt.followUps.total} correct`
            : '—'}
        </dd>
      </dl>
      {attempt.appeal ? (
        <Alert>
          Appeal {attempt.appeal.status === 'pending' ? 'pending' : attempt.appeal.status}:{' '}
          {attempt.appeal.reason}
        </Alert>
      ) : null}
      {attempt.canAppeal ? <AppealForm attemptId={attempt.id} onDone={onChange} /> : null}
      <p className="flex gap-4 text-sm">
        <Link href={`/attempts/${attempt.id}/replay`} className="underline">
          Watch your replay
        </Link>
        <Link href="/attempts" className="underline">
          All your attempts
        </Link>
      </p>
    </div>
  );
}

function AppealForm({ attemptId, onDone }: { attemptId: string; onDone: () => Promise<Attempt> }) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  return (
    <form
      className="grid gap-2 rounded-lg border p-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setPending(true);
        setError(null);
        try {
          await api(`/attempts/${attemptId}/appeal`, { method: 'POST', body: { reason } });
          await onDone();
        } catch (err) {
          setError(err instanceof ApiClientError ? err.message : 'Could not send the appeal.');
        } finally {
          setPending(false);
        }
      }}
    >
      <Label htmlFor="appeal">Appeal this result</Label>
      <p className="text-xs text-muted-foreground">
        Tell the moderator what happened (20–2000 characters). They will watch the replay.
      </p>
      <textarea
        id="appeal"
        className="min-h-28 rounded-md border border-input bg-background p-2 text-sm"
        value={reason}
        maxLength={2000}
        onChange={(e) => setReason(e.target.value)}
      />
      {error ? <Alert variant="destructive">{error}</Alert> : null}
      <Button type="submit" className="w-fit" disabled={pending || reason.trim().length < 20}>
        Send appeal
      </Button>
    </form>
  );
}
