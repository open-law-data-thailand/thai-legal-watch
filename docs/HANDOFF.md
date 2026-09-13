# Thai Legal Watch — progress and plan (handoff, 2026-09-13 21:00)

For the agent picking this up. Everything below is in this repo (`/Users/spicydog/Development/OpenLawData/thai-legal-watch`, git `main`, remote `open-law-data-thailand/thai-legal-watch`, **live at https://thai-legal-watch.pages.dev**, all checks green: pytest 30 · Vitest 181 · Playwright 102 (desktop+mobile, axe WCAG 2A/AA **including colour-contrast** on every page) · ESLint strict-type-checked · Prettier).

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
(shared `Facet.tsx`, breadcrumbs, RSS) · `provinces` ("ท้องถิ่นฉัน": dot map of the 77 seats +
region-grouped list) · `doc/<id>?m=` (coordinates, labels with evidence, four citation formats and a
permalink, PDF link — modern → source, legacy → HF monthly zip —, prev/next in the same ตอน,
"back to results") · `dashboard` (click a year to focus; stacked topic trend; funnel) ·
`graph` (force graph; year selector; family chips + text focus that dim instead of remove) · `#/about`.
Header: sticky indigo band, **QuickSearch** (topics, provinces, agencies, doc ids, and gazette
citations "เล่ม 143 ตอนพิเศษ 219 ง หน้า 23" resolved via `index/volumes` → month shard → page), `/` focuses it.
Home hero also carries **CiteLookup** — the same resolution with เล่ม / ตอน / หน้า as separate fields.
Footer: OpenLawData credit + disclaimer (verify against the original gazette).
Theme: light default, dark via `data-theme="dark"`; family colours (`lib/family.ts`) shared by
pills and graph; entrance/growth animations honouring `prefers-reduced-motion`.
Wording: "จำแนกหมวด / หมวดที่ยืนยัน / คาดว่า" — never "ติดป้าย".

Local preview with real data (`.claude/launch.json` runs the same thing as `tlw-preview`):
```bash
cd web && npm run build && rm -rf dist/data public/data && ln -s ~/olw-build/tlw-dist dist/data && npx vite preview --host 127.0.0.1 --port 4174
```
`npm run e2e` rebuilds `dist` **and** leaves fixture data in `public/data`, which every later
`vite build` copies back into `dist/data` — so remove both, not just `dist/data`, before re-linking.
Kill a stale preview on 4173 before e2e: `lsof -ti tcp:4173 | xargs kill`.

### infra/ and CI
`infra/deploy.sh <dist-data>` (build → copy data → `wrangler pages deploy`), `_headers`
(cache/CORS/atom), `wrangler.toml`; `.github/workflows/ci.yml` runs pipeline + web checks.
**Not yet deployed** — needs a Cloudflare Pages project (suggested `thai-legal-watch`), an API token
(Pages:Edit) and account id in `~/src/.env` on the build box (`CLOUDFLARE_API_TOKEN`,
`CLOUDFLARE_ACCOUNT_ID`).

### Data on the Mac
`~/olw-build/data/{taxonomy,meta}` — rsync from the box (`spicydog@192.168.21.124:olw-build/ontology/`
and `/mnt/soc-ratchakitcha/huggingface/soc-ratchakitcha/meta/`), last synced 2026-09-13 14:28.
Re-sync when the taxonomy changes. 2002–2004 are already complete locally but not yet on Hugging
Face, so the build stays at `--years 2005-2026`. Built output in `~/olw-build/tlw-dist`.

## Session 2 (2026-09-13 16:30–17:00) — what changed

Plan items 2, 3 and 4 are done; item 1 (deploy) is still blocked on credentials that live on the
build box, not on this Mac (`~/src/.env` does not exist here).

- **Content correctness (item 2).** `#/about` now matches the dataset README exactly: the human-read
  set is **450 ฉบับ = 300 สุ่มทั่วคลัง (100% [98.6–100]) + 150 หมวดที่ประชาชนค้นบ่อย (97.9%)** — it
  previously said "สุ่มทั่วคลัง 150 ฉบับ", which was wrong — plus the 95.5% coverage figure and a line
  saying the site does not measure or adjust any of it. Two new sections: **ช่วงปีที่มี และสิ่งที่ยังไม่มี**
  (2548–2569 only, why the pre-2005 years are absent, and that legacy PDFs were mis-paired upstream)
  and **การอ้างอิง**. Both PDF link shapes were checked against the live hosts: modern →
  `ratchakitcha.soc.go.th/documents/<n>.pdf` (200, application/pdf); legacy →
  `…/resolve/main/zip/<year>/<year-month>.zip` (200, ~160 MB for 2014-03). The doc page now says so
  next to the legacy link instead of letting a lawyer click a 160 MB zip unwarned.
- **Citation formats (item 3).** `lib/cite.ts`: มาตรฐาน · เชิงอรรถ (เลขไทย) · APA · พิกัดอย่างเดียว,
  picked with a `<select>` on the doc page, plus a **คัดลอกลิงก์** button (permalink). The title is
  quoted verbatim in every format, so a title containing Arabic digits keeps them even in the
  Thai-numeral footnote — deliberate, do not "fix" it.
- **Coordinate lookup on the hero (item 3).** `ui/CiteLookup.tsx` — เล่ม / ตอนที่ / ประเภทตอน /
  ตอนพิเศษ / หน้า as real fields, behind a `<details>` on the home hero. Resolves through the same
  `client.byCitation` path as quick search. Verified against real data: 143 / 219 ง พิเศษ / 23 →
  `2026-09-10-00125805`.
- **ท้องถิ่นฉัน (item 4).** New route `#/<source>/provinces` + a nav entry. A proportional-symbol
  **dot map**, not a choropleth: `lib/provinces.ts` holds the 77 provincial seats (lat/lon to ~0.1°)
  and a dependency-free equirectangular projection, because no province boundary geometry exists in
  any repo here and fetching one would add a licence and a megabyte to a static site. Dots are
  `<a>` with `aria-label`, so the map is keyboard- and screen-reader-navigable; a region-grouped list
  with a filter box sits beside it. The page states the real limitation: only 15,562 of 732,143
  documents (2.1%) carry a province, because many local agencies have `province: null` upstream.
- **Housekeeping.** `web/README.md` written (run, check, layout, conventions); the dead
  `DataClient.titles()` (no `titles/` in the contract) removed.
- **Tests.** 51 Vitest (was 39) · 24 Playwright across desktop+mobile with axe on every new page
  (was 20) · pytest 22 unchanged · ESLint and Prettier clean.

### Known, deliberate, not bugs
- **2002–2004 are not on the site.** They are complete locally (`~/olw-build/data/taxonomy/200{2,3,4}`,
  12 files each, sizes in line with 2005) but `taxonomy/openlawdata-taxonomy/` on Hugging Face still
  starts at 2005 — checked via the HF tree API this session. The site credits the *published*
  dataset, so it stays at 2005–2026 until `pub2002` lands. Then: `tlw-build --years 2002-2026`.
  2000–2001 remain sparse (awaiting OCR) and should stay out.
- **Dark theme is unreachable.** `:root[data-theme='dark']` is defined but nothing sets the attribute
  and nothing honours `prefers-color-scheme`. Several rules also hard-code `#fff` (`.card`, `.metric`,
  `.qs.big input`), so enabling it today would ship an unverified theme. Either finish it or drop it.
- **Preview trap, again.** `npm run build:fixtures` writes `web/public/data`, and every later
  `vite build` copies `public/` into `dist/` — so a plain `npm run build` after an e2e run silently
  replaces real data with fixtures. Delete both before re-linking:
  `rm -rf web/dist/data web/public/data && ln -s ~/olw-build/tlw-dist web/dist/data`.

## Session 3 (2026-09-13 17:00–17:45) — review fixes and the deploy pipeline

Everything here came out of the owner reading the running site.

- **Quick search was painted over** by the next section. `main > *` carries a filling entrance
  animation, which makes every direct child of `main` its own stacking context, so the dropdown's
  `z-index: 30` could not escape the hero. The hero now has `position: relative; z-index: 2`.
  Ranking changed too: prefix matches first, then kind, then size — typing one Thai vowel used to
  bury `ไฟฟ้า` under every name that merely contained it. Only the header box owns the `/` shortcut
  now; two instances used to race for it on the home page.
- **The hero on a wide screen** is a full-bleed band (`margin-inline: calc(50% - 50vw)` with the
  page gutter re-created as padding, `body { overflow-x: clip }`), `--maxw` grows to 1280px at
  1400px, the h1 is `text-wrap: balance` and no longer orphans a word, and the hero metrics are
  pinned to two columns.
- **A real map.** The dot map was not reading as a map. `web/scripts/build_provinces_map.py` turns
  Natural Earth 1:10m Admin 1 (public domain) into `web/public/map/thailand-provinces.json` — 77
  projected SVG paths, 70 KB raw / 26 KB gzipped, committed. Natural Earth's `name_local` is wrong
  for six Thai provinces (Bangkok is labelled จังหวัดเชียงใหม่), so the script maps the reliable
  English `name` through its own table. The page is now a quantile choropleth with a legend.
- **Typography and contrast.** `html` no longer pins 16px; body is 1.0625rem at line-height 1.75
  and paragraphs 1.8, because Thai stacks marks above and below the line. `--ink-3` went from
  #8a8a94 (3.5:1) to #66666f (5.5:1) and the band greys went up with it. Underlines now appear only
  in running text — the header, buttons, chips, pills and breadcrumbs no longer twitch on hover.
  **axe now checks colour-contrast** in e2e; it passes because the scan runs with reduced motion, so
  it no longer measures elements mid-fade and reports white-on-white.
- **PDF links never hand anyone a 160 MB zip.** `docLinks()` replaces `pdfLink()`: a modern id opens
  the gazette's own PDF (prominent `.btn.primary.big`); an older id, whose source document number
  the published dataset does not carry, goes to the gazette site to look the citation up, with the
  dataset's file *page* on Hugging Face as the second-best link.
- **The sparkline is interactive** — each bar is a link, hovering names the day and the count,
  clicking opens สำรวจ filtered to that day. Explore grew a `day` filter with a visible day
  selector (computed from the month shard already loaded), a province dropdown, and months shown in
  พ.ศ. Changing month/scope clears a stale day instead of silently returning nothing.
- **Wording pass over every page.** No untranslated jargon left in the UI (`rule`, `ML`, `field`,
  `funnel`, `โฟกัส`), "หัวข้อ" and "หมวด" unified on หมวด, evidence labels renamed
  (`head` → ข้อความขึ้นต้น, `partclass` → ประเภทตอน (ก ข ค ง)), and the About page rewritten.
- **e2e now covers every page**: 42 tests (was 24), including a route sweep that asserts every route
  titles itself and renders no error box, header search by keyboard, the sparkline day filter, the
  Explore province filter and pagination, the choropleth's 77 paths and legend, all four citation
  formats, and a test that no page anywhere links a `/resolve/…zip` download.
- **Deploy pipeline.** `infra/deploy.sh` now copies `_headers` (it never did), checks the Pages
  file-count and file-size limits before uploading, supports `--dry-run`, and prints the data's
  `generated_at`. `infra/nightly.sh` is the whole nightly in one cron entry: build to `tlw-dist.new`,
  swap only after the contract test passes, keep `tlw-dist.prev`, run the checks, then deploy.
  **`docs/DEPLOY.md` is the Cloudflare runbook** — project creation, the exact API-token scope,
  credentials on the build box, verification curls, custom domain, limits and rollback.
- **`agg/trends.json`** (8 KB): one number per year for every topic, action and govlevel, so the
  dashboard can show what is growing without fetching 22 year-graphs. `web/src/lib/trends.ts` has
  the maths (movers, month profile, year-to-date) and excludes the always-partial current year.
  **The dashboard redesign that consumes it is not written yet** — that is the next task.

### Fixture data has bitten twice
`npm run e2e` writes fixtures to `web/public/data`, and every later `vite build` copies `public/`
into `dist/` — so a plain rebuild silently replaced the real 732k-document preview with 40 synthetic
ones, which looked exactly like "the province page is broken". Fixed at the root: `prebuild` removes
`public/data`, and `npm run link:data` (or `npm run preview:real`) removes both and re-links.

## Session 4 — deployed, then audited

The site went up, and then everything was read again looking for what was missing rather than what
was asked for. Most of what follows was found that way, not reported.

### The root cause of three bugs
`eslint-plugin-react-hooks` was a dependency and was **never registered**. Turning it on found:
a `useMemo` whose hand-written dependency list never learned about `f.day` (so the day filter
changed the heading and the count while the list below kept showing the whole month), and two
ECharts effects that returned their cleanup **into a `.then()`**, so no chart was ever disposed —
the graph re-ran `echarts.init` once per keystroke in its filter box, each time adding another
resize listener, click handler and 1200 ms force layout.

### A rendering bug that produced a false statement
`Bars` measured every row against `rows[0]` instead of the maximum. Correct for sorted data, wrong
for the month-of-year profile, which arrives in calendar order: seven of twelve months computed
101–105% and were clipped to 100%. **I read the flat result off the screen and wrote copy saying
the months barely differ.** They differ by 23% — August 64,708 against April 52,665. Fixed, and the
copy now says what the data says. Worth remembering as a shape of mistake: a chart is evidence
about the code as much as about the data.

### What a reader hit before
- A thrown render took the entire page with it. There is an error boundary, remounted per route.
- A 404 said "โหลดข้อมูลไม่สำเร็จ — 404 for /data/…/topic/foo.json": blamed the network, leaked a
  path, offered no way on. It now says the thing is not in the archive.
- Empty lists rendered as a blank gap under a heading that promised something.
- `← กลับไปผลการค้นหา` had never worked: `tlw:lastExplore` was read in three places and written
  in none. สำรวจ writes it now.
- The copy buttons failed silently forever on a non-secure origin.
- All 76 topic pages shared one tab title; all 2,841 agency pages shared another.
- Four divisions rendered `NaN%`; two year lookups rendered `พ.ศ. NaN`.
- Typing in the title search pushed a history entry per character.

### Data volume
- Home's main button pointed at a whole year: up to 47 MB of JSON to parse. It points at the
  latest month. (The wire cost was never the problem — gzipped, the largest month is 512 KB.)
- Quick search pulled 186 KB gzipped of agency names on **every page**, sequentially. Lazy now.
- A legacy id with no `?m=` walked up to twelve shards. `index/months/<year>.json` (88 KB total)
  makes the median lookup one shard. Note: the source's per-year sequence is **not chronological**
  — 2014-01 holds ids 2014-006904…2014-009446 — so nothing may infer a month from an id number.
- The client evicts old month shards; browsing three years used to pin every one of them.
- A document page fetched all 1.8 MB of agency names to print one.

### Multi-source URLs were broken
The scheme exists so a second dataset can sit beside the gazette, and nearly every link was built
from the default source anyway — one keystroke in สำรวจ navigated you out of the source entirely.
There is a `useHref()` off the client context now, feed URLs come from the client, and an e2e test
walks every link on a page loaded under a different source id.

### Accessibility past the scanner
axe passes on every page, which is why all of this survived: quick search announced nothing while
arrowing (no `aria-activedescendant`, no option ids), every agency page claimed two current
locations, the dashboard's year was mouse-only, the graph canvas was an unlabelled div, and there
was no skip link past six nav items.

### Operations — three things that would have failed silently
1. `nightly.sh` **never pulled**: the site would have frozen at one commit with every step still
   reporting success. It pulls, and fails loudly if it cannot.
2. Its default data root does not exist on the build box (`~/olw-build/data`); the real one is
   assembled by `infra/link-dataset.sh` and named by `TLW_DATA_ROOT` in `~/src/.env`.
3. cron has no ssh agent, so a pull needs a deploy key — `infra/deploy-key.sh` generates one and
   prints the public half. **Still to do: paste it into GitHub and install the crontab line.**

Also: `deploy.sh` hardlinks the data instead of copying 800 MB every run, and verifies that the
edge actually serves the build it just made. `_headers` is generated per source, because Cloudflare
Pages **ignores a wildcard in the middle of a path** — measured, not guessed: a deploy carrying
both `/data/*/feeds/*` and a literal rule reported the literal one.

## Session 5 — deploying from CI, and a site a crawler can read

**Deploys run in GitHub Actions now.** `.github/workflows/ci.yml` runs the tests, then a `deploy`
job pulls `meta/` and `taxonomy/openlawdata-taxonomy/` from Hugging Face (~1.5 GB, public, no
token), builds, deploys and verifies the edge. Same workflow on a 16:00 UTC schedule — 23:00
Bangkok, after the dataset's own nightly. Push code; that is the whole job. Needs two repository
secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`.

Years are **discovered, not configured** — `infra/fetch-dataset.py` asks the repository which years
exist in *both* layers. This stopped being hypothetical while it was being written: 2002, 2003 and
2004 were published that day, and it picked all three up. The site goes 22 → 25 years with nobody
editing a range.

**Cloudflare Pages Git integration was considered and rejected, with numbers.** Builds time out at
20 minutes; build caching only covers package-manager directories, not an arbitrary 1.5 GB
download; and Pages has no scheduled builds, so it would still need an external trigger. Measured
against our timings (download ~5 min, `tlw-build` 48 s on a Mac but 550 s on the build box) that
lands near 16 of the 20 minutes, with every new year pushing closer. Worth revisiting only if the
data moves to R2, which would make the build 1.5 MB.

**~3,000 static pages.** A hash-routed app is one page to a crawler and one card to a link
unfurler. `tlw_pipeline/prerender.py` writes a real HTML twin of every topic, province and agency
page — title, description, canonical, og:, the facet's numbers, its 30 most recent documents —
plus `/directory` and a generated `sitemap.xml`. 41 MB, taking the deploy to 6,772 files against
Cloudflare's 20,000. They are twins, not doorways: each links straight to the interactive page.
`deploy.sh` moves `<dist-data>/_site/` to the site root; the fixture build does the same so e2e
tests the real shape.

**Document full text is blocked at the source, definitively.** The HF datasets-server fails to
build this dataset: `Failed to parse string: '1946-02-29' as a scalar of type timestamp[s]`. The
`meta/` layer is clean — 1,388,591 records scanned locally with zero impossible dates, and
`meta/1946/1946-02.jsonl` fetched from HF has only the 5th–26th — so the bad value is in the OCR
layer. Until that is fixed, `/rows` and `/filter` return errors and no per-document text lookup is
possible from a browser.

Also: `canonical`/`og:url` come from `VITE_SITE_URL` at build time (they were hardcoded to
pages.dev and would have pointed every shared link off-domain the day a custom domain landed); CI
runs `bash -n` and shellcheck over `infra/`; and the contract now requires `agg/trends.json`,
`index/months/` and the static pages, checks trend series lengths, and checks that the month index
covers exactly the shards on disk.

## Session 6 — the archive index (`agg/cube.bin`)

สำรวจ's "ทั้งหมด" view can now cross-filter the whole 25-year corpus in the browser. The build
emits every document's *dimensions* as a gzipped columnar index (topic, action, govlevel, province,
agency, document type, date, corroboration flags — one small integer each). Measured on the real
corpus: **504 KB over the wire, 7.3 MB of typed arrays, 11 ms to decompress, 0.8 ms per filtered
count with a group-by**; `agg/cube.json` (the header and code tables) is 178 KB, ~67 KB gzipped.

- Written by `pipeline/tlw_pipeline/cube.py`, read by `web/src/lib/cube.ts`; `cubequery.ts` adds
  the taxonomy rollup and the six per-dimension passes; `cubestore.ts` fetches, gunzips and keeps
  the compressed blob in IndexedDB keyed by the build stamp.
- **Gzipped in the file, not by the CDN.** Cloudflare compresses by content type and does not
  compress `application/octet-stream`. `cube.json` declares `encoding`, and the client also sniffs
  the gzip magic number, so a host that decompresses it for us is handled too.
- **Row i has no id** — it is the month in `months` whose range contains it, at that offset in
  `docs/<year>/<month>.json`. `emit.py` iterates `sorted(self.shards.items())` and calls
  `cube.add_month` *after* the per-shard sort so the two orders are the same thing; `contract.py`
  and two pytest cases check it.
- Titles are deliberately not in it: **306 MB** of UTF-8 for the whole archive, against 504 KB for
  all the dimensions. They come from the month shards (130–235 KB gzipped, 2.7 MB parsed each),
  six per round, and when a filter is too sparse to list that way the view offers the per-year
  counts the index already has — clicking a year switches to the year scope, which lists in full.
- The web e2e fixture now spans four years (`--years` on `tlw_pipeline.fixtures`) so the sparse
  path and the per-year breakdown are actually exercised in CI.
- **Staying current.** The stored copy is keyed by `meta.json`'s build stamp, so a nightly rebuild
  invalidates it by definition. The trap is that `cube.json` and `cube.bin` are two HTTP cache
  entries with independent ages, and a visit served from IndexedDB fetches only the header — so
  after a rebuild a browser can pair a fresh header with yesterday's blob. `buildCube` refuses that
  (it checks the blob against the header's `bytes`), and `fetchCube` then re-reads both with
  `cache: 'reload'` once. Do not "fix" that check by relaxing it; it is what makes a wrong pairing
  loud instead of silently wrong.

**Considered and rejected: SQLite Wasm / DuckDB-Wasm for this.** The runtime alone is ~0.5 MB
compressed — the size of the entire index — it needs `wasm-unsafe-eval` added to a CSP that is
currently `script-src 'self'`, and a row store with five indexes over 732k rows is tens of
megabytes where the column store is half of one. A range-request VFS trades that for several HTTP
round trips per query against 0.8 ms in memory, and the facet counts touch 692,284 rows, which is
the worst case for a B-tree. It would only start to pay if the questions outgrew these seven
dimensions. It does not solve full-text search either: the blocker there is the 306 MB of titles,
not the query engine.

### A bug this turned up
The counts beside a chip applied the corroboration rule and the filter did not, so "ล้มละลาย (12)"
would list more than twelve, and "ทุกหมวด" counted a different population from the chips under it.
`matches()` in `Explore.tsx` now requires `tc`/`ac`/`gc` for the three labelled dimensions — the
rule `aggregate.py` builds every topic, agency and province page with. The root chips now sum to
"ทุกหมวด" exactly, and a chip's number matches the topic page the pipeline wrote (both are e2e
assertions now). Counts also wait for their data rather than reading "(0)" for a second on each
month change.

## Session 7 — the night pass: filters that reflect each other, สถิติ, the graph, and full text

**สำรวจ: every number now comes from the archive index, in every scope.** The period dropdowns
used to count from `years.json`, which knows nothing about the rest of the page — with จังหวัดตรัง
chosen, the month list still offered "กันยายน 2569 (2,097)". A count beside an option has to
answer "what would I get if I chose this", and only the cube can answer that across periods. So
topics, actions, govlevels, provinces, document types, days, months and years are each counted
with their own filter lifted and the others kept. The list still comes from the month shards,
because only they carry titles and so only they can answer the title search — which the page now
says out loud rather than leaving to be inferred.
- Requests needing the same filter merge into one scan (`groupPasses`), so a page with nothing
  chosen answers nine facets in **one pass**. Building that key exposed the bug that had been
  costing the whole optimisation: an unchosen dropdown arrives as `action: undefined`, and
  `{action: undefined}` is not `{}` to anything comparing them. Filters are compacted first now.
- **The period filter names month files, not a date range** (`CubeFilter.shards`). That is a
  correctness fix as much as a speed one: 160 of 732,143 documents sit in a shard whose year their
  publication date disagrees with, and a count beside "เดือน 2556-11" has to mean what opening
  that month shows. ปี 2556 now reads 36,380 everywhere instead of 36,380 in one place and 36,379
  in another. A shard is contiguous rows, so a month scans ~2,000 rows instead of 773,000.
- A filter that finds nothing in the current period offers the nearest period that has some.

**สถิติ (was แดชบอร์ด).** Picking a year used to change four sections out of nine. Now every number
answers for the chosen year, including three breakdowns that could not exist before — province,
agency and document type; nobody built a `year × province` file and with 22 years and 77 provinces
nobody sensibly could. Every comparison names its baseline ("มากขึ้น 28% จากปี 2567 (38,864)"), the
movers table names its window, the bankruptcy panel says it is whole-archive because stages are
not in the per-year index, and a first year with nothing before it says so.

**ความสัมพันธ์.** A click used to leave the page, losing the layout and the filters. It now opens
the node beside the graph: what it is, its three most recent documents, what it sits next to and
how often, and three ways out (its page, the documents, a feed). Neighbours re-focus the panel.
The search box's matches are real buttons, because **a canvas has no elements** — until now the
graph could not be entered by keyboard or read by a screen reader at all. Zoom/shrink/reset are
labelled buttons. Two bugs found here: a pair joined both by co-occurrence and by the topic tree
was listed twice, and the canvas kept its old width when the panel opened, hanging over it and
swallowing its clicks (ResizeObserver on the stage, `overflow: hidden` as a backstop).

**Full text, read live from the dataset (`lib/ocr.ts`, `ui/FullText.tsx`).** The text layer is
~40 MB a month, 12 GB for the archive, so it cannot be built in — but it is one JSON object per
line sorted by `doc_id`, and Hugging Face answers range requests with CORS open. That makes the
file a sorted array we can seek in, with no new build artefact and no server. It brings
`announcement_date` (the date the document carries, which is not the date it reached the gazette),
`signatories`, `reference_numbers` and `method`/`score`.
- **Measured, then designed around.** Interpolating from the document's rank in its month does not
  work: records run 800–90,000 characters, so rank does not map to a byte offset, and legacy ids
  sort by number where the month file sorts by date. Eight-way probing was fast and asked HF for
  ~34 ranges per document, which earned a **connection reset** — it is five-way now, opt-in behind
  a button, and cached in IndexedDB. And the search advanced past a record by its **string** length
  rather than its **byte** length; Thai is three bytes a character, so it walked backwards and
  missed five of eight documents. There is a test for each.
- Current cost: **~17 requests, ~7 seconds, ~450 KB**, once per document, then instant. The fix is
  upstream — see `docs/DATA-WISHLIST.md` item 1.
- CSP now names `huggingface.co` and its CDN hosts in `connect-src`; a redirect is checked against
  it too. What comes back is rendered as text, never markup.

**Reach.** The front page opens with subjects read from the taxonomy, not with "what came out
today" — most people arrive with a subject, not a date. ล่าสุด carries its search into สำรวจ where
the archive is 22 years rather than 90 days. สำรวจ offers a feed when the filter is one facet and
says plainly why it cannot when it is crossed. A document ends with where to go next, each step
carrying the count that says whether it is worth taking. And the whole site prints: a document
page prints as the document, with the permalink and the date on it.

**Performance.** `import('echarts')` pulled every chart type and both renderers — 358 KB gzipped on
the two routes that draw. Naming the two it uses (`lib/charts.ts`) takes that to **190 KB**; the
app itself is 45 KB. A row-oriented `latest.json` was tried and abandoned: gzip already collapses
the repeated keys, so it saved 2% on the wire for a contract change. ล่าสุด filters 14,249 records
in **under a millisecond** per keystroke.

**`docs/DATA-WISHLIST.md` is new** — six asks with the measurement behind each, plus two data
findings: 4,457 agencies have fewer than five documents and many are the same agency under a name
truncated at a line break (8,207 documents with an issuer link that goes nowhere), and one
impossible date (`1946-02-29`) is blocking the Hugging Face viewer, search and filter for the
whole dataset, for everybody.

### The fixture foot-gun, fixed at last
`npm run e2e` rebuilds `dist` from fixtures *and* leaves fixture static pages in `public/` for the
next build to copy back in — so a preview quietly serves 160 synthetic documents beside a real
page. It has fooled three sessions. `link:data` and `prebuild` now clear all of it. Use
`TLW_DATA=~/olw-build/tlw-dist.cube npm run preview:real`, and **re-link after every e2e run**.

## Still open
- **Document links still unfurl as the home page.** Topics, provinces and agencies have static
  pages now; the 732,143 documents cannot, so a shared document link is still the site card.
  Prerendering the most-read documents (say, everything from the last year) would be ~40,000
  files — over Cloudflare's free 20,000 but inside the paid 100,000.
- **A custom domain needs `VITE_SITE_URL` and `--site` set to it**, or canonical, og: and the feeds
  will point at pages.dev.
- Document full text: blocked upstream, see above.
- **Pills that cannot be filtered.** In `LabelPills` only หมวด and หน่วยงาน are links, because only
  they have a pre-built facet page — the grey is not a hierarchy (หน่วยงาน is the same grey and
  *is* a link), and `.pill:hover` lifts all five, so three advertise themselves as clickable and
  are not. The archive index removed the reason: a pill can point at สำรวจ now. **Decided:
  replace, never add** — one filter, `scope=all`, same meaning wherever it is clicked. The full
  TODO, including why a "คาดว่า" pill must stay unlinked, is at the top of `LabelPills`.
- **The text layer costs 17 requests and 7 seconds per document.** Opt-in and cached, so it is
  usable, but `docs/DATA-WISHLIST.md` item 1 (a byte-offset index) would make it one request and
  30 KB, and would let it load with the page.
- **Legacy documents still have no direct PDF.** `pdf/` covers only 2026; everything older can
  only be pointed at the gazette's own search or a several-hundred-megabyte monthly zip. This is
  the site's worst remaining dead end — wishlist item 2.
- **Whole-archive title search** — see plan item 3; the box is disabled in the "ทั้งหมด" scope and
  says why.
- Housekeeping never done: a Lighthouse budget in CI, visual regression, and moving the topic
  family palette into CSS variables.
- Phase 2 (Functions + D1: watches, feedback, a bankruptcy tracker for juristic persons) is a
  feature, not a leftover.

## Plan (in order)

1. **Deploy** — get CF credentials; run `infra/deploy.sh ~/olw-build/tlw-dist`; set custom domain;
   verify `/data/ratchakitcha/agg/meta.json`, a feed URL, deep links. Then wire the nightly on the
   build box: after the dataset's nightly finishes, `tlw-build` (years 2002–2026 once published) →
   deploy. Keep `_headers` (data cached 1 h).
2. ~~Content correctness pass~~ — done, see Session 2. Re-check `#/about` against the dataset README
   whenever the sieve version changes; the numbers there are the dataset's, never ours.
3. ~~Lawyer features~~ — coordinate form and four citation formats done. Still open: **full-text
   search**. Title search works within a month or a year (the shards are the corpus); across the
   whole archive it does not, and no client-side format fixes that — the titles are 306 MB. It
   needs an index somewhere with a server: a Worker over R2/D1, or the HF parquet behind a
   power-user page. Not a format problem, a hosting one.
4. ~~"ท้องถิ่นฉัน"~~ — done as a dot map. If real boundaries are ever wanted, that needs a licensed,
   simplified province GeoJSON committed to the repo; the dot map needs nothing.
5. **Phase 2 (Cloudflare Functions + D1, all free tier)**: watches with magic-link accounts and a
   nightly Cron → Telegram/email digest; feedback on labels ("หมวดผิด") → review queue → gold set;
   juristic-person bankruptcy tracker (D1 FTS5 over names; never aggregate natural persons).
6. **Second data source**: implement `pipeline/tlw_pipeline/sources/<id>.py`, add its credit,
   run `tlw-build`; routes `#/<id>/…` and `data/<id>/…` already work; add a source switcher on home
   (reads `sources.json`).
7. Housekeeping: ~~`web/README` usage~~ done; Lighthouse budget in CI; visual regression (Playwright
   screenshots) once the design settles; move the family palette into CSS variables; finish or drop
   the dark theme; code-split ECharts (the bundle warns at 1.1 MB).

## Traps met today (don't repeat)
- Python `re.sub` with a replacement string containing `\d` → use a lambda; Prettier reformats
  files between edits, so anchor edits on stable tokens or regexes.
- Cloudflare Pages: ≤20,000 files/deploy, ≤25 MB/file — that is why agency pages need ≥5 docs.
- Vite preview serves whatever `dist/` holds; e2e overwrites it with fixture data.
- Home "กฎใหม่ของวัน" is legitimately empty on many days; the pipeline supplies `latest` as a fallback.
