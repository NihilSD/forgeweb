import type { Attempt } from '@forge/shared';
import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { apiServer } from '@/lib/api-server';
import { requireMe } from '@/lib/session';
import { parseTheme, THEME_COOKIE } from '@/lib/theme';
import { AttemptLoader } from './attempt-loader';

export const metadata: Metadata = { title: 'Verified attempt' };

export default async function AttemptPage({ params }: { params: Promise<{ id: string }> }) {
  await requireMe();
  const { id } = await params;
  const res = await apiServer<Attempt>(`/attempts/${encodeURIComponent(id)}`);
  if (!res || res.status !== 200) notFound();
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);
  return <AttemptLoader initial={res.data} theme={theme} />;
}
