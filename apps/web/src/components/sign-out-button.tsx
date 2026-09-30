'use client';
import { Button } from '@forge/ui';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api-client';

export function SignOutButton() {
  const router = useRouter();
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={async () => {
        await api('/auth/logout', { method: 'POST' }).catch(() => undefined);
        router.push('/');
        router.refresh();
      }}
    >
      Sign out
    </Button>
  );
}
