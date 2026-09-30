import 'server-only';
import { cookies } from 'next/headers';

const API = process.env.API_INTERNAL_URL ?? 'http://localhost:4000';

/** Server-side API call that forwards the user's cookies. Returns null on network failure. */
export async function apiServer<T>(
  path: string,
  init: RequestInit = {},
): Promise<{ status: number; data: T } | null> {
  const jar = await cookies();
  const cookieHeader = jar
    .getAll()
    .map((c) => `${c.name}=${encodeURIComponent(c.value)}`)
    .join('; ');
  try {
    const res = await fetch(`${API}/api/v1${path}`, {
      ...init,
      headers: { ...(init.headers ?? {}), cookie: cookieHeader, accept: 'application/json' },
      cache: 'no-store',
    });
    const data = (await res.json().catch(() => null)) as T;
    return { status: res.status, data };
  } catch {
    return null;
  }
}
