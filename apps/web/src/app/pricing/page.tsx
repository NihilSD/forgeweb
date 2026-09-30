import { PLAN_PRICES } from '@forge/shared';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@forge/ui';
import { Check } from 'lucide-react';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Pricing', description: 'Forge Free and Pro plans.' };

const eur = (cents: number) =>
  new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR' }).format(cents / 100);

const FREE = [
  'Daily challenge',
  'All problems in Practice',
  'First lessons of every course',
  '3 hint levels per day',
  '3 verified challenges per week',
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

export default function PricingPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      <h1 className="text-3xl font-semibold tracking-tight">Pricing</h1>
      <p className="mt-2 text-muted-foreground">
        Practise for free. Upgrade when you want the full toolkit.
      </p>
      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        {[
          { name: 'Free', price: eur(0), note: 'forever', items: FREE },
          {
            name: 'Pro',
            price: eur(PLAN_PRICES.pro_monthly.amount),
            note: `per month, or ${eur(PLAN_PRICES.pro_yearly.amount)} per year`,
            items: PRO,
          },
        ].map((p) => (
          <Card key={p.name}>
            <CardHeader>
              <CardTitle>{p.name}</CardTitle>
              <CardDescription>
                <span className="text-2xl font-semibold text-foreground">{p.price}</span> {p.note}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="grid gap-2 text-sm">
                {p.items.map((i) => (
                  <li key={i} className="flex gap-2">
                    <Check className="h-4 w-4 text-success" aria-hidden /> {i}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
