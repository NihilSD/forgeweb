'use client';
import type { Submission } from '@forge/shared';
import { Alert, Button, EmptyState, Input, Label } from '@forge/ui';
import { Download } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { api, ApiClientError } from '@/lib/api-client';
import { VerdictBadge } from './results-panel';

export interface TableSchema {
  name: string;
  columns: { name: string; type: string }[];
}

/** Reads CREATE TABLE statements from a visible test's setup SQL for the schema browser. */
export function parseSchema(setupSql: string | undefined): TableSchema[] {
  if (!setupSql) return [];
  const tables: TableSchema[] = [];
  for (const m of setupSql.matchAll(/CREATE TABLE\s+(\w+)\s*\(([\s\S]*?)\);/gi)) {
    const body = m[2]!;
    const parts: string[] = [];
    let depth = 0;
    let cur = '';
    for (const ch of body) {
      if (ch === '(') depth++;
      if (ch === ')') depth--;
      if (ch === ',' && depth === 0) {
        parts.push(cur);
        cur = '';
      } else cur += ch;
    }
    parts.push(cur);
    tables.push({
      name: m[1]!,
      columns: parts
        .map((p) => p.trim())
        .filter((p) => p && !/^(PRIMARY|FOREIGN|UNIQUE|CONSTRAINT|CHECK)\b/i.test(p))
        .map((p) => {
          const [name, ...rest] = p.split(/\s+/);
          return {
            name: name!,
            type: rest.join(' ').replace(/\s+(NOT NULL|PRIMARY KEY|REFERENCES.*)$/i, ''),
          };
        }),
    });
  }
  return tables;
}

export function SchemaBrowser({ tables }: { tables: TableSchema[] }) {
  return (
    <section aria-labelledby="schema-title" className="grid gap-3" role="region">
      <h2 id="schema-title" className="text-sm font-semibold">
        Schema
      </h2>
      {tables.map((t) => (
        <div key={t.name} className="rounded-md border">
          <div className="border-b bg-muted/50 px-3 py-1.5 font-mono text-xs font-medium">
            {t.name}
          </div>
          <ul className="px-3 py-2 font-mono text-xs">
            {t.columns.map((c) => (
              <li key={c.name} className="flex justify-between gap-4">
                <span>{c.name}</span>
                <span className="text-muted-foreground">{c.type}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}

export function FlagPanel({ slug, onSolved }: { slug: string; onSolved: () => void }) {
  const [files, setFiles] = useState<{ name: string; url: string }[] | null>(null);
  const [flag, setFlag] = useState('');
  const [result, setResult] = useState<{ correct: boolean; message: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ items: { name: string; url: string }[] }>(`/problems/${slug}/files`)
      .then((r) => setFiles(r.items))
      .catch((e: unknown) =>
        setError(e instanceof ApiClientError ? e.message : 'Could not load files.'),
      );
  }, [slug]);

  return (
    <div className="grid gap-6 p-4">
      <section aria-labelledby="files-title" className="grid gap-2">
        <h2 id="files-title" className="text-sm font-semibold">
          Your files
        </h2>
        <p className="text-xs text-muted-foreground">
          These files are generated for you and your flag only counts for your account. Download
          links expire after 5 minutes. Only attack challenge files:{' '}
          <Link href="/security/rules" className="underline">
            challenge rules
          </Link>
          .
        </p>
        {files?.map((f) => (
          <Button key={f.name} asChild variant="outline" className="w-fit">
            <a href={f.url} download={f.name}>
              <Download className="h-4 w-4" aria-hidden /> {f.name}
            </a>
          </Button>
        ))}
      </section>
      <form
        className="grid max-w-md gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          setError(null);
          try {
            const r = await api<{ correct: boolean; message: string }>(`/problems/${slug}/flag`, {
              method: 'POST',
              body: { flag },
            });
            setResult(r);
            if (r.correct) onSolved();
          } catch (err) {
            setError(err instanceof ApiClientError ? err.message : 'Something went wrong.');
          }
        }}
      >
        <Label htmlFor="flag-input">Flag</Label>
        <Input
          id="flag-input"
          placeholder="FORGE{...}"
          value={flag}
          onChange={(e) => setFlag(e.target.value)}
          autoComplete="off"
        />
        <Button type="submit" className="w-fit">
          Submit flag
        </Button>
      </form>
      {error ? <Alert variant="destructive">{error}</Alert> : null}
      {result ? (
        <Alert variant={result.correct ? 'success' : 'destructive'}>{result.message}</Alert>
      ) : null}
    </div>
  );
}

export function HistoryPanel({
  slug,
  refreshKey,
  onLoad,
}: {
  slug: string;
  refreshKey: number;
  onLoad: (item: { language: string; code: string }) => void;
}) {
  const [items, setItems] = useState<
    (Omit<Submission, 'tests' | 'customOutput'> & { code: string })[] | null
  >(null);
  const load = useCallback(async () => {
    const res = await api<{
      items: (Omit<Submission, 'tests' | 'customOutput'> & { code: string })[];
    }>(`/problems/${slug}/submissions`);
    setItems(res.items);
  }, [slug]);
  useEffect(() => {
    void load();
  }, [load, refreshKey]);
  if (items === null) return <p className="p-4 text-sm text-muted-foreground">Loading…</p>;
  if (items.length === 0) {
    return (
      <EmptyState
        className="m-4"
        title="No runs yet"
        description="Every run and submission appears here so you can go back to it."
      />
    );
  }
  return (
    <ul className="grid gap-2 p-4" aria-label="Your runs and submissions">
      {items.map((s) => (
        <li key={s.id} className="flex items-center gap-3 rounded-md border p-2 text-sm">
          {s.verdict ? (
            <VerdictBadge verdict={s.verdict} />
          ) : (
            <span className="text-muted-foreground">{s.status}</span>
          )}
          <span className="capitalize">{s.kind}</span>
          <span className="text-muted-foreground">{s.language}</span>
          <span className="ml-auto text-xs text-muted-foreground">
            {new Date(s.createdAt).toLocaleString()}
          </span>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onLoad(s)}
            aria-label={`Load code from ${s.kind} at ${new Date(s.createdAt).toLocaleString()}`}
          >
            Load
          </Button>
        </li>
      ))}
    </ul>
  );
}
