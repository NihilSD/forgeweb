'use client';
import { GOALS, LANGUAGE_LABELS, LANGUAGES, type Language } from '@forge/shared';
import { Button, Label } from '@forge/ui';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { Field, FormError } from '@/components/form';
import { api, ApiClientError } from '@/lib/api-client';

const GOAL_LABELS: Record<(typeof GOALS)[number], string> = {
  learn: 'Learn new skills',
  interview: 'Prepare for interviews',
  compete: 'Compete and rank',
  'career-change': 'Change careers into IT',
  teach: 'Teach or mentor',
};

const selectClass =
  'flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-2 focus-visible:outline-ring';

export function OnboardingForm() {
  const router = useRouter();
  const detectedTz = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC', []);
  const [handle, setHandle] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [country, setCountry] = useState('');
  const [timeZone, setTimeZone] = useState(detectedTz);
  const [birthYear, setBirthYear] = useState('');
  const [goal, setGoal] = useState<(typeof GOALS)[number]>('learn');
  const [languages, setLanguages] = useState<Language[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function toggle(lang: Language) {
    setLanguages((ls) => (ls.includes(lang) ? ls.filter((l) => l !== lang) : [...ls, lang]));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    setFormError(null);
    try {
      await api('/me/onboarding', {
        method: 'POST',
        body: {
          handle,
          displayName,
          country: country ? country.toUpperCase() : undefined,
          timeZone,
          birthYear: Number(birthYear),
          goal,
          languages,
        },
      });
      router.push('/dashboard');
      router.refresh();
    } catch (err) {
      if (err instanceof ApiClientError) {
        const fields = err.fieldErrors();
        if (err.code === 'CONFLICT') fields.handle = err.message;
        setErrors(fields);
        if (Object.keys(fields).length === 0) setFormError(err.message);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-8 grid gap-5" noValidate>
      <FormError message={formError} />
      <Field
        label="Handle"
        required
        value={handle}
        onChange={(e) => setHandle(e.target.value)}
        error={errors.handle}
        hint="Your public username: letters, numbers, dashes and underscores."
      />
      <Field
        label="Display name"
        required
        value={displayName}
        onChange={(e) => setDisplayName(e.target.value)}
        error={errors.displayName}
      />
      <div className="grid gap-5 sm:grid-cols-2">
        <Field
          label="Country (optional)"
          placeholder="RO"
          maxLength={2}
          value={country}
          onChange={(e) => setCountry(e.target.value)}
          error={errors.country}
          hint="Two-letter code"
        />
        <Field
          label="Birth year"
          inputMode="numeric"
          required
          value={birthYear}
          onChange={(e) => setBirthYear(e.target.value.replace(/\D/g, '').slice(0, 4))}
          error={errors.birthYear}
          hint="Forge is for people aged 16 and over."
        />
      </div>
      <Field
        label="Time zone"
        required
        value={timeZone}
        onChange={(e) => setTimeZone(e.target.value)}
        error={errors.timeZone}
        hint="Used for streaks and the daily challenge."
      />
      <div className="grid gap-1.5">
        <Label htmlFor="goal">Main goal</Label>
        <select
          id="goal"
          className={selectClass}
          value={goal}
          onChange={(e) => setGoal(e.target.value as typeof goal)}
        >
          {GOALS.map((g) => (
            <option key={g} value={g}>
              {GOAL_LABELS[g]}
            </option>
          ))}
        </select>
      </div>
      <fieldset className="grid gap-2">
        <legend className="mb-1 text-sm font-medium">Languages you want to use</legend>
        <div className="flex flex-wrap gap-3">
          {LANGUAGES.map((l) => (
            <label key={l} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="h-4 w-4 accent-[var(--primary)]"
                checked={languages.includes(l)}
                onChange={() => toggle(l)}
              />
              {LANGUAGE_LABELS[l]}
            </label>
          ))}
        </div>
      </fieldset>
      <Button type="submit" disabled={busy}>
        {busy ? 'Saving…' : 'Continue'}
      </Button>
    </form>
  );
}
