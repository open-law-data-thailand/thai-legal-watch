# Thai Legal Watch — progress and plan (handoff, 2026-09-13 16:30)

For the agent picking this up. Everything below is in this repo (`/Users/spicydog/Development/OpenLawData/thai-legal-watch`, git `main`, 14 commits, all checks green: pytest 22 · Vitest 39 · Playwright 20 (desktop+mobile, axe WCAG 2A/AA on every page) · ESLint strict-type-checked · Prettier).

## What it is
A static site (Cloudflare Pages, no server cost) that reads the OpenLawData gazette dataset
(`meta/` + `taxonomy/openlawdata-taxonomy/`) and turns it into a daily, faceted, citable view of
the Royal Gazette for lawyers. Owner's brief: enterprise quality, full automated testing, credit
OpenLawData, design URLs/RSS so other datasets can be added later without moving anything.
Read `README.md`, `docs/ARCHITECTURE.md`, `docs/DATA_CONTRACT.md` first.

## Where things stand

### pipeline/ (Python 3.11, no runtime deps)
`tlw-build --root ~/olw-build/data --out ~/olw-build/tlw-dist --years 2005-2026`
→ 732,143 docs → 3,752 files, 787 MB in ~50 s, then validates itself against the contract.
- Output is **source-scoped**: `<out>/sources.json` + `<out>/ratchakitcha/{agg,index,docs,feeds}/`.
- `agg/`: meta, taxonomy (+counts), home (latest day: counts, highlights, `latest` fallback,
  30-day sparkline), years, topic/<slug>, agency/<id> (only agencies with ≥5 docs → 2,841 pages),
  province/<name>, bankruptcy (court×stage), graph (topics + top agencies + topic co-occurrence),
  graph/<year> (same per year).
- `index/`: agencies (with `page` flag), provinces, topics, **volumes/<เล่ม>.json** (ตอน → months, for
  citation lookup).
- `docs/<year>/<month>.json`: slim per-document records (the only per-document data; 2009–2012
  months reach 10 MB raw, ~1.5 MB compressed — budgets in `contract.py`).
- `feeds/{topic,province,agency}/<x>.xml`: Atom, links are `#/ratchakitcha/doc/<id>`.
- Source abstraction: `sources/openlawdata_soc.py` (id `ratchakitcha`). A new dataset = new module
  with its own `id`, `credit`, `years()`, `iter_docs()`, `taxonomy()`; the emitter and site never
  know where a record came from.
- `tlw_pipeline/fixtures.py` builds a synthetic dataset in the real layout; tests and the web e2e
  fixtures (`web/public/data`, gitignored) both come from it, so fixtures can't drift from the contract.
- Data facts learned: modern ids are `YYYY-MM-DD-NNNNNNNN` (legacy `YYYY-NNNNNN`); taxonomy `part`
  drops ตอนพิเศษ — the source module rebuilds `part` from meta (`"219 ง พิเศษ"`); `action` labels of
  bankruptcy notices are mostly uncorroborated (a sieve v7 item, not a site bug).

### web/ (Vite 8 + Preact + TypeScript strict)
Routes (hash, source-scoped): `#/` home (hero + quick search + today's numbers) ·
`#/ratchakitcha/explore` (scope month/year/all, chips and dropdowns with live counts, title search
with `<mark>` highlights, sub-topic chips, CSV) · `topic/<slug>`, `agency/<id>`, `province/<name>`
(shared `Facet.tsx`, breadcrumbs, RSS) · `doc/<id>?m=` (coordinates, labels with evidence, citation
copy button, PDF link — modern → source, legacy → HF monthly zip —, prev/next in the same ตอน,
"back to results") · `dashboard` (click a year to focus; stacked topic trend; funnel) ·
`graph` (force graph; year selector; family chips + text focus that dim instead of remove) · `#/about`.
Header: sticky indigo band, **QuickSearch** (topics, provinces, agencies, doc ids, and gazette
citations "เล่ม 143 ตอนพิเศษ 219 ง หน้า 23" resolved via `index/volumes` → month shard → page), `/` focuses it.
Footer: OpenLawData credit + disclaimer (verify against the original gazette).
Theme: light default, dark via `data-theme="dark"`; family colours (`lib/family.ts`) shared by
pills and graph; entrance/growth animations honouring `prefers-reduced-motion`.
Wording: "จำแนกหมวด / หมวดที่ยืนยัน / คาดว่า" — never "ติดป้าย".

Local preview with real data:
```bash
cd web && npm run build && rm -rf dist/data && ln -s ~/olw-build/tlw-dist dist/data && npx vite preview --host 127.0.0.1 --port 4174
```
(`npm run e2e` rebuilds `dist` with fixture data — re-link afterwards. Kill a stale preview on 4173 before e2e: `lsof -ti tcp:4173 | xargs kill`.)

### infra/ and CI
`infra/deploy.sh <dist-data>` (build → copy data → `wrangler pages deploy`), `_headers`
(cache/CORS/atom), `wrangler.toml`; `.github/workflows/ci.yml` runs pipeline + web checks.
**Not yet deployed** — needs a Cloudflare Pages project (suggested `thai-legal-watch`), an API token
(Pages:Edit) and account id in `~/src/.env` on the build box (`CLOUDFLARE_API_TOKEN`,
`CLOUDFLARE_ACCOUNT_ID`).

### Data on the Mac
`~/olw-build/data/{taxonomy,meta}` — rsync from the box (`spicydog@192.168.21.124:olw-build/ontology/`
and `/mnt/soc-ratchakitcha/huggingface/soc-ratchakitcha/meta/`), last synced 2026-09-13 14:28.
Re-sync when the taxonomy changes (it will when 2002–2004 publish tonight). Built output in
`~/olw-build/tlw-dist`.

## Plan (in order)

1. **Deploy** — get CF credentials; run `infra/deploy.sh ~/olw-build/tlw-dist`; set custom domain;
   verify `/data/ratchakitcha/agg/meta.json`, a feed URL, deep links. Then wire the nightly on the
   build box: after the dataset's nightly finishes, `tlw-build` (years 2002–2026 once published) →
   deploy. Keep `_headers` (data cached 1 h).
2. **Content correctness pass** (owner asked): every number and sentence on `#/about` must match the
   dataset README (accuracy 100% [98.6–100] random, 97.9% citizen topics, ~61% for uncorroborated);
   PDF links for legacy years point at the right monthly zip; the disclaimer stays in the footer.
3. **Lawyer features**: coordinate lookup exists in quick search — surface it as its own form on the
   home hero ("เล่ม / ตอน / หน้า" fields); "cite this" formats beyond the standard one (เชิงอรรถ / APA);
   full-text search is out of scope for static — consider DuckDB-WASM over HF parquet as a
   separate power-user page.
4. **"ท้องถิ่นฉัน"**: choropleth of 77 provinces (SVG map) feeding `province/<name>`; needs the
   province facet (exists) — many local agencies have `province: null` (dataset limitation; note it).
5. **Phase 2 (Cloudflare Functions + D1, all free tier)**: watches with magic-link accounts and a
   nightly Cron → Telegram/email digest; feedback on labels ("หมวดผิด") → review queue → gold set;
   juristic-person bankruptcy tracker (D1 FTS5 over names; never aggregate natural persons).
6. **Second data source**: implement `pipeline/tlw_pipeline/sources/<id>.py`, add its credit,
   run `tlw-build`; routes `#/<id>/…` and `data/<id>/…` already work; add a source switcher on home
   (reads `sources.json`).
7. Housekeeping: `web/README` usage; Lighthouse budget in CI; visual regression (Playwright
   screenshots) once the design settles; move the family palette into CSS variables.

## Traps met today (don't repeat)
- Python `re.sub` with a replacement string containing `\d` → use a lambda; Prettier reformats
  files between edits, so anchor edits on stable tokens or regexes.
- Cloudflare Pages: ≤20,000 files/deploy, ≤25 MB/file — that is why agency pages need ≥5 docs.
- Vite preview serves whatever `dist/` holds; e2e overwrites it with fixture data.
- Home "กฎใหม่ของวัน" is legitimately empty on many days; the pipeline supplies `latest` as a fallback.
