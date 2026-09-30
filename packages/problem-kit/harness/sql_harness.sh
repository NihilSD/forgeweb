#!/bin/sh
# Forge SQL harness. Runs inside the postgres-sql sandbox image as the non-root `postgres` user.
#
# The runner mounts /work read-only with:
#   /work/solution.sql          the user's query
#   /work/limits                statement timeout in milliseconds
#   /work/tests/NNN/id          test id
#   /work/tests/NNN/setup.sql   trusted schema + data for that test
#
# For each test: a fresh database is created and loaded by the superuser, then the user's query
# runs as the unprivileged `solver` role (SELECT only, statement timeout). Result lines go to
# stdout with the harness marker; the CSV result is base64-encoded so it can't break framing.
set -u
M="$(printf '\036FORGE\037')"
# psql's CSV output can't tell NULL from '' on its own; print NULL as a control-char sentinel.
NULLMARK="$(printf '\001NULL\001')"
emit() { printf '%s%s\n' "$M" "$1"; }
now_ms() { awk '{ printf "%d", $1 * 1000 }' /proc/uptime; }
b64() { base64 "$1" | tr -d '\n'; }

PG=/tmp/pg
cp -R /opt/pgtemplate "$PG" && chmod 700 "$PG"
if ! pg_ctl -D "$PG" -s -w -t 20 -l /tmp/pg.log \
  -o "-k /tmp -c listen_addresses= -c fsync=off -c synchronous_commit=off -c full_page_writes=off -c shared_buffers=16MB -c max_connections=10 -c dynamic_shared_memory_type=mmap" start; then
  emit '{"type":"load_error","error":"The SQL sandbox failed to start."}'
  exit 0
fi

SU="psql -h /tmp -U postgres -X -q -v ON_ERROR_STOP=1"
$SU -d postgres -c "CREATE ROLE solver LOGIN" >/dev/null 2>&1
TIMEOUT="$(cat /work/limits)"
emit '{"type":"start"}'

for dir in /work/tests/*/; do
  id="$(cat "$dir/id")"
  db="t$(basename "$dir")"
  if ! $SU -d postgres -c "CREATE DATABASE $db" >/dev/null 2>/tmp/setup.err ||
     ! $SU -d "$db" -f "$dir/setup.sql" >/dev/null 2>>/tmp/setup.err ||
     ! $SU -d "$db" -c "REVOKE ALL ON SCHEMA public FROM PUBLIC; GRANT USAGE ON SCHEMA public TO solver; GRANT SELECT ON ALL TABLES IN SCHEMA public TO solver; REVOKE TEMP ON DATABASE $db FROM PUBLIC" >/dev/null 2>>/tmp/setup.err; then
    emit "{\"type\":\"test\",\"id\":\"$id\",\"status\":\"error\",\"timeMs\":0,\"errorB64\":\"$(b64 /tmp/setup.err)\"}"
    continue
  fi
  started="$(now_ms)"
  PGOPTIONS="-c statement_timeout=$TIMEOUT -c default_transaction_read_only=on" \
    psql -h /tmp -U solver -d "$db" -X -q --csv -P "null=$NULLMARK" -v ON_ERROR_STOP=1 -f /work/solution.sql >/tmp/out.csv 2>/tmp/err.txt
  rc=$?
  elapsed=$(( $(now_ms) - started ))
  if [ "$rc" -eq 0 ]; then
    emit "{\"type\":\"test\",\"id\":\"$id\",\"status\":\"ok\",\"timeMs\":$elapsed,\"csvB64\":\"$(b64 /tmp/out.csv)\"}"
  elif grep -q "statement timeout" /tmp/err.txt; then
    emit "{\"type\":\"test\",\"id\":\"$id\",\"status\":\"time_limit\",\"timeMs\":$elapsed}"
  else
    emit "{\"type\":\"test\",\"id\":\"$id\",\"status\":\"error\",\"timeMs\":$elapsed,\"errorB64\":\"$(b64 /tmp/err.txt)\"}"
  fi
done
emit '{"type":"done"}'
pg_ctl -D "$PG" -s -m immediate stop >/dev/null 2>&1
exit 0
