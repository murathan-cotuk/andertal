#!/usr/bin/env bash
# Retry npm ci on flaky registry/network errors (ECONNRESET, etc.).
set -euo pipefail

attempts="${NPM_CI_ATTEMPTS:-3}"
for attempt in $(seq 1 "$attempts"); do
  if npm ci; then
    exit 0
  fi
  echo "::warning::npm ci failed (attempt ${attempt}/${attempts})"
  if [ "$attempt" -lt "$attempts" ]; then
    sleep $((attempt * 20))
    rm -rf node_modules
  fi
done
exit 1
