import { notFound } from 'next/navigation';

const DOCS: Record<string, { title: string; body: string }> = {
  terms: {
    title: 'Terms of service',
    body: 'Draft pending legal review (phase L12). Forge is for people aged 16 and over.',
  },
  privacy: {
    title: 'Privacy policy',
    body: 'Draft pending legal review (phase L12). Data is stored in the EU. You can export or delete your data at any time from Settings.',
  },
};

export default async function LegalPage({ params }: { params: Promise<{ doc: string }> }) {
  const { doc } = await params;
  const page = DOCS[doc];
  if (!page) notFound();
  return (
    <article className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="text-2xl font-semibold">{page.title}</h1>
      <p className="mt-4 text-muted-foreground">{page.body}</p>
    </article>
  );
}
