import type { Language, ProblemDetail } from '@forge/shared';
import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { apiServer } from '@/lib/api-server';
import { requireMe } from '@/lib/session';
import { parseTheme, THEME_COOKIE } from '@/lib/theme';
import { WorkspaceLoader } from './workspace-loader';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  return { title: `Solve · ${slug}` };
}

export default async function SolvePage({ params }: { params: Promise<{ slug: string }> }) {
  await requireMe();
  const { slug } = await params;
  const [problem, drafts] = await Promise.all([
    apiServer<ProblemDetail>(`/problems/${encodeURIComponent(slug)}`),
    apiServer<{ items: { language: Language; code: string }[] }>(
      `/problems/${encodeURIComponent(slug)}/drafts`,
    ),
  ]);
  if (!problem || problem.status !== 200) notFound();
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);
  const draftMap = Object.fromEntries(
    (drafts?.status === 200 ? drafts.data.items : []).map((d) => [d.language, d.code]),
  );
  return <WorkspaceLoader problem={problem.data} drafts={draftMap} theme={theme} />;
}
