'use client';
import { Alert, Button, Label } from '@forge/ui';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api, ApiClientError } from '@/lib/api-client';

export function DecisionForm({ attemptId }: { attemptId: string }) {
  const router = useRouter();
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function decide(decision: 'verified' | 'unverified') {
    setPending(true);
    setError(null);
    try {
      await api(`/admin/attempts/${attemptId}/decision`, {
        method: 'POST',
        body: { decision, notes },
      });
      router.push('/admin/reviews');
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Could not save the decision.');
      setPending(false);
    }
  }

  return (
    <form
      className="grid max-w-2xl gap-2 rounded-lg border p-4"
      onSubmit={(e) => e.preventDefault()}
    >
      <Label htmlFor="notes">Decision notes</Label>
      <p className="text-xs text-muted-foreground">
        Say what you saw in the replay. The user sees the outcome, not these notes.
      </p>
      <textarea
        id="notes"
        className="min-h-24 rounded-md border border-input bg-background p-2 text-sm"
        value={notes}
        maxLength={2000}
        onChange={(e) => setNotes(e.target.value)}
      />
      {error ? <Alert variant="destructive">{error}</Alert> : null}
      <div className="flex gap-2">
        <Button
          type="button"
          disabled={pending || notes.trim().length < 5}
          onClick={() => void decide('verified')}
        >
          Mark verified
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={pending || notes.trim().length < 5}
          onClick={() => void decide('unverified')}
        >
          Keep unverified
        </Button>
      </div>
    </form>
  );
}
