# syntax=docker/dockerfile:1
# Forge production images. Build from the repo root:
#   docker build -f infra/docker/Dockerfile --target api -t forge-api .
#   docker build -f infra/docker/Dockerfile --target web --build-arg API_INTERNAL_URL=http://api:4000 -t forge-web .
#   docker build -f infra/docker/Dockerfile --target tools -t forge-tools .   (migrations, imports)
#   docker build -f infra/docker/Dockerfile --target runner -t forge-runner . (runner VM bundle)
# Pin the base image by digest in CI (see docs/runbooks/deploy.md).
ARG NODE_IMAGE=node:22-bookworm-slim

FROM ${NODE_IMAGE} AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH COREPACK_ENABLE_DOWNLOAD_PROMPT=0 NEXT_TELEMETRY_DISABLED=1
RUN corepack enable
WORKDIR /repo

# Full install and build. An optional build secret `ca` adds a corporate proxy CA for the build only.
FROM base AS build
ARG API_INTERNAL_URL=http://api:4000
COPY . .
RUN --mount=type=secret,id=ca,required=false \
    --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    if [ -f /run/secrets/ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/ca; fi \
 && pnpm install --frozen-lockfile \
 && pnpm turbo run build --filter=@forge/api... --filter=@forge/runner... \
 && rm -rf apps/api/src apps/api/test

# Self-contained production trees (workspace packages copied in, dev dependencies left out).
FROM build AS deploy
RUN --mount=type=secret,id=ca,required=false \
    --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    if [ -f /run/secrets/ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/ca; fi \
 && pnpm --filter @forge/api deploy --prod /out/api \
 && pnpm --filter @forge/runner deploy --prod /out/runner \
 && pnpm --filter @forge/db deploy /out/db \
 && rm -rf /out/api/src /out/runner/src /out/*/test /out/api/tsconfig*.json /out/runner/tsconfig*.json /out/*/vitest.config.ts \
 && cp -r content /out/api/content && rm -rf /out/api/content/node_modules

# API: no compiler, no dev dependencies, no source, runs as an unprivileged user.
FROM ${NODE_IMAGE} AS api
ENV NODE_ENV=production PORT=4000
WORKDIR /app
COPY --from=deploy /out/api ./
USER node
EXPOSE 4000
HEALTHCHECK --interval=15s --timeout=5s --retries=4 \
  CMD node -e "fetch('http://127.0.0.1:4000/api/v1/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["node", "dist/main.js"]

# Web: Next.js standalone server.
FROM build AS web-build
ARG API_INTERNAL_URL=http://api:4000
RUN NEXT_OUTPUT=standalone API_INTERNAL_URL=${API_INTERNAL_URL} pnpm --filter @forge/web build

FROM ${NODE_IMAGE} AS web
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
WORKDIR /app
COPY --from=web-build /repo/apps/web/.next/standalone ./
COPY --from=web-build /repo/apps/web/.next/static ./apps/web/.next/static
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --retries=4 \
  CMD node -e "fetch('http://127.0.0.1:3000/status').then(r=>process.exit(r.status<500?0:1),()=>process.exit(1))"
CMD ["node", "apps/web/server.js"]

# Runner bundle: not run as a container (the runner bind-mounts host temp dirs into sandboxes).
# infra/runner/install.sh copies /opt/forge-runner out of this image onto the runner VM, together
# with this image's node binary, and runs it under systemd.
FROM ${NODE_IMAGE} AS runner
WORKDIR /opt/forge-runner
COPY --from=deploy /out/runner ./
# sandboxes/build.sh builds from this directory: it needs the Dockerfiles and the harnesses.
COPY sandboxes ./sandboxes
COPY packages/problem-kit/harness ./packages/problem-kit/harness
RUN mkdir bin && cp /usr/local/bin/node bin/node
CMD ["true"]

# One-off jobs: migrations (Prisma CLI from the db package) and the API's CLIs (content import,
# grant-role). Never serves traffic. Backups use the official postgres image instead.
FROM ${NODE_IMAGE} AS tools
ENV NODE_ENV=production
WORKDIR /tools
COPY --from=deploy /out/api ./api
COPY --from=deploy /out/db ./db
USER node
WORKDIR /tools/db
CMD ["node_modules/.bin/prisma", "migrate", "deploy"]
