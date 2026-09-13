#!/bin/bash
# deploy.sh <dist-data-dir> [--dry-run]
#
# Build the site, put a pipeline build of the data beside it, and deploy the pair to Cloudflare
# Pages. The data is the reason this runs on the build box and not in GitHub Actions: it is ~800 MB
# across a few thousand files, and it only exists where the source dataset lives.
#
# Needs CLOUDFLARE_API_TOKEN (Pages:Edit) and CLOUDFLARE_ACCOUNT_ID in the environment, or in
# ~/src/.env as KEY=value lines.
set -euo pipefail

DATA="${1:?usage: deploy.sh <dist-data-dir> [--dry-run]}"
DRY="${2:-}"
HERE=$(cd "$(dirname "$0")" && pwd)
PROJECT="${CF_PAGES_PROJECT:-thai-legal-watch}"
BRANCH="${CF_PAGES_BRANCH:-main}"

# Cloudflare Pages refuses a deploy over these, and finding out after a 15-minute upload is worse
# than finding out now. (Agency pages are gated at >=5 documents for exactly this reason.)
MAX_FILES=20000
MAX_FILE_MB=25

# shellcheck source=node-env.sh
. "$HERE/node-env.sh"

if [[ -f "$HOME/src/.env" ]]; then set -a; . "$HOME/src/.env"; set +a; fi
: "${CLOUDFLARE_API_TOKEN:?set CLOUDFLARE_API_TOKEN (Pages:Edit) — see docs/DEPLOY.md}"
: "${CLOUDFLARE_ACCOUNT_ID:?set CLOUDFLARE_ACCOUNT_ID — see docs/DEPLOY.md}"

[[ -f "$DATA/sources.json" ]] || { echo "no sources.json in $DATA — is that a pipeline build?" >&2; exit 1; }

cd "$HERE/../web"
npm ci --silent
npm run build

rm -rf dist/data
cp -R "$DATA" dist/data
cp "$HERE/_headers" dist/_headers

files=$(find -L dist -type f | wc -l | tr -d ' ')
big=$(find -L dist -type f -size +${MAX_FILE_MB}M -print -quit)
echo "deploy: $files files, $(du -sh -L dist | cut -f1)"
[[ "$files" -le "$MAX_FILES" ]] || { echo "too many files for Cloudflare Pages ($files > $MAX_FILES)" >&2; exit 1; }
[[ -z "$big" ]] || { echo "file over ${MAX_FILE_MB} MB: $big" >&2; exit 1; }

generated=$(python3 -c "import json;print(json.load(open('dist/data/${TLW_SOURCE:-ratchakitcha}/agg/meta.json'))['generated_at'])")
echo "deploy: data generated at $generated"

if [[ "$DRY" == "--dry-run" ]]; then echo "dry run — nothing uploaded"; exit 0; fi

npx wrangler pages deploy dist \
  --project-name "$PROJECT" \
  --branch "$BRANCH" \
  --commit-dirty=true
