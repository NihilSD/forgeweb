'use client';
import { Alert, Button } from '@forge/ui';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { AuthShell, Field, FormError } from '@/components/form';
import { api, ApiClientError } from '@/lib/api-client';

function ResetForm() {
  const token = useSearchParams().get('token') ?? '';
  const [password, setPassword] = useState('');
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api('/auth/password/reset', { method: 'POST', body: { token, password } });
      setDone(true);
    } catch (err) {
      setError(
        err instanceof ApiClientError
          ? (err.fieldErrors().password ?? err.message)
          : 'Something went wrong.',
      );
    }
  }

  if (done)
    return (
      <div className="grid gap-4">
        <Alert variant="success">Your password was changed and all devices were signed out.</Alert>
        <Button asChild>
          <Link href="/login">Sign in</Link>
        </Button>
      </div>
    );
  return (
    <form onSubmit={submit} className="grid gap-4">
      <FormError message={error} />
      <Field
        label="New password"
        type="password"
        autoComplete="new-password"
        required
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        hint="At least 10 characters."
      />
      <Button type="submit">Change password</Button>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <AuthShell title="Choose a new password">
      <Suspense>
        <ResetForm />
      </Suspense>
    </AuthShell>
  );
}
