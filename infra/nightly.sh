#!/bin/bash
# nightly.sh — the whole deploy pipeline, one cron entry on the build box.
#
#   0 23 * * *  /home/spicydog/src/thai-legal-watch/infra/nightly.sh >> ~/tlw-nightly.log 2>&1
#
# Runs after the dataset's own nightly (21:00), so the taxonomy it reads is the one published that
# evening. Fail-fast throughout: a bad build must never reach the site, and a silent success on
# stale inputs is worse than a loud failure.
set -euo pipefail

REPO=$(cd "$(dirname "$0")/.." && pwd)
say() { echo "[$(date '+%F %T')] $*"; }
die() { echo "[$(date '+%F %T')] FAILED: $*" >&2; exit 1; }

# Same file the Cloudflare credentials live in; TLW_DATA_ROOT belongs there too, because where the
# dataset sits is a property of the machine, not of the repository.
[[ -f "$HOME/src/.env" ]] && { set -a; . "$HOME/src/.env"; set +a; }
DATA_ROOT="${TLW_DATA_ROOT:-$HOME/olw-build/data}"
OUT="${TLW_OUT:-$HOME/olw-build/tlw-dist}"
YEARS="${TLW_YEARS:-2002-2026}"
MIN_FREE_GB="${TLW_MIN_FREE_GB:-4}"

# shellcheck source=node-env.sh
. "$REPO/infra/node-env.sh"
say "node $(node -v) · python $(python3 -V 2>&1 | cut -d' ' -f2) · years $YEARS"

# --- preconditions ------------------------------------------------------------------------------
[[ -d "$DATA_ROOT/meta" && -d "$DATA_ROOT/taxonomy" ]] ||
  die "no dataset at $DATA_ROOT (need meta/ and taxonomy/). Set TLW_DATA_ROOT in ~/src/.env — infra/link-dataset.sh builds one from the NAS and the ontology folder."

free_gb=$(df -BG --output=avail "$HOME" | tail -1 | tr -dc '0-9')
[[ "$free_gb" -ge "$MIN_FREE_GB" ]] ||
  die "only ${free_gb}GB free; a build needs about ${MIN_FREE_GB}GB. Remove $OUT.prev or old logs."

# --- code ---------------------------------------------------------------------------------------
# Without this the site is frozen at whatever commit happened to be checked out, and nobody finds
# out, because every other step still succeeds.
say "code: $(git -C "$REPO" rev-parse --short HEAD) → pulling"
git -C "$REPO" pull --ff-only ||
  die "git pull failed. cron has no ssh agent: add a read-only deploy key (infra/deploy-key.sh prints one to paste into GitHub)."
say "code: now at $(git -C "$REPO" log --oneline -1)"

# --- data ---------------------------------------------------------------------------------------
say "pipeline: tlw-build --years $YEARS"
python3 -m pip install -q --break-system-packages -e "$REPO/pipeline" 2>/dev/null ||
  python3 -m pip install -q -e "$REPO/pipeline"
rm -rf "$OUT.new"
tlw-build --root "$DATA_ROOT" --out "$OUT.new" --years "$YEARS"

# tlw-build validates its own output against docs/DATA_CONTRACT.md before it exits, so only a build
# that got this far is allowed to replace the one being served.
rm -rf "$OUT.prev"
[[ -d "$OUT" ]] && mv "$OUT" "$OUT.prev"
mv "$OUT.new" "$OUT"
say "pipeline: ok — $(du -sh "$OUT" | cut -f1)"

# --- checks -------------------------------------------------------------------------------------
say "checks: pytest + web"
(cd "$REPO/pipeline" && python3 -m pytest -q)
(cd "$REPO/web" && npm ci --silent && npm run typecheck && npm run lint && npm test)

# --- deploy -------------------------------------------------------------------------------------
say "deploy"
"$REPO/infra/deploy.sh" "$OUT"

# --- prove it ----------------------------------------------------------------------------------
"$REPO/infra/verify-live.sh" "$OUT"
say "done"
