import type { Metadata } from 'next';
import Link from 'next/link';
import { AuthShell } from '@/components/form';
import { OAuthButtons } from '../oauth-buttons';
import { SignupForm } from './signup-form';

export const metadata: Metadata = { title: 'Create your account' };

export default function SignupPage() {
  return (
    <AuthShell
      title="Create your account"
      subtitle={
        <>
          Already have one?{' '}
          <Link className="text-primary underline underline-offset-4" href="/login">
            Sign in
          </Link>
        </>
      }
    >
      <OAuthButtons />
      <SignupForm />
    </AuthShell>
  );
}
