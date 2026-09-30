'use client';
import { Alert, Button } from '@forge/ui';
import { useState } from 'react';
import { AuthShell, Field, FormError } from '@/components/form';
import { api, ApiClientError } from '@/lib/api-client';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api('/auth/password/forgot', { method: 'POST', body: { email } });
      setSent(true);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Something went wrong.');
    }
  }

  return (
    <AuthShell title="Reset your password" subtitle="We'll email you a link to choose a new one.">
      {sent ? (
        <Alert variant="success">
          If an account exists for {email}, a reset link is on its way. Check your inbox.
        </Alert>
      ) : (
        <form onSubmit={submit} className="grid gap-4">
          <FormError message={error} />
          <Field
            label="Email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Button type="submit">Send reset link</Button>
        </form>
      )}
    </AuthShell>
  );
}
