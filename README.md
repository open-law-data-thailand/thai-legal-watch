# Thai Legal Watch

**[thai-legal-watch.openlawdatathailand.org](https://thai-legal-watch.openlawdatathailand.org)**

Thailand publishes every law, rule, appointment, land designation and bankruptcy notice in the
Royal Gazette — hundreds of documents a day, as scanned PDFs, with no way to ask it a question.
This reads the open dataset of that gazette and turns it into something you can actually use:
what came out today, what is on the subject you care about, what your province got, and the text
of the document itself.

No accounts, no tracking, no server. It is a static site; everything it shows is a file you can
fetch yourself.

**Data credit:** every document and label comes from
[OpenLawData — soc-ratchakitcha](https://huggingface.co/datasets/open-law-data-thailand/soc-ratchakitcha).
This site is a reader of that dataset, not a source. It is built to take other OpenLawData
datasets as additional _sources_ without moving anything already published.

---

## The two ideas worth stealing

**A columnar index of the whole archive, in the browser.** Pre-computing a file per facet means
only the questions somebody anticipated have answers, and every new pairing is another file. The
build instead ships every document's _dimensions_ — topic, action, government level, province,
agency, document type, date — as small integer codes in typed arrays: **about 550 KB over the
wire for 773,162 documents**, 7.7 MB of memory, and **under a millisecond** for a filtered count
with a group-by. So any combination of filters is instant, including ones nobody thought of, and every number on the site
comes from the same place. Titles stay out of it — 306 MB — and are read from month files only for
the documents actually shown. (`pipeline/tlw_pipeline/cube.py`, `web/src/lib/cube.ts`.)

**Reading one document's text out of a 10 GB layer with no server.** The dataset's text layer is
one JSON object per line, sorted by `doc_id`, and Hugging Face answers HTTP range requests with
CORS open — which makes the file a sorted array you are allowed to seek in. A parallel k-way
search finds one record in about a dozen range requests. No index to build, no backend: the sort
order the publisher already maintains _is_ the index. (`web/src/lib/ocr.ts`.)

## Layout

```
pipeline/   Python 3.11, no runtime deps: dataset → aggregates, month shards, feeds,
            the archive index, and 3,000 static pages for crawlers. `tlw-build`.
web/        Vite + Preact + TypeScript (strict). The site.
infra/      Deploy scripts, Cloudflare `_headers`, dataset fetch, live verification.
docs/       Architecture, the data contract, the deploy runbook, the handoff,
            and DATA-WISHLIST.md — what extra data would unlock, with measurements.
functions/  Reserved for Cloudflare Functions + D1 (watches, feedback). Not built yet.
```

## Running it

```bash
cd pipeline && pip install -e ".[dev]" && pytest      # the build
cd web && npm ci && npm run check                     # typecheck, lint, unit, e2e
tlw-build --root <dataset-root> --out <dist-data> --years 2005-2026
TLW_DATA=<dist-data> npm run preview:real             # the site against a real build
```

`docs/DEPLOY.md` covers Cloudflare. CI builds from the dataset and deploys on every push to
`main` and nightly at 23:00 Bangkok; pushing code is the whole job.

## What is checked, and why those things

- **pipeline** — pytest + ruff. A contract test validates a real build against
  `docs/DATA_CONTRACT.md`: every file present, every byte budget, and the invariants the site
  depends on — including that row _i_ of the archive index and offset _i_ of the month file are
  the same document, checked exhaustively.
- **web** — TypeScript strict, ESLint type-checked, Vitest, and Playwright on desktop **and**
  mobile with an axe WCAG 2A/AA scan (colour-contrast included) on every page.
- **The preview serves the production `_headers`**, so the e2e runs under the real
  Content-Security-Policy. That exists because a policy that was wrong only in production once
  blocked a whole feature while every test passed.
- **The deploy verifies itself** against the live edge afterwards, including following the text
  layer's redirect to check the deployed policy still allows wherever it lands.

## Licence and limits

The code is in this repository; the data belongs to OpenLawData and the gazette. Everything here
is generated automatically and can be wrong — **the Royal Gazette is the authority, not this
site**. Read `#/about` for the measured accuracy and what it does not cover.
