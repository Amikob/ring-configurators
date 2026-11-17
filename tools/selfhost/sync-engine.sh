#!/bin/bash
# Copy the shared self-hosted engine (tools/selfhost/engine/) into every self-hosted page, so they stay in sync.
set -e
cd "$(dirname "$0")/../.."
for page in noya-selfhost erica-selfhost; do
  for f in tools/selfhost/engine/*; do cp "$f" "$page/$(basename "$f")"; done
  echo "synced $page"
done
