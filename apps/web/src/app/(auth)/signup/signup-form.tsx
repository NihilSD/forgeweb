'use client';
import { Button } from '@forge/ui';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Field, FormError } from '@/components/form';
import { api, ApiClientError } from '@/lib/api-client';

export function SignupForm() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    setFormError(null);
    try {
      await api('/auth/signup', { method: 'POST', body: { email, password, acceptTerms } });
      router.push('/onboarding');
      router.refresh();
    } catch (err) {
      if (err instanceof ApiClientError) {
        const fields = err.fieldErrors();
        if (err.code === 'WEAK_PASSWORD') fields.password = err.message;
        setErrors(fields);
        if (Object.keys(fields).length === 0) setFormError(err.message);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-4" noValidate>
      <FormError message={formError} />
      <Field
        label="Email"
        type="email"
        autoComplete="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        error={errors.email}
      />
      <Field
        label="Password"
        type="password"
        autoComplete="new-password"
        required
        minLength={10}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        error={errors.password}
        hint="At least 10 characters. A short sentence works well."
      />
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          className="mt-0.5 h-4 w-4 accent-[var(--primary)]"
          checked={acceptTerms}
          onChange={(e) => setAcceptTerms(e.target.checked)}
          aria-describedby="terms-error"
        />
        <span>
          I am 16 or older and accept the{' '}
          <Link href="/legal/terms" className="text-primary underline underline-offset-4">
            terms
          </Link>{' '}
          and{' '}
          <Link href="/legal/privacy" className="text-primary underline underline-offset-4">
            privacy policy
          </Link>
          .
        </span>
      </label>
      {errors.acceptTerms ? (
        <p id="terms-error" className="-mt-2 text-xs text-destructive">
          {errors.acceptTerms}
        </p>
      ) : null}
      <Button type="submit" disabled={busy}>
        {busy ? 'Creating account…' : 'Create account'}
      </Button>
    </form>
  );
}
