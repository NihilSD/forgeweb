import Link from 'next/link';

const LINKS = [
  ['/legal/privacy', 'Privacy'],
  ['/legal/terms', 'Terms'],
  ['/legal/cookies', 'Cookies'],
  ['/legal/acceptable-use', 'Acceptable use'],
  ['/security/rules', 'Security challenge rules'],
  ['/pricing', 'Pricing'],
  ['/status', 'Status'],
] as const;

export function SiteFooter() {
  return (
    <footer className="mt-16 border-t">
      <nav
        aria-label="Footer"
        className="mx-auto flex max-w-6xl flex-wrap gap-x-6 gap-y-2 px-4 py-6 text-sm text-muted-foreground"
      >
        {LINKS.map(([href, label]) => (
          <Link key={href} href={href} className="hover:text-foreground">
            {label}
          </Link>
        ))}
      </nav>
    </footer>
  );
}
