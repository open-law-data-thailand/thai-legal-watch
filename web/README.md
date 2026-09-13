# web — the Thai Legal Watch site

Vite + Preact + TypeScript (strict). Every page renders from the static JSON the pipeline
emits (`docs/DATA_CONTRACT.md`); there is no server and no API key.

## Run it

```bash
npm install
npm run dev            # dev server; needs data under public/data — see below
```

### With fixture data (what CI uses, no network)

```bash
npm run build:fixtures # writes public/data from pipeline/tlw_pipeline/fixtures.py, then builds
npx vite preview --host 127.0.0.1 --port 4173
```

### With the real dataset

Build it first (from `pipeline/`), then point `dist/data` at the output:

```bash
tlw-build --root ~/olw-build/data --out ~/olw-build/tlw-dist --years 2005-2026
npm run build && rm -rf dist/data && ln -s ~/olw-build/tlw-dist dist/data
npx vite preview --host 127.0.0.1 --port 4174
```

`npm run e2e` rebuilds `dist/` with fixture data, so re-link afterwards. Kill a stale
preview on 4173 first: `lsof -ti tcp:4173 | xargs kill`.

## Checks

```bash
npm run check   # typecheck + eslint + vitest (coverage) + playwright
npm run format  # prettier --check .
```

Playwright runs desktop and mobile projects and an axe WCAG 2.0 A/AA scan on every page.

## Layout

| path            | what                                                                                                                                                             |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/data/`     | typed client for the data contract, one cache per path; `types.ts` mirrors the contract                                                                          |
| `src/routes/`   | one module per page; `Facet.tsx` is shared by topic / agency / province                                                                                          |
| `src/ui/`       | presentational pieces — `QuickSearch` (topics, provinces, agencies, ids, citations), `CiteLookup` (เล่ม/ตอน/หน้า), `bits.tsx`                                    |
| `src/lib/`      | pure helpers: Thai dates and numerals (`thai`), citation formats (`cite`), citation parsing (`coords`), province points (`provinces`), topic families (`family`) |
| `src/router.ts` | hash router; every content route is scoped by source id (`#/ratchakitcha/…`)                                                                                     |

ECharts is loaded only on the routes that draw (dashboard, graph).

## Conventions

- Thai UI copy. "จำแนกหมวด / หมวดที่ยืนยัน / คาดว่า" — never "ติดป้าย".
- Headline numbers count corroborated labels only; an uncorroborated label always shows as คาดว่า.
- Accuracy figures on `#/about` come from the dataset's own README. Do not restate them from memory;
  read `taxonomy/openlawdata-taxonomy` in the dataset README and copy the numbers.
