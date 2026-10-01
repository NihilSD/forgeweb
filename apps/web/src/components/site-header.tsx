import { Button } from '@forge/ui';
import Link from 'next/link';
import { getMe } from '@/lib/session';
import type { Theme } from '@/lib/theme';
import { SignOutButton } from './sign-out-button';
import { ThemeToggle } from './theme-toggle';

export async function SiteHeader({ theme }: { theme: Theme }) {
  const me = await getMe();
  return (
    <header className="border-b">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4">
        <Link href={me ? '/dashboard' : '/'} className="font-semibold tracking-tight">
          Forge
        </Link>
        <nav aria-label="Main" className="flex items-center gap-4 text-sm text-muted-foreground">
          <Link href="/learn" className="hover:text-foreground">
            Learn
          </Link>
          <Link href="/problems" className="hover:text-foreground">
            Problems
          </Link>
          <Link href="/daily" className="hover:text-foreground">
            Daily
          </Link>
          {me ? (
            <>
              <Link href="/verified" className="hover:text-foreground">
                Verified
              </Link>
              <Link href="/skills" className="hover:text-foreground">
                Skills
              </Link>
              <Link href="/ratings" className="hover:text-foreground">
                Ratings
              </Link>
              {me.role === 'moderator' || me.role === 'superadmin' ? (
                <Link href="/admin/reviews" className="hover:text-foreground">
                  Reviews
                </Link>
              ) : null}
            </>
          ) : null}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <ThemeToggle initial={theme} />
          {me ? (
            <>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/settings">{me.handle ?? 'Settings'}</Link>
              </Button>
              <SignOutButton />
            </>
          ) : (
            <>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/login">Sign in</Link>
              </Button>
              <Button size="sm" asChild>
                <Link href="/signup">Sign up</Link>
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
