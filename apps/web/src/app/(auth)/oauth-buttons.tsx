import { Button } from '@forge/ui';
import { apiServer } from '@/lib/api-server';

const LABELS: Record<string, string> = {
  github: 'Continue with GitHub',
  google: 'Continue with Google',
};

/** Only shows providers the API has credentials for. Plain links: the API handles the redirects. */
export async function OAuthButtons() {
  const res = await apiServer<{ providers: string[] }>('/auth/oauth/providers');
  const providers = res?.status === 200 ? res.data.providers : [];
  if (providers.length === 0) return null;
  return (
    <div className="grid gap-2">
      {providers.map((p) => (
        <Button key={p} variant="outline" asChild>
          <a href={`/api/v1/auth/oauth/${p}/start`}>{LABELS[p] ?? p}</a>
        </Button>
      ))}
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        or
        <span className="h-px flex-1 bg-border" />
      </div>
    </div>
  );
}
