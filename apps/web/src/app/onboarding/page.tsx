import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { requireMe } from '@/lib/session';
import { OnboardingForm } from './onboarding-form';

export const metadata: Metadata = { title: 'Set up your account' };

export default async function OnboardingPage() {
  const me = await requireMe({ allowUnonboarded: true });
  if (me.onboarded) redirect('/dashboard');
  return (
    <div className="mx-auto max-w-xl px-4 py-12">
      <h1 className="text-2xl font-semibold tracking-tight">Set up your account</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        This takes a minute and shapes your recommendations.
      </p>
      <OnboardingForm />
    </div>
  );
}
