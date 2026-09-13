#!/bin/bash
# nightly.sh — the whole deploy pipeline, one cron entry on the build box.
#
#   0 23 * * *  /home/spicydog/src/thai-legal-watch/infra/nightly.sh >> ~/tlw-nightly.log 2>&1
#
# Runs after the dataset's own nightly (21:00) has finished, so the taxonomy it reads is the one
# published that evening. Every step is fail-fast: a bad build must never reach the site.
set -euo pipefail

REPO=$(cd "$(dirname "$0")/.." && pwd)
DATA_ROOT="${TLW_DATA_ROOT:-$HOME/olw-build/data}"
OUT="${TLW_OUT:-$HOME/olw-build/tlw-dist}"
YEARS="${TLW_YEARS:-2005-2026}"

say() { echo "[$(date '+%F %T')] $*"; }

# shellcheck source=node-env.sh
. "$REPO/infra/node-env.sh"
say "node $(node -v) · python $(python3 -V 2>&1 | cut -d' ' -f2)"

say "pipeline: tlw-build --years $YEARS"
python3 -m pip install -q -e "$REPO/pipeline"
tlw-build --root "$DATA_ROOT" --out "$OUT.new" --years "$YEARS"

# tlw-build validates its own output against docs/DATA_CONTRACT.md before it exits; only swap in
# a build that got that far, so a half-written directory can never be deployed.
rm -rf "$OUT.prev"
[[ -d "$OUT" ]] && mv "$OUT" "$OUT.prev"
mv "$OUT.new" "$OUT"
say "pipeline: ok — $(du -sh "$OUT" | cut -f1)"

say "checks: pytest + web"
(cd "$REPO/pipeline" && python3 -m pytest -q)
(cd "$REPO/web" && npm ci --silent && npm run typecheck && npm run lint && npm test -- --run)

say "deploy"
"$REPO/infra/deploy.sh" "$OUT"
say "done"
