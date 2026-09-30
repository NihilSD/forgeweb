import Link from 'next/link';
import type { Theme } from '@/lib/theme';
import { ThemeToggle } from './theme-toggle';

export function SiteHeader({ theme }: { theme: Theme }) {
  return (
    <header className="border-b">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4">
        <Link href="/" className="font-semibold tracking-tight">
          Forge
        </Link>
        <nav aria-label="Main" className="flex items-center gap-4 text-sm text-muted-foreground">
          <Link href="/problems" className="hover:text-foreground">
            Problems
          </Link>
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <ThemeToggle initial={theme} />
        </div>
      </div>
    </header>
  );
}
