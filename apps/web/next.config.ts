import type { NextConfig } from 'next';

const apiUrl = process.env.API_INTERNAL_URL ?? 'http://localhost:4000';

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
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
