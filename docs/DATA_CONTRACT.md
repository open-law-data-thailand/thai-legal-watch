# Data contract (v1)

Everything the site renders is a static JSON file produced by `pipeline/` from the
OpenLawData dataset. The web app never sees the dataset directly. Paths are relative to
`DATA_BASE_URL` (same origin by default; may point at a CDN/HF folder later).

**Every path and every public URL is scoped by a source id** (`ratchakitcha` today):
`data/<source>/agg/…`, `data/<source>/feeds/…`, `#/<source>/topic/…`. A second dataset is a
second id beside it; nothing already published ever moves.

Sizes are budgets: the site must stay fast on a phone, Cloudflare Pages caps a file at 25 MB.

| Path | Purpose | Budget |
|---|---|---|
| `sources.json` | (root) every source in this build: `{id,title,credit,url,docs,latest_date}` — the site boots from it | <5 KB |
| `<source>/agg/meta.json` | build stamp, source credit, year list, totals | <10 KB |
| `agg/taxonomy.json` | topic tree / actions / govlevels with counts | <100 KB |
| `agg/home.json` | latest publication day: counts per axis, highlights, 30-day sparkline | <100 KB |
| `agg/years.json` | docs per month per year | <50 KB |
| `agg/latest.json` | every document of the last 90 days, newest first — the raw daily listing | <14 MB |
| `agg/trends.json` | one number per year for every topic, action and govlevel | <200 KB |
| `agg/cube.json` | header for `cube.bin`: row count, column layout, month ranges, code tables | <1 MB |
| `agg/cube.bin` | **gzipped** columnar index — every document's dimensions as small integers, so the browser can cross-filter the whole archive | <3 MB |
| `agg/bankruptcy.json` | court × stage counts for the funnel | <200 KB |
| `agg/graph.json` | relationship graph: topics, their top agencies, topic↔agency and topic↔topic edge weights | <400 KB |
| `agg/graph/<year>.json` | the same graph restricted to one year (node sizes and edges of that year; thai/parent come from `agg/graph.json`) | <400 KB |
| `agg/topic/<slug>.json` | one topic: by year/action/govlevel, top agencies, provinces, recent docs | <150 KB |
| `agg/agency/<id>.json` | one agency: topics, actions, timeline, provinces, recent docs | <100 KB |
| `agg/province/<name>.json` | one province: local/provincial docs by topic, agencies, recent docs | <100 KB |
| `index/agencies.json` | `[{id,name,type,n,page}]` for search and linking; `page` says whether `agg/agency/<id>.json` exists (agencies with ≥5 documents) | <2.5 MB |
| `index/provinces.json` | `[{name,n}]` | <10 KB |
| `index/volumes/<volume>.json` | `{volume, parts: {"219 ง": ["2026-09"]}}` — which month shard holds each ตอน of a เล่ม, for citation lookup | <200 KB |
| `index/topics.json` | `[{slug,thai,parent,n}]` | <20 KB |
| `docs/<year>/<year-month>.json` | slim document records for one month (the only place with per-document data; also the title-search corpus) | <12 MB (2009–2012 months reach 6–10 MB raw, ~1.5 MB compressed) |

| `feeds/topic/<slug>.xml`, `feeds/province/<name>.xml`, `feeds/agency/<id>.xml` | Atom, 50 newest | <100 KB |

## Slim document record (`docs/<year>/<month>.json` items)

```json
{"id":"2024-001232","t":"กฎกระทรวง …","d":"2024-03-29","v":141,"p":"17 ก","pg":4,
 "dt":"กฎกระทรวง","a":"3f9c1e2a7b","pr":null,
 "topic":"anticorruption","action":"rulemaking","govlevel":"central",
 "tc":false,"ac":true,"gc":true,
 "labels":[{"s":"rulemaking","x":"action","w":0.93,"c":true,"m":["partclass","dtype"]}],
 "x":{"stage":"absolute_receivership","court":"ศาลล้มละลายกลาง","case_number":"ล.123/2567"}}
```

- `id` is `pdf_file` without `.pdf`; it joins to every layer of the dataset.
- `a` is the agency id: first 10 hex of sha1 of the normalized agency string (stable across builds).
- `tc/ac/gc` are the corroboration flags of the headline labels; the UI shows an
  uncorroborated label as "คาดว่า" and never counts it in headline numbers.
- `x` is present only when the sieve extracted fields (bankruptcy today).
- Titles come from `meta/` (`doctitle`); coordinates and labels from the taxonomy layer.

## The archive index (`agg/cube.json` + `agg/cube.bin`)

A file per facet can only answer questions somebody anticipated: "waste rules in Trang" needs a
`topic×province` file that nobody built. The cube ships the *dimensions* of every document instead
— one small integer per field — and lets the browser answer any combination of them.

`cube.bin` is column-major: `agency` and `day` as `uint16`, then `topic`, `action`, `gov`, `prov`,
`dtype` and `flags` as `uint8`. Code `0` always means "none"; `codes` in `cube.json` maps the rest
back to slugs, names and ISO dates. `flags` carries the corroboration bits (1 topic, 2 action,
4 govlevel) so a client can apply the same rule the pipeline counts by.

**A row has no id.** Row *i* belongs to the month in `months` whose range contains it, at that
offset in `docs/<year>/<month>.json` — the pipeline writes the shards and the cube in one order,
and both `contract.py` and a test check every row of a build. Titles are deliberately absent: they
are 306 MB of text for the whole archive, against 504 KB for all the dimensions.

The blob is written gzipped because Cloudflare compresses by content type and does not compress
`application/octet-stream`. `cube.json` says so in `encoding`, and the gzip magic number is in the
first two bytes, so a client can tell what it got rather than having to be told.

Measured on the real corpus (732,143 documents, 261 months): 504 KB over the wire, 7.3 MB of typed
arrays in memory, 11 ms to decompress, and 0.8 ms for one filtered count with a group-by.

## Source credit

`agg/meta.json.sources[]` lists every dataset that fed the build (name, URL, license,
revision/date). The footer of every page renders it.

## Stability

Fields are added, never renamed or removed, within v1. A breaking change bumps
`agg/meta.json.contract` and the web app refuses to render a contract it does not know.
