import type { Metadata } from 'next';
import { UnsubscribeForm } from './unsubscribe-form';

export const metadata: Metadata = { title: 'Unsubscribe', robots: { index: false } };

export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  return (
    <div className="mx-auto grid max-w-md gap-4 px-4 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">Weekly progress email</h1>
      <UnsubscribeForm token={token ?? ''} />
    </div>
  );
}
