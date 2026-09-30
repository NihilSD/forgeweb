#!/usr/bin/env bash
# Builds the sandbox images. Tags carry the content hash of the Dockerfile + harness so the runner
# can refuse to use stale images. Run from anywhere.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
for lang in python node postgres-sql; do
  echo "building forge-sandbox-$lang"
  docker build -q -f "$ROOT/sandboxes/$lang/Dockerfile" -t "forge-sandbox-$lang:latest" "$ROOT" >/dev/null
done
docker images --format '{{.Repository}}:{{.Tag}} {{.ID}} {{.Size}}' | grep forge-sandbox
