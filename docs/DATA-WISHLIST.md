# What extra data would unlock, in order of what it buys

Every item here is something the site cannot do today, with the measurement that says why and
what it would cost upstream. Numbers are measured, not estimated: the build of 2026-09-13 (732,143 documents locally,
773,162 in CI, 297 month files, 25 years) and the dataset's own tree API.

Nothing here is a bug report about the gazette. These are all about the *shape* of the published
dataset, and every one of them is small next to the data that already exists.

---

## 1. A byte-offset index for the text layer — the biggest single win

**Today.** The document page reads a document's own text straight out of
`ocr/openlawdata-ocr/<year>/<month>.jsonl` with HTTP range requests. That works — Hugging Face
answers `206` with CORS open, and the file is sorted by `doc_id`, so it is a sorted array we can
seek in. But finding one record takes a **binary search: 17 requests and about 7 seconds** in a
browser, measured on 2026-09 (20.8 MB). An earlier, faster version asked for 34 ranges per
document and earned a connection reset from Hugging Face, so the current one is deliberately
slower than it could be. And a document the layer skipped — extraction does not succeed for
every one — costs a **full search to discover an absence**.

**Ask.** Alongside each month file, a sidecar index:

```
ocr/openlawdata-ocr/<year>/<month>.idx.json
{"rows": [["2026-09-01-00121899", 0, 6477], ["2026-09-01-00121900", 6478, 7003], …]}
```

`[doc_id, byte offset, byte length]`, in file order. About 3,000 rows a month at ~45 bytes each:
**~135 KB raw, ~30 KB gzipped per month**, ~9 MB for the whole archive.

For scale, the layer it would index, measured from the tree API on 2026-09-14:

| | |
|---|---|
| `ocr/openlawdata-ocr/` | **9.97 GB** across 285 month files (2003–2026; the 2002 listing timed out) |
| smallest year | 2003, 154 MB |
| largest year | 2025, 686 MB |
| a recent month | 2026-09, 20.8 MB, ~2,100 records |

So the index is about **one part in a thousand** of what it indexes. It is also why this has to
come from whoever already has the bytes: building it means reading all ten gigabytes, which is a
one-off on a machine that holds the dataset and is not something a nightly CI job should do.

**Buys.** 17 requests and 7 seconds become **one request, ~30 KB, and one more of ~8 KB**. "This
document has no text" is answered instantly instead of after a full search. And the text could
then load with the page instead of behind a button, because it would cost about what a photograph
costs.

Anything that produces the file works — it does not have to be JSON, and a fixed-width binary
form would be a third the size. What matters is that it is published beside the layer and
regenerated when a month file is.

---

## 2. Per-document PDFs for the years before 2026 — the site's worst dead end

**Today.** `pdf/` contains only `2026/{2026-04, 2026-07, 2026-08, 2026-09}`. Documents with a
modern id (`YYYY-MM-DD-NNNNNNNN`) carry the gazette's own document number, so the site links
straight to `ratchakitcha.soc.go.th/documents/<n>.pdf`. Documents with a legacy id
(`YYYY-NNNNNN`) do not: **the only copy in the dataset is inside `zip/<year>/<month>.zip`, several
hundred megabytes for one page.** So for those years the site can only offer "go and search the
gazette's own site yourself".

That is roughly **every document before the modern id scheme** — the large majority of the
archive.

**Ask.** `pdf/<year>/<year-month>/<doc_id>.pdf`, the same layout as 2026, backfilled. If storage
is the constraint, even the most-read years first (most recent backwards) would remove the dead
end for most traffic.

**Buys.** Every document gets "open the original", which is the one thing a lawyer always wants
and the one thing the site currently cannot promise.

---

## 3. The debtor's name as a field on bankruptcy notices

**Today.** Bankruptcy is the largest single subject in the archive — **501,355 of 773,162
documents**. The debtor's name is in the title, in brackets:

> ประกาศเจ้าพนักงานพิทักษ์ทรัพย์ เรื่อง คำพิพากษาให้ลูกหนี้ล้มละลาย
> [คดีหมายเลขแดงที่ ล.7395/2568 **นายพงศ์นพัสร อภิภัทรนภากุล** ลูกหนี้]

The sieve already extracts `stage`, `court` and `case_number` into `x`. The name is the field
people actually search for — "is this counterparty in a bankruptcy notice?" is the single most
common question a business has of this archive — and the site can only answer it one year at a
time, because searching titles needs the month files and there are 297 of them.

**Ask.** `debtor_name` (and, where the notice distinguishes them, `debtor_type`:
natural person / juristic person) in the same `x` extras.

**Buys.** A per-year name index of a few hundred kilobytes instead of 306 MB of titles, which
makes counterparty checking a real feature rather than a manual year-by-year hunt. It also lets
the site keep its privacy line properly: cross-document timelines for **juristic persons only**
are only possible if the two can be told apart, which a name alone does not do.

---

## 3b. 673 documents from July 2025 lost their titles — and 660 of them are bankruptcy notices

Found while sweeping the built data for quality. The archive is in very good shape overall:
**0 duplicate ids, 0 missing publication dates, 0 missing เล่ม or ตอน** across 732,143 documents.
Two things stand out.

**One batch is broken.** `docs/2025/2025-07.json` holds 4,786 documents. **673 of them (14.1%)
carry an id with a `1998-` prefix and have no title at all** — while the other 4,113 in the same
month are all fine. Their เล่ม is 142 and their dates are 14–30 July 2025, both correct, so only
the id and the title went wrong.

| | |
|---|---|
| ids | `1998-001218` … `1998-015742` |
| dates | 2025-07-14 … 2025-07-30 |
| issuer | **660 of 673 are เจ้าพนักงานพิทักษ์ทรัพย์** (bankruptcy) |
| titles | none |

That makes this the same problem as item 3, concentrated: **the debtor's name lives in the
title**, so for 660 bankruptcy notices from two weeks of 2025 the name is simply not in the
dataset. Anyone checking a counterparty over that period gets a clean result that means nothing.

**Ask.** Re-ingest 2025-07. The ids suggest one run used the wrong year prefix and dropped
`doctitle` with it.

**Meanwhile**, the site no longer shows those as "(ไม่มีชื่อเรื่อง)": it names them by document
type and issuer and says the title is missing, so a reader can at least tell what they are looking
at and go to the PDF.

**One test record is published.** `2017-015965`, เล่ม 134, ตอน `ง พิเศษ` (no ตอน number), titled
**`ทดลองระบบ`** — "system test". Worth removing, and worth asking how it got in, since whatever
let it through may have let others.

---

## 4. Agency names that are cut off, or are not agency names

**Today.** 7,298 distinct agencies. **4,457 of them have fewer than five documents** — which is
also the threshold for getting a page, so those **8,207 documents (1.1%) have an issuer that
leads nowhere**. Many are plainly the same agency under a broken name:

| as published | documents | almost certainly |
|---|---|---|
| `สำนักงานคณะกรรมการกำกับและ` | 2 | `สำนักงานคณะกรรมการกำกับและส่งเสริมการประกอบธุรกิจประกันภัย` (84) |
| `คณะกรรมการการกระจายอำนาจให้แก่` | 1 | `คณะกรรมการการกระจายอำนาจให้แก่องค์กรปกครองส่วนท้องถิ่น` (96) |
| `การธนาคารออมสิน` | 3 | `ธนาคารออมสิน` (4,648) |
| `กรมขนส่งทางบก` | 1 | `กรมการขนส่งทางบก` |
| `กำหนด` | 2 | not an agency at all |

The pattern is a name truncated at a line break in the scan, or a fragment picked up as a name.

**Ask.** Either a canonical `agency_id` upstream, or the raw string kept beside a normalised one
so a consumer can do the merging itself. The site hashes the normalised name to make its ids, so
whatever upstream decides is canonical becomes the identity everywhere.

**Buys.** Correct agency counts (สถิติ currently says "7,298 หน่วยงาน" and means "7,298 spellings"),
working links for those 8,207 documents, and a quick-search that stops offering fragments.

---

## 5. One bad date blocks the Hugging Face viewer for the whole text layer

**Today.** `datasets-server` reports `viewer: false, search: false, filter: false` for the
dataset — only `preview` works. The conversion fails on
`Failed to parse string: '1946-02-29' as a scalar of type timestamp[s]`. February 1946 had 28
days, so this is a single impossible value, and it is **not in `meta/`** — that layer is clean
(1,388,591 records, 0 impossible dates; `meta/1946/1946-02.jsonl` runs only 5–26 February). So it
is in one of the text layers, in a date field.

**Ask.** Find and fix it. One record.

**Buys.** The Hugging Face viewer, `search` and `filter` for everybody using the dataset — not
just this site. `filter` would also be a second, independent route to reading one record.

---

## 6. 160 documents whose year prefix disagrees with their own date

**Today.** 160 of 732,143 (0.022%) sit in a month file whose year their `publish_date` disagrees
with. In every case checked, the **date and the เล่ม agree with each other** and the id's year
prefix is the odd one out:

| id | publish_date | เล่ม | เล่ม covers |
|---|---|---|---|
| `2013-028472` | 2005-01-25 | 122 | 2005 |
| `2008-006996` | 2007-01-23 | 125 | 2008 — here the *date* is the odd one |

So there are two different faults mixed together: documents ingested into a later year's folder
(harmless, the date is right), and dates misread by a year around the new year (a real error).

The site works around this by filtering on the month *file* rather than the date, so a count
beside "เดือน 2556-11" means what opening that month shows. But `publish_date` is the field
people cite from.

**Ask.** Low priority next to the rest — but a check that `publish_date` falls inside the year
its เล่ม covers would find the second kind cheaply.

---

## Not asked for, deliberately

**A full-text search index.** The titles alone are **306 MB of UTF-8**; the text is 10 GB. No
client-side format fixes that — it is not a query-engine problem, it is a corpus-size one. If
whole-archive search is wanted it needs an index with a server in front of it (a Worker over R2,
or the dataset's own `search` once item 5 is fixed). Items 1 and 3 give most of the practical
value without it.
