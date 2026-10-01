import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import './globals.css';
import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';
import { parseTheme, THEME_COOKIE } from '@/lib/theme';

export const metadata: Metadata = {
  title: {
    default: 'Forge — Learn IT skills, prove them fairly, get hired',
    template: '%s · Forge',
  },
  description:
    'Practice every kind of IT skill, prove it under fair conditions, and get hired for it.',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);
  return (
    <html lang="en" className={theme === 'dark' ? 'dark' : ''} data-theme={theme}>
      <body className="min-h-screen">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-primary focus:px-3 focus:py-2 focus:text-primary-foreground"
        >
          Skip to content
        </a>
        <SiteHeader theme={theme} />
        <main id="main">{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
