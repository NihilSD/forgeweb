'use client';
import type { AuthResult } from '@forge/shared';
import { Button } from '@forge/ui';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Field, FormError } from '@/components/form';
import { api, ApiClientError } from '@/lib/api-client';

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api<AuthResult>('/auth/login', {
        method: 'POST',
        body: { email, password },
      });
      if (res.status === 'two_factor_required') router.push('/login/2fa');
      else router.push(res.me?.onboarded ? '/dashboard' : '/onboarding');
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-4" noValidate>
      <FormError message={error} />
      <Field
        label="Email"
        type="email"
        autoComplete="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <Field
        label="Password"
        type="password"
        autoComplete="current-password"
        required
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <Button type="submit" disabled={busy}>
        {busy ? 'Signing in…' : 'Sign in'}
      </Button>
      <Link
        href="/forgot-password"
        className="text-center text-sm text-muted-foreground hover:text-foreground"
      >
        Forgot your password?
      </Link>
    </form>
  );
}
