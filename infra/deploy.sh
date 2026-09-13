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
# Hardlinks, not copies: the build and the deploy directory are on one filesystem, so this is
# instant and costs no disk, where `cp -R` spent minutes duplicating 800 MB every single night.
# Falls back to a real copy if they ever end up on different filesystems.
cp -al "$DATA" dist/data 2>/dev/null || cp -R "$DATA" dist/data

# _headers is generated rather than copied: Cloudflare Pages ignores a wildcard in the middle of a
# path (measured — the deploy that shipped /data/*/feeds/* served application/xml), so each source
# needs its own literal rule, and the source ids are in the data itself.
# The static facet pages belong at the site root (/ratchakitcha/topic/… , /directory,
# /sitemap.xml), not under /data/, so they are moved out of the data tree on the way in.
if [[ -d "$DATA/_site" ]]; then
  rm -rf dist/data/_site
  (cd "$DATA/_site" && find . -type d -exec mkdir -p "$OLDPWD/dist/{}" \;)
  (cd "$DATA/_site" && find . -type f -exec cp -l {} "$OLDPWD/dist/{}" \; 2>/dev/null) ||
    cp -R "$DATA/_site/." dist/
  echo "deploy: $(find "$DATA/_site" -name '*.html' | wc -l | tr -d ' ') static pages at the site root"
fi

sources=$(python3 -c "import json;print(' '.join(s['id'] for s in json.load(open('dist/data/sources.json'))['sources']))")
cp "$HERE/_headers" dist/_headers
for src in $sources; do
  # Only the content type. Cloudflare *appends* when two matching rules set the same header, so
  # repeating the ones `/data/*` already sets produced `Access-Control-Allow-Origin: *, *` — not a
  # valid value, and browsers reject it outright. Every feed was unfetchable from any other site
  # while the JSON beside it was fine. Measured from https://example.com, not assumed.
  cat >> dist/_headers <<HDR

/data/$src/feeds/*
  Content-Type: application/atom+xml; charset=utf-8
HDR
done
echo "deploy: feed headers for $sources"
# Two matching rules that set the same header get joined with a comma, and
# `Access-Control-Allow-Origin: *, *` is not a value any browser accepts. Checked on the file
# that is about to be uploaded, because that is the one that has the generated blocks in it.
"$HERE/check-headers.py" dist/_headers

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
