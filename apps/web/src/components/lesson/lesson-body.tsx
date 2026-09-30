'use client';
import { Markdown } from '@/components/markdown';
import { Visualizer } from '@/components/visualizers/visualizer';
import { LessonExercise } from './lesson-exercise';

type Segment = { type: 'md'; text: string } | { type: 'exercise' | 'visualizer'; value: string };

/** Splits a lesson into markdown and the embedded ```exercise / ```visualizer blocks. */
export function segments(body: string): Segment[] {
  const out: Segment[] = [];
  const re = /```(exercise|visualizer)\s*\n\s*([a-z0-9-]+)\s*\n```/g;
  let last = 0;
  for (const m of body.matchAll(re)) {
    if (m.index! > last) out.push({ type: 'md', text: body.slice(last, m.index) });
    out.push({ type: m[1] as 'exercise' | 'visualizer', value: m[2]! });
    last = m.index! + m[0].length;
  }
  if (last < body.length) out.push({ type: 'md', text: body.slice(last) });
  return out;
}

export function LessonBody({
  body,
  signedIn,
  solved,
  onSolved,
}: {
  body: string;
  signedIn: boolean;
  solved: Record<string, boolean>;
  onSolved: (slug: string) => void;
}) {
  return (
    <>
      {segments(body).map((s, i) =>
        s.type === 'md' ? (
          <Markdown key={i}>{s.text}</Markdown>
        ) : s.type === 'visualizer' ? (
          <Visualizer key={i} kind={s.value} />
        ) : (
          <LessonExercise
            key={i}
            slug={s.value}
            signedIn={signedIn}
            initiallySolved={solved[s.value] ?? false}
            onSolved={() => onSolved(s.value)}
          />
        ),
      )}
    </>
  );
}
