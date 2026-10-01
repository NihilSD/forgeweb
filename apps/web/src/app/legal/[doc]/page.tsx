import { Alert } from '@forge/ui';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Markdown } from '@/components/markdown';
import { DRAFT_NOTE, LEGAL_DOCS } from './docs';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ doc: string }>;
}): Promise<Metadata> {
  const { doc } = await params;
  return { title: LEGAL_DOCS[doc]?.title ?? 'Legal' };
}

export default async function LegalPage({ params }: { params: Promise<{ doc: string }> }) {
  const { doc } = await params;
  const page = LEGAL_DOCS[doc];
  if (!page) notFound();
  return (
    <article className="mx-auto grid max-w-3xl gap-4 px-4 py-12">
      <h1 className="text-2xl font-semibold">{page.title}</h1>
      <p className="text-sm text-muted-foreground">Last updated {page.updated}</p>
      <Alert>{DRAFT_NOTE}</Alert>
      <Markdown>{page.body}</Markdown>
    </article>
  );
}
