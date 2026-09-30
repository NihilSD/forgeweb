# Forge sandbox: PostgreSQL for SQL problems. A template cluster is initialised at build time and
# copied to tmpfs for every run, so each run starts from the same clean state.
FROM postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24
RUN mkdir -p /opt/pgtemplate && chown postgres:postgres /opt/pgtemplate \
  && su postgres -c "initdb -D /opt/pgtemplate -A trust -U postgres --no-sync -E UTF8 --locale=C" >/dev/null \
  && chmod -R a+rX /opt/pgtemplate
COPY packages/problem-kit/harness/sql_harness.sh /opt/forge/harness.sh
USER postgres
WORKDIR /tmp
ENTRYPOINT ["/bin/sh", "/opt/forge/harness.sh"]
