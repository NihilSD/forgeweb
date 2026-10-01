'use client';
import type { BillingInterval } from '@forge/shared';
import { Alert, Button } from '@forge/ui';
import Link from 'next/link';
import { useState } from 'react';
import { api, ApiClientError } from '@/lib/api-client';

/** Starts Stripe Checkout. The API decides everything (price, tax, eligibility). */
export function UpgradeButtons({
  signedIn,
  plan,
  available,
}: {
  signedIn: boolean;
  plan: string;
  available: boolean;
}) {
  const [pending, setPending] = useState<BillingInterval | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (!signedIn)
    return (
      <Button asChild className="w-fit">
        <Link href="/signup">Create a free account to upgrade</Link>
      </Button>
    );
  if (plan === 'pro')
    return (
      <Button asChild variant="outline" className="w-fit">
        <Link href="/settings?tab=billing">You have Pro: manage your subscription</Link>
      </Button>
    );
  async function go(interval: BillingInterval) {
    setPending(interval);
    setError(null);
    try {
      const { url } = await api<{ url: string }>('/billing/checkout', {
        method: 'POST',
        body: { interval },
      });
      window.location.assign(url);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Could not start checkout.');
      setPending(null);
    }
  }
  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap gap-2">
        <Button disabled={!available || pending !== null} onClick={() => void go('month')}>
          {pending === 'month' ? 'Opening checkout…' : 'Upgrade monthly'}
        </Button>
        <Button
          variant="outline"
          disabled={!available || pending !== null}
          onClick={() => void go('year')}
        >
          {pending === 'year' ? 'Opening checkout…' : 'Upgrade yearly'}
        </Button>
      </div>
      {!available ? (
        <p className="text-xs text-muted-foreground">Payments aren&apos;t available yet.</p>
      ) : null}
      {error ? <Alert variant="destructive">{error}</Alert> : null}
    </div>
  );
}
