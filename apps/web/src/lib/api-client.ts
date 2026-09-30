'use client';

/** Browser-side API calls. Same origin (proxied), cookies included, CSRF header on writes. */
export class ApiClientError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
  fieldErrors(): Record<string, string> {
    const issues =
      (this.details as { issues?: { path: string; message: string }[] } | undefined)?.issues ?? [];
    return Object.fromEntries(issues.map((i) => [i.path, i.message]));
  }
}

function readCookie(name: string): string | undefined {
  return document.cookie
    .split('; ')
    .find((c) => c.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

async function csrfToken(): Promise<string> {
  const existing = readCookie('forge_csrf');
  if (existing) return decodeURIComponent(existing);
  const res = await fetch('/api/v1/auth/csrf', { credentials: 'same-origin' });
  const body = (await res.json()) as { csrfToken: string };
  return body.csrfToken;
}

export async function api<T>(
  path: string,
  init: {
    method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
    body?: unknown;
    signal?: AbortSignal;
  } = {},
): Promise<T> {
  const method = init.method ?? 'GET';
  const headers: Record<string, string> = { accept: 'application/json' };
  if (method !== 'GET') {
    headers['x-csrf-token'] = await csrfToken();
    headers['content-type'] = 'application/json';
  }
  let res: Response;
  try {
    res = await fetch(`/api/v1${path}`, {
      method,
      headers,
      credentials: 'same-origin',
      body:
        init.body !== undefined ? JSON.stringify(init.body) : method === 'GET' ? undefined : '{}',
      signal: init.signal,
    });
  } catch {
    throw new ApiClientError(
      0,
      'NETWORK',
      "We couldn't reach Forge. Check your connection and try again.",
    );
  }
  const data = (await res.json().catch(() => null)) as unknown;
  if (!res.ok) {
    const err = (data as { error?: { code: string; message: string; details?: unknown } } | null)
      ?.error;
    throw new ApiClientError(
      res.status,
      err?.code ?? 'UNKNOWN',
      err?.message ?? 'Something went wrong. Please try again.',
      err?.details,
    );
  }
  return data as T;
}
