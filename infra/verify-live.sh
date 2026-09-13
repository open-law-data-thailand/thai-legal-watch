#!/bin/bash
# verify-live.sh <dist-data-dir> [site-url]
#
# A deploy that reports success while the edge keeps serving yesterday's data is the failure that
# would go unnoticed longest, so every deploy ends by comparing the two.
set -euo pipefail
DATA="${1:?usage: verify-live.sh <dist-data-dir> [site]}"
SITE="${2:-${TLW_SITE:-https://thai-legal-watch.pages.dev}}"
SOURCE="${TLW_SOURCE:-ratchakitcha}"

built=$(python3 -c "import json;print(json.load(open('$DATA/$SOURCE/agg/meta.json'))['generated_at'])")
live=""
for _ in $(seq 1 12); do
  live=$(curl -fsS --max-time 30 "$SITE/data/$SOURCE/agg/meta.json" |
    python3 -c "import json,sys;print(json.load(sys.stdin)['generated_at'])" 2>/dev/null || true)
  [[ "$live" == "$built" ]] && break
  sleep 10
done
[[ "$live" == "$built" ]] || {
  echo "deployed, but $SITE still serves data generated at '${live:-nothing}' (built '$built')" >&2
  exit 1
}
echo "verified: $SITE serves the build from $built"
