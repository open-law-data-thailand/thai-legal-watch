# Thai Legal Watch

A daily, faceted view of what the Thai government publishes in the Royal Gazette —
built on the OpenLawData taxonomy layer, hosted as a static site on Cloudflare Pages
with a thin Cloudflare Functions + D1 layer for watches and feedback.

**Data credit:** every document, label and file comes from
[OpenLawData — soc-ratchakitcha](https://huggingface.co/datasets/open-law-data-thailand/soc-ratchakitcha)
(`meta/`, `taxonomy/openlawdata-taxonomy/`). The site is a reader of that dataset, not a source.
Other OpenLawData datasets are meant to plug in later as additional *sources*.

```
pipeline/   Python: dataset → aggregates, monthly shards, feeds  (runs nightly on the build box)
web/        Vite + Preact + TypeScript static site               (Cloudflare Pages)
functions/  Cloudflare Pages Functions + D1: watches, feedback   (phase 2)
infra/      wrangler config, D1 schema, deploy scripts
docs/       architecture, data contracts, runbooks
```

## Quality bar
- `pipeline`: pytest with synthetic fixtures + a contract test against the real data layout; ruff.
- `web`: TypeScript strict, ESLint, Vitest unit tests, Playwright e2e + axe accessibility on every page,
  Lighthouse budget. Every route renders from fixture data in CI without network.
- `functions`: Vitest with `@cloudflare/vitest-pool-workers` against a local D1.
- CI (GitHub Actions) runs all of it on every push; deploy only from `main` after green.

See `docs/ARCHITECTURE.md` and `docs/DATA_CONTRACT.md`.
