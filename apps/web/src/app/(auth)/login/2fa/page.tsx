'use client';
import type { AuthResult } from '@forge/shared';
import { Button } from '@forge/ui';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { AuthShell, Field, FormError } from '@/components/form';
import { api, ApiClientError } from '@/lib/api-client';

export default function TwoFactorPage() {
  const router = useRouter();
  const [useRecovery, setUseRecovery] = useState(false);
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api<AuthResult>('/auth/2fa/verify', {
        method: 'POST',
        body: useRecovery ? { recoveryCode: value.trim() } : { code: value.trim() },
      });
      router.push(res.me?.onboarded ? '/dashboard' : '/onboarding');
      router.refresh();
    } catch (err) {
      if (err instanceof ApiClientError && err.code === 'UNAUTHENTICATED') router.push('/login');
      setError(err instanceof ApiClientError ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell
      title="Two-factor authentication"
      subtitle="Enter the code from your authenticator app."
    >
      <form onSubmit={submit} className="grid gap-4">
        <FormError message={error} />
        <Field
          label={useRecovery ? 'Recovery code' : '6-digit code'}
          inputMode={useRecovery ? 'text' : 'numeric'}
          autoComplete="one-time-code"
          autoFocus
          required
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        <Button type="submit" disabled={busy}>
          Verify
        </Button>
        <Button type="button" variant="link" onClick={() => setUseRecovery((v) => !v)}>
          {useRecovery ? 'Use an authenticator code' : 'Use a recovery code instead'}
        </Button>
      </form>
    </AuthShell>
  );
}
