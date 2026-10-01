import type { BillingStatus, InvoiceList } from '@forge/shared';
import type { Metadata } from 'next';
import { apiServer } from '@/lib/api-server';
import { requireMe } from '@/lib/session';
import { SettingsClient } from './settings-client';

export const metadata: Metadata = { title: 'Settings' };

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; checkout?: string }>;
}) {
  const me = await requireMe({ allowUnonboarded: true });
  const { tab, checkout } = await searchParams;
  const [status, invoices] = await Promise.all([
    apiServer<BillingStatus>('/billing/status'),
    apiServer<InvoiceList>('/billing/invoices'),
  ]);
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
      <SettingsClient
        me={me}
        tab={tab}
        billing={{
          status: status?.status === 200 ? status.data : null,
          invoices: invoices?.status === 200 ? invoices.data : null,
          checkout,
        }}
      />
    </div>
  );
}
