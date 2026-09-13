# Deploy — Cloudflare Pages

**Live:** https://thai-legal-watch.pages.dev (first deployed 2026-09-13, direct upload from the
build box). Deployment history and rollback are under Pages → thai-legal-watch → Deployments.

The site is static. A deploy is one directory: the built web app plus a pipeline build of the
data beside it at `dist/data`. Nothing runs on a server.

```
web/dist/
  index.html  assets/…  map/…   ← the app (small, built by Vite)
  _headers                      ← cache and CORS rules (copied from infra/_headers)
  data/
    sources.json
    ratchakitcha/{agg,index,docs,feeds}/…   ← ~800 MB, ~3,750 files
```

## Why the deploy runs on the build box, not in GitHub Actions

The data only exists where the source dataset lives. Building it needs `meta/` and
`taxonomy/openlawdata-taxonomy/` (several GB, rsynced from the NAS), and the result is ~800 MB.
GitHub Actions has neither, so CI runs the tests and the **build box runs the deploy**.

## One-time setup

### 1. Create the Pages project

In the Cloudflare dashboard: **Workers & Pages → Create → Pages → Upload assets**, name it
`thai-legal-watch`, and upload anything (a single `index.html` is fine) just to create the
project. Every later deploy replaces it. Do not connect it to the Git repository — a Git-connected
project would try to build in Cloudflare's runner, which has no dataset.

Equivalent from the command line, once the token below exists:

```bash
npx wrangler pages project create thai-legal-watch --production-branch main
```

### 2. Create an API token

**My Profile → API Tokens → Create Token → Custom token**

| field | value |
|---|---|
| Permissions | `Account` · `Cloudflare Pages` · `Edit` |
| Account Resources | Include · the account that owns the project |
| TTL | leave open, or set a rotation reminder |

Copy the token once — Cloudflare will not show it again. The account id is in the dashboard URL
(`dash.cloudflare.com/<account-id>/…`) or from `npx wrangler whoami`.

### 3. Put the credentials on the build box

```bash
cat >> ~/src/.env <<'ENV'
CLOUDFLARE_API_TOKEN=…
CLOUDFLARE_ACCOUNT_ID=…
ENV
chmod 600 ~/src/.env
```

`infra/deploy.sh` sources that file if the variables are not already in the environment. It is
gitignored; never commit it.

### 4. Node on the build box

A cron shell does not read `~/.bashrc`, so it gets `/usr/bin/node` — v18 on this box, which Vite 8
will not run on. `infra/node-env.sh` loads nvm if it is installed and refuses to continue on
anything older than Node 20, rather than failing halfway into a build. Check what cron would see:

```bash
ssh spicydog@192.168.21.124 'bash -lc "node -v"; ssh-add -l >/dev/null; env -i bash -c "node -v"'
```

If the second one is older than v20, either `nvm install --lts` (the scripts will find it) or
install a current Node system-wide.

### 5. First deploy

```bash
cd ~/src/thai-legal-watch
infra/deploy.sh ~/olw-build/tlw-dist --dry-run   # builds, checks the Pages limits, uploads nothing
infra/deploy.sh ~/olw-build/tlw-dist
```

Then verify, against the URL wrangler prints:

```bash
curl -s https://thai-legal-watch.pages.dev/data/ratchakitcha/agg/meta.json | head -c 200
curl -sI https://thai-legal-watch.pages.dev/data/ratchakitcha/feeds/topic/pollution_waste.xml | grep -i content-type
curl -sI https://thai-legal-watch.pages.dev/map/thailand-provinces.json | grep -i cache-control
```

and open a deep link in a browser: `…/#/ratchakitcha/provinces`, `…/#/ratchakitcha/dashboard`.

### 6. Custom domain

**Pages → thai-legal-watch → Custom domains → Set up a domain.** If the zone is already on
Cloudflare the record is created for you; otherwise add the `CNAME` the dashboard shows. HTTPS is
automatic. Afterwards, change nothing else — the app uses relative URLs throughout.

### 7. Nightly

`infra/nightly.sh` is the whole pipeline in one entry point: rebuild the data, run the pipeline and
web checks, deploy only if everything passed. Add it to the build box's crontab, after the
dataset's own nightly at 21:00:

```cron
0 23 * * * /home/spicydog/src/thai-legal-watch/infra/nightly.sh >> ~/tlw-nightly.log 2>&1
```

It writes the new build to `tlw-dist.new` and swaps it in only after `tlw-build` has validated
itself against `docs/DATA_CONTRACT.md`, keeping the previous build at `tlw-dist.prev`.

## Limits worth knowing

| limit | value | what it means here |
|---|---|---|
| files per deploy | 20,000 | ~3,750 today; this is why agency pages need ≥5 documents |
| file size | 25 MB | the largest month shard is ~10 MB raw |
| deploys | 500/month on the free plan | one a night is 30 |
| bandwidth | unmetered | the data is cached for an hour at the edge |

`infra/deploy.sh` checks the first two before uploading and fails loudly rather than halfway
through an upload.

## Rolling back

Cloudflare keeps every deploy. **Pages → Deployments → … → Rollback** puts the previous one back
immediately. To redeploy the previous *data* instead, `infra/deploy.sh ~/olw-build/tlw-dist.prev`.

## When 2002–2004 are published

The site covers only the years the dataset has published a taxonomy layer for. Once
`taxonomy/openlawdata-taxonomy/2002…2004` is on Hugging Face, change the years and redeploy:

```bash
TLW_YEARS=2002-2026 infra/nightly.sh
```
