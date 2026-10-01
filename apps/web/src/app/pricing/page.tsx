import type { BillingInterval, PriceList } from '@forge/shared';
import { Alert, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@forge/ui';
import { Check } from 'lucide-react';
import type { Metadata } from 'next';
import { apiServer } from '@/lib/api-server';
import { getMe } from '@/lib/session';
import { UpgradeButtons } from './upgrade-buttons';

export const metadata: Metadata = { title: 'Pricing', description: 'Forge Free and Pro plans.' };

const money = (cents: number, currency: string) =>
  new Intl.NumberFormat('en-IE', { style: 'currency', currency: currency.toUpperCase() }).format(
    cents / 100,
  );

const FREE = [
  'Daily challenge',
  'All problems in Practice',
  'First lessons of every course',
  '3 hint levels per day',
  '3 verified challenges per week',
  '2 streak freezes a month',
];
const PRO = [
  'Everything in Free',
  'All lessons',
  'Unlimited hints',
  'Editorials',
  'Review queue',
  'Unlimited verified challenges',
  '5 streak freezes a month',
];

export default async function PricingPage({
  searchParams,
}: {
  searchParams: Promise<{ checkout?: string }>;
}) {
  const [me, prices, { checkout }] = await Promise.all([
    getMe(),
    apiServer<PriceList>('/billing/prices'),
    searchParams,
  ]);
  const list = prices?.status === 200 ? prices.data : null;
  const price = (i: BillingInterval) => list?.prices.find((p) => p.interval === i);
  const month = price('month');
  const year = price('year');
  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      <h1 className="text-3xl font-semibold tracking-tight">Pricing</h1>
      <p className="mt-2 text-muted-foreground">
        Practise for free. Upgrade when you want the full toolkit.
      </p>
      {checkout === 'cancelled' ? (
        <Alert className="mt-4">Checkout was cancelled. Nothing was charged.</Alert>
      ) : null}
      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Free</CardTitle>
            <CardDescription>
              <span className="text-2xl font-semibold text-foreground">{money(0, 'eur')}</span>{' '}
              forever
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Features items={FREE} />
          </CardContent>
        </Card>
        <Card data-testid="pro-plan">
          <CardHeader>
            <CardTitle>Pro</CardTitle>
            <CardDescription>
              {month && year ? (
                <>
                  <span className="text-2xl font-semibold text-foreground">
                    {money(month.amount, month.currency)}
                  </span>{' '}
                  per month, or {money(year.amount, year.currency)} per year
                </>
              ) : (
                'Prices are loading.'
              )}
            </CardDescription>
            {list?.tier === 'reduced' ? (
              <p className="text-xs text-muted-foreground">Regional price for your country.</p>
            ) : null}
          </CardHeader>
          <CardContent className="grid gap-4">
            <Features items={PRO} />
            <UpgradeButtons
              signedIn={Boolean(me)}
              plan={me?.plan ?? 'free'}
              available={list?.available ?? false}
            />
            <p className="text-xs text-muted-foreground">
              Prices include VAT where it applies; the exact tax is calculated at checkout. Cancel
              any time in Settings; Pro stays until the end of the period you paid for.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Features({ items }: { items: string[] }) {
  return (
    <ul className="grid gap-2 text-sm">
      {items.map((i) => (
        <li key={i} className="flex gap-2">
          <Check className="h-4 w-4 text-success" aria-hidden /> {i}
        </li>
      ))}
    </ul>
  );
}
