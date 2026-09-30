import type { Metadata } from 'next';
import { requireMe } from '@/lib/session';
import { SettingsClient } from './settings-client';

export const metadata: Metadata = { title: 'Settings' };

export default async function SettingsPage() {
  const me = await requireMe({ allowUnonboarded: true });
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
      <SettingsClient me={me} />
    </div>
  );
}
