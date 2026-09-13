# Data contract (v1)

Everything the site renders is a static JSON file produced by `pipeline/` from the
OpenLawData dataset. The web app never sees the dataset directly. Paths are relative to
`DATA_BASE_URL` (same origin by default; may point at a CDN/HF folder later).

Sizes are budgets: the site must stay fast on a phone, Cloudflare Pages caps a file at 25 MB.

| Path | Purpose | Budget |
|---|---|---|
| `agg/meta.json` | build stamp, source credit, year list, totals | <10 KB |
| `agg/taxonomy.json` | topic tree / actions / govlevels with counts | <100 KB |
| `agg/home.json` | latest publication day: counts per axis, highlights, 30-day sparkline | <100 KB |
| `agg/years.json` | docs per month per year | <50 KB |
| `agg/bankruptcy.json` | court × stage counts for the funnel | <200 KB |
| `agg/graph.json` | relationship graph: topics, their top agencies, topic↔agency and topic↔topic edge weights | <400 KB |
| `agg/topic/<slug>.json` | one topic: by year/action/govlevel, top agencies, provinces, recent docs | <150 KB |
| `agg/agency/<id>.json` | one agency: topics, actions, timeline, provinces, recent docs | <100 KB |
| `agg/province/<name>.json` | one province: local/provincial docs by topic, agencies, recent docs | <100 KB |
| `index/agencies.json` | `[{id,name,type,n,page}]` for search and linking; `page` says whether `agg/agency/<id>.json` exists (agencies with ≥5 documents) | <2.5 MB |
| `index/provinces.json` | `[{name,n}]` | <10 KB |
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

## Source credit

`agg/meta.json.sources[]` lists every dataset that fed the build (name, URL, license,
revision/date). The footer of every page renders it.

## Stability

Fields are added, never renamed or removed, within v1. A breaking change bumps
`agg/meta.json.contract` and the web app refuses to render a contract it does not know.
