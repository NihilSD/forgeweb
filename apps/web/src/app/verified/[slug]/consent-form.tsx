'use client';
import { LANGUAGE_LABELS, type Language } from '@forge/shared';
import { Alert, Button, Label } from '@forge/ui';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api, ApiClientError } from '@/lib/api-client';

/** Spec 7.1 step 1: what is recorded, shown before every attempt. No webcam, ever. */
const RECORDED = [
  'Every change you make in the editor, with timestamps, so the session can be replayed.',
  'Pastes: their length, whether they came from inside the editor, and a hash of the first 200 characters.',
  'When the workspace loses or regains focus, and when you leave full screen.',
  'Your runs, submissions and answers to the follow-up questions.',
];
const NOT_RECORDED = [
  'No webcam, microphone or screen recording.',
  'Nothing outside this browser tab.',
];

export function ConsentForm(props: {
  slug: string;
  languages: string[];
  preferred: string[];
  emailVerified: boolean;
  remaining: number | null;
  activeAttemptId: string | null;
}) {
  const router = useRouter();
  const [language, setLanguage] = useState(
    props.languages.find((l) => props.preferred.includes(l)) ?? props.languages[0]!,
  );
  const [agreed, setAgreed] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (props.activeAttemptId) {
    return (
      <Alert>
        Finish your current attempt first.{' '}
        <Link href={`/attempts/${props.activeAttemptId}`} className="font-medium underline">
          Return to it
        </Link>
      </Alert>
    );
  }
  if (!props.emailVerified) {
    return <Alert>Verify your email address before taking a verified challenge.</Alert>;
  }
  if (props.remaining === 0) {
    return (
      <Alert>
        You&apos;ve used this week&apos;s free verified challenges.{' '}
        <Link href="/pricing" className="font-medium underline">
          Forge Pro
        </Link>{' '}
        includes unlimited verified challenges.
      </Alert>
    );
  }

  async function begin() {
    setPending(true);
    setError(null);
    // Full screen must be requested inside this click; don't wait for it (some browsers never
    // settle the promise). The attempt page records if you leave full screen.
    void document.documentElement.requestFullscreen?.().catch(() => undefined);
    try {
      const attempt = await api<{ id: string }>(`/verified/${props.slug}/attempts`, {
        method: 'POST',
        body: { consent: true, language },
      });
      router.push(`/attempts/${attempt.id}`);
    } catch (err) {
      if (document.fullscreenElement) await document.exitFullscreen().catch(() => undefined);
      setError(err instanceof ApiClientError ? err.message : 'Could not start the attempt.');
      setPending(false);
    }
  }

  return (
    <form
      className="grid gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (agreed) void begin();
      }}
    >
      <section className="grid gap-2 rounded-lg border p-4" aria-labelledby="recorded">
        <h2 id="recorded" className="font-semibold">
          What we record
        </h2>
        <ul className="list-disc space-y-1 pl-5 text-sm">
          {RECORDED.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
        <h3 className="mt-2 text-sm font-semibold">What we don&apos;t</h3>
        <ul className="list-disc space-y-1 pl-5 text-sm">
          {NOT_RECORDED.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
        <p className="text-sm text-muted-foreground">
          Only you and Forge moderators can watch the replay. It is deleted after 12 months unless
          you choose to keep it public. Hints, editorials and AI help are off during the attempt.
        </p>
      </section>
      <section className="grid gap-2 rounded-lg border p-4" aria-labelledby="how">
        <h2 id="how" className="font-semibold">
          How it works
        </h2>
        <ol className="list-decimal space-y-1 pl-5 text-sm">
          <li>Solve the problem. You can run your code as often as you like.</li>
          <li>Submit. Hidden tests check your solution.</li>
          <li>Answer 2–3 short questions about your own code, 90 seconds each.</li>
          <li>
            You get a result: verified, unverified, or sent to a human reviewer. Nobody is banned by
            a machine, and you can appeal any result that isn&apos;t verified.
          </li>
        </ol>
      </section>
      {props.languages.length > 1 ? (
        <div className="grid gap-1">
          <Label htmlFor="language">Language</Label>
          <select
            id="language"
            className="h-9 w-fit rounded-md border border-input bg-background px-2 text-sm"
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
          >
            {props.languages.map((l) => (
              <option key={l} value={l}>
                {LANGUAGE_LABELS[l as Language] ?? l}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          className="mt-1"
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
        />
        <span>I understand what is recorded and agree to it for this attempt.</span>
      </label>
      {error ? <Alert variant="destructive">{error}</Alert> : null}
      <Button type="submit" className="w-fit" disabled={!agreed || pending}>
        {pending ? 'Starting…' : 'Start the attempt'}
      </Button>
    </form>
  );
}
