'use client';
import { Alert, Button } from '@forge/ui';
import Link from 'next/link';
import { useState } from 'react';
import { api, ApiClientError } from '@/lib/api-client';

/** One click, no sign-in needed: the signed token in the link is enough. */
export function UnsubscribeForm({ token }: { token: string }) {
  const [state, setState] = useState<'idle' | 'pending' | 'done'>('idle');
  const [error, setError] = useState<string | null>(null);
  if (state === 'done')
    return (
      <Alert variant="success">
        You&apos;re unsubscribed from the weekly progress email. You can turn it back on in{' '}
        <Link href="/settings" className="underline">
          Settings
        </Link>
        .
      </Alert>
    );
  return (
    <div className="grid gap-3">
      <p>Stop receiving the weekly summary of your progress on Forge?</p>
      {error ? <Alert variant="destructive">{error}</Alert> : null}
      <Button
        className="w-fit"
        disabled={!token || state === 'pending'}
        onClick={async () => {
          setState('pending');
          setError(null);
          try {
            await api(`/email/unsubscribe?token=${encodeURIComponent(token)}`, { method: 'POST' });
            setState('done');
          } catch (err) {
            setError(err instanceof ApiClientError ? err.message : 'Something went wrong.');
            setState('idle');
          }
        }}
      >
        Unsubscribe
      </Button>
    </div>
  );
}
