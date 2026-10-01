'use client';
import type { BillingStatus, InvoiceList } from '@forge/shared';
import {
  Alert,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@forge/ui';
import Link from 'next/link';
import { useState } from 'react';
import { api, ApiClientError } from '@/lib/api-client';

const money = (cents: number, currency: string) =>
  new Intl.NumberFormat('en-IE', { style: 'currency', currency: currency.toUpperCase() }).format(
    cents / 100,
  );
const date = (iso: string) => new Date(iso).toISOString().slice(0, 10);

export function BillingSection({
  status,
  invoices,
  checkout,
}: {
  status: BillingStatus | null;
  invoices: InvoiceList | null;
  checkout: string | undefined;
}) {
  const [error, setError] = useState<string | null>(null);
  const sub = status?.subscription;
  async function portal() {
    setError(null);
    try {
      const { url } = await api<{ url: string }>('/billing/portal', { method: 'POST' });
      window.location.assign(url);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Could not open billing.');
    }
  }
  return (
    <>
      {checkout === 'success' ? (
        <Alert variant="success">
          Thanks! Your payment went through. Pro turns on as soon as Stripe confirms it, usually
          within a few seconds.
        </Alert>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle>Plan</CardTitle>
          <CardDescription data-testid="billing-plan">
            {status?.plan === 'pro' ? 'Forge Pro' : 'Forge Free'}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm">
          {sub ? (
            <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-1">
              <dt className="text-muted-foreground">Status</dt>
              <dd>{sub.status.replace('_', ' ')}</dd>
              {sub.interval ? (
                <>
                  <dt className="text-muted-foreground">Billing</dt>
                  <dd>{sub.interval === 'year' ? 'Yearly' : 'Monthly'}</dd>
                </>
              ) : null}
              {sub.currentPeriodEnd ? (
                <>
                  <dt className="text-muted-foreground">
                    {sub.cancelAtPeriodEnd ? 'Ends on' : 'Renews on'}
                  </dt>
                  <dd>{date(sub.currentPeriodEnd)}</dd>
                </>
              ) : null}
            </dl>
          ) : null}
          {sub?.graceUntil ? (
            <Alert>
              Your last payment didn&apos;t go through. Pro stays on until {date(sub.graceUntil)}.
              Update your payment method to keep it.
            </Alert>
          ) : null}
          {error ? <Alert variant="destructive">{error}</Alert> : null}
          <div className="flex gap-2">
            {status?.hasCustomer ? (
              <Button variant="outline" onClick={() => void portal()}>
                Manage subscription and payment
              </Button>
            ) : null}
            {status?.plan !== 'pro' ? (
              <Button asChild>
                <Link href="/pricing">See Pro</Link>
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Invoices</CardTitle>
        </CardHeader>
        <CardContent>
          {!invoices || invoices.items.length === 0 ? (
            <p className="text-sm text-muted-foreground">No invoices yet.</p>
          ) : (
            <ul className="grid gap-2 text-sm">
              {invoices.items.map((i) => (
                <li key={i.id} className="flex flex-wrap items-center gap-3">
                  <span>{date(i.date)}</span>
                  <span className="font-mono">{i.number ?? i.id}</span>
                  <span>{money(i.total, i.currency)}</span>
                  <span className="text-muted-foreground">{i.status}</span>
                  {i.pdfUrl ? (
                    <a href={i.pdfUrl} className="underline" rel="noopener noreferrer">
                      PDF
                    </a>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </>
  );
}
