import 'server-only';
import type { Me } from '@forge/shared';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import { apiServer } from './api-server';

/** The signed-in user for this request, or null. Cached per request. */
export const getMe = cache(async (): Promise<Me | null> => {
  const res = await apiServer<Me>('/me');
  return res?.status === 200 ? res.data : null;
});

/** For pages that need a fully set-up account. */
export async function requireMe(opts: { allowUnonboarded?: boolean } = {}): Promise<Me> {
  const res = await apiServer<Me | { error: { code: string } }>('/me');
  if (res?.status === 401 && 'error' in res.data && res.data.error.code === 'TWO_FACTOR_REQUIRED') {
    redirect('/login/2fa');
  }
  if (!res || res.status !== 200) redirect('/login');
  const me = res.data as Me;
  if (!opts.allowUnonboarded && !me.onboarded) redirect('/onboarding');
  return me;
}
