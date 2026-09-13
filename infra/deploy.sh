#!/bin/bash
# deploy.sh DIST_DATA_DIR — build the site, put the data beside it, deploy to Cloudflare Pages.
# Needs CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID in the environment (or ~/src/.env).
set -euo pipefail
DATA="${1:?dist-data dir}"
HERE=$(cd "$(dirname "$0")" && pwd)
cd "$HERE/../web"
npm ci --silent
npm run build
rm -rf dist/data
cp -R "$DATA" dist/data              # feeds live at /data/feeds/<kind>/<name>.xml
npx wrangler pages deploy dist --project-name "${CF_PAGES_PROJECT:-thai-legal-watch}" --branch "${CF_PAGES_BRANCH:-main}" --commit-dirty=true
