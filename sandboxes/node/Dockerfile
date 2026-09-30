# Forge sandbox: JavaScript / TypeScript (TypeScript is transpiled by the runner before it gets here).
FROM node:22-slim@sha256:43ac6c60b8f89723f746e8a92ce91abd5017e627ce1ddfe4238355d3a30b772c
RUN groupadd -g 10001 runner && useradd -u 10001 -g 10001 -M -d /tmp -s /usr/sbin/nologin runner \
  && rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx /opt/yarn* /usr/local/bin/yarn*
COPY packages/problem-kit/harness/node_harness.mjs /opt/forge/harness.mjs
ENV NODE_ENV=production
USER 10001:10001
WORKDIR /tmp
ENTRYPOINT ["node", "/opt/forge/harness.mjs"]
