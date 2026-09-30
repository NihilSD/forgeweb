import { Alert } from '@forge/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { AuthShell } from '@/components/form';
import { OAuthButtons } from '../oauth-buttons';
import { LoginForm } from './login-form';

export const metadata: Metadata = { title: 'Sign in' };

const OAUTH_ERRORS: Record<string, string> = {
  oauth_state: 'Sign-in took too long or was interrupted. Please try again.',
  oauth_unverified_email:
    'An account with this email already exists, but the provider has not verified the email. Sign in with your password instead.',
  oauth_failed: "We couldn't complete sign-in with that provider. Please try again.",
  oauth_disabled: 'That sign-in method is not available right now.',
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <AuthShell
      title="Sign in to Forge"
      subtitle={
        <>
          New here?{' '}
          <Link className="text-primary underline underline-offset-4" href="/signup">
            Create an account
          </Link>
        </>
      }
    >
      {error && OAUTH_ERRORS[error] ? (
        <Alert variant="destructive">{OAUTH_ERRORS[error]}</Alert>
      ) : null}
      <OAuthButtons />
      <LoginForm />
    </AuthShell>
  );
}
