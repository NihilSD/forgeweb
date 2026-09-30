'use client';
import { Alert, Button } from '@forge/ui';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useState } from 'react';
import { AuthShell } from '@/components/form';
import { api, ApiClientError } from '@/lib/api-client';

function Verify() {
  const token = useSearchParams().get('token');
  const [state, setState] = useState<'working' | 'done' | 'error'>('working');
  const [message, setMessage] = useState('');
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (!token) {
      setState('error');
      setMessage('This link is missing its token.');
      return;
    }
    api('/auth/verify-email', { method: 'POST', body: { token } })
      .then(() => setState('done'))
      .catch((err: unknown) => {
        setState('error');
        setMessage(err instanceof ApiClientError ? err.message : 'Something went wrong.');
      });
  }, [token]);

  if (state === 'working') return <p className="text-center text-muted-foreground">Verifying…</p>;
  if (state === 'done')
    return (
      <div className="grid gap-4">
        <Alert variant="success">Your email is verified. Thanks!</Alert>
        <Button asChild>
          <Link href="/dashboard">Continue</Link>
        </Button>
      </div>
    );
  return (
    <div className="grid gap-4">
      <Alert variant="destructive">{message}</Alert>
      <Button asChild variant="outline">
        <Link href="/settings">Send a new link from Settings</Link>
      </Button>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <AuthShell title="Verify your email">
      <Suspense>
        <Verify />
      </Suspense>
    </AuthShell>
  );
}
