# Architecture

```
OpenLawData dataset (HF)          nightly, on the build box                 Cloudflare
 meta/<year>/<month>.jsonl  ──┐                                          ┌─ Pages (static: web/dist + dist-data)
 taxonomy/openlawdata-        ├──▶ pipeline build ──▶ dist-data/ ──▶ wrangler pages deploy
   taxonomy/<year>/<m>.jsonl ─┘        │                                  └─ Functions + D1 (phase 2: watches, feedback)
                                       └──▶ contract tests (schema + budgets) gate the deploy
```

- **Static first.** Every page renders from `dist-data/` JSON; no request needs a server.
  Deep links are hash routes (`#/doc/2024-001232`) because 790k document pages cannot be files.
- **Sources are pluggable.** `pipeline/tlw_pipeline/sources/` turns a dataset into unified
  `Doc` records; aggregation and rendering never know where a record came from. A second
  OpenLawData dataset is a second source module plus a credit line.
- **Trust is visible.** Headline numbers count corroborated labels only; every label shows
  what matched it; the about page carries the measured accuracy.
- **Privacy line.** Individuals appear only as the gazette prints them, one document at a
  time. Cross-document timelines are built for juristic persons only.
- **Dimensions travel, text does not.** Pre-building a file per facet means only anticipated
  questions have answers, and every new pairing is another file. The build instead ships every
  document's *dimensions* as a columnar index (`agg/cube.bin`, 504 KB for 732k documents) that the
  browser filters in under a millisecond, so any combination works. Titles stay in the month
  shards, which are fetched only for the documents actually shown — 306 MB of text could never
  have gone the same way.

## Web app

Vite + Preact + TypeScript (strict). `web/src/`:
- `data/` — typed client for the contract (`fetchJson`, caches, budgets), fixtures for tests
- `routes/` — one module per page; `router.ts` is a hash router with typed params
- `ui/` — presentational components (labels, coordinates, charts)
- `lib/` — pure helpers: Thai dates/numerals, citation formatter, slugging, search
- `lib/cube.ts` + `cubequery.ts` — the archive index: typed-array columns, one-pass filtering with
  group-bys, and the plan for turning matching rows back into documents within a shard budget
- `lib/cubestore.ts` — fetch, gunzip and keep it in IndexedDB keyed by the build stamp, so a
  return visit pays nothing; every part degrades to the network if storage is unavailable
Charts: ECharts loaded only on routes that draw.

## Testing

| layer | tool | what |
|---|---|---|
| pipeline | pytest + ruff | unit (aggregation, feeds, slimming) on synthetic data; contract test validates `dist-data` against `DATA_CONTRACT.md` budgets and schema |
| web unit | Vitest | lib helpers, data client, route parsing |
| web e2e | Playwright | every route renders from fixture data; axe a11y scan per page; visual smoke |
| functions | Vitest workers pool | API handlers against local D1 |
| CI | GitHub Actions | all of the above on push; deploy job only on `main` |
