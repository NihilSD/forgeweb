import { resolve } from 'node:path';
import type { NextConfig } from 'next';

// Read at build time: rewrites are compiled into the build, so production images pass
// API_INTERNAL_URL as a build argument.
const apiUrl = process.env.API_INTERNAL_URL ?? 'http://localhost:4000';

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Production images (infra/docker/Dockerfile) build a self-contained server. Local `next start`
  // keeps the default output.
  ...(process.env.NEXT_OUTPUT === 'standalone'
    ? {
        output: 'standalone' as const,
        outputFileTracingRoot: resolve(import.meta.dirname, '../..'),
      }
    : {}),
  transpilePackages: ['@forge/ui'],
  turbopack: {
    // monaco-vim imports Monaco's old deep paths; Monaco 0.57's exports map moved them.
    resolveAlias: {
      'monaco-editor/esm/vs/editor/editor.api': 'monaco-editor/editor/editor.api',
      'monaco-editor/esm/vs/editor/common/commands/shiftCommand':
        'monaco-editor/editor/common/commands/shiftCommand',
    },
  },
  // The browser only ever talks to this origin; /api/v1 is proxied to the API so session
  // cookies stay first-party and no CORS is needed.
  async rewrites() {
    return [{ source: '/api/v1/:path*', destination: `${apiUrl}/api/v1/:path*` }];
  },
};

export default config;
