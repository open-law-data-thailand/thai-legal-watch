#!/bin/bash
# verify-live.sh <dist-data-dir> [site-url]
#
# A deploy that reports success while the edge keeps serving yesterday's data is the failure that
# would go unnoticed longest, so every deploy ends by comparing the two.
set -euo pipefail
DATA="${1:?usage: verify-live.sh <dist-data-dir> [site]}"
SITE="${2:-${TLW_SITE:-https://thai-legal-watch.pages.dev}}"
SOURCE="${TLW_SOURCE:-ratchakitcha}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

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

# The document page reads a document's text straight from the publisher, so the deployed policy
# has to allow wherever `resolve/` redirects to. There is no way to know that host without
# following the redirect — naming them by hand broke in production — so follow it.
text_base=$(python3 -c "import json;print(json.load(open('$DATA/$SOURCE/agg/meta.json')).get('text',{}).get('base',''))")
if [[ -n "$text_base" ]]; then
  csp=$(curl -fsSI --max-time 30 "$SITE/" | tr -d '\r' | grep -i '^content-security-policy:' || true)
  [[ -n "$csp" ]] || { echo "no Content-Security-Policy on $SITE" >&2; exit 1; }
  month=$(python3 -c "import json;m=json.load(open('$DATA/$SOURCE/agg/meta.json'));print((m['latest_date'] or '')[:7])")
  final=$(curl -fsS -o /dev/null -w '%{url_effective}' -L -r 0-0 --max-time 40 \
    "$text_base/${month:0:4}/$month.jsonl" 2>/dev/null || true)
  if [[ -z "$final" ]]; then
    echo "note: the text layer did not answer, so its host could not be checked" >&2
  else
    "$HERE/csp-allows.py" "$csp" "$(printf '%s' "$final" | sed -E 's#^https?://([^/]+).*#\1#')"
  fi
fi
