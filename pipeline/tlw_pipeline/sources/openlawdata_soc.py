"""OpenLawData — soc-ratchakitcha: meta/ (titles, dates) + taxonomy/openlawdata-taxonomy/ (labels).

Local layout expected (mirrors the dataset):
    <root>/meta/<year>/<year-month>.jsonl
    <root>/taxonomy/<year>/<year-month>.jsonl      # openlawdata-taxonomy records
    <root>/taxonomy/taxonomy.json
Only years present in BOTH folders are built: a document without labels has nothing to show,
a label without meta has no title.
"""
from __future__ import annotations

import json
import os
import re
from collections.abc import Iterator

from ..model import TH_DIGITS, Doc, Label

SOURCE_ID = "ratchakitcha"   # the URL segment: #/ratchakitcha/…, data/ratchakitcha/…  — never changes once published
CREDIT = {
    "id": SOURCE_ID,
    "title": "ราชกิจจานุเบกษา",
    "name": "OpenLawData — soc-ratchakitcha",
    "url": "https://huggingface.co/datasets/open-law-data-thailand/soc-ratchakitcha",
    "layers": ["meta", "taxonomy/openlawdata-taxonomy"],
    "license": "see dataset card",
}

# The text layer is not built into the site: it is 40 MB a month and 10 GB for the archive. The
# site reads one record out of it at a time with HTTP range requests, so all it needs is where the
# files are. Declared here because the source module is the only thing that knows its own dataset;
# a build from a different dataset simply declares a different one, or none.
TEXT = {
    "base": "https://huggingface.co/datasets/open-law-data-thailand/soc-ratchakitcha/resolve/main/ocr/openlawdata-ocr",
    "layer": "ocr/openlawdata-ocr",
    "credit": "OpenLawData — soc-ratchakitcha (ชั้น ocr)",
    # The layer starts here. A lower bound rather than a range because the layer only ever grows
    # forward, so this is the part that stays true; a year above it may still miss a record, and
    # the reader is told so when it does. Without it the site offers to fetch the text of a 1950
    # document and spends seven seconds finding out there is none.
    "from": "2002",
}
_WS = re.compile(r"\s+")


def clean_title(s: str | None) -> str:
    return _WS.sub(" ", (s or "").strip())


def _int(v) -> int | None:
    try:
        return int(str(v).translate(TH_DIGITS))
    except (TypeError, ValueError):
        return None


class OpenLawDataSoc:
    name = "openlawdata-soc"
    id = SOURCE_ID
    credit = CREDIT

    def __init__(self, root: str):
        self.root = root
        self.meta_dir = os.path.join(root, "meta")
        self.tax_dir = os.path.join(root, "taxonomy")
        self.textindex_dir = os.path.join(root, "textindex")
        self._indexed: list[str] = []

    @property
    def text(self) -> dict:
        """Where the text layer is, and which years this build could read a position index for.

        That list is what lets the site say "there is no text" instead of taking seven seconds to
        discover it. The index accounts for *every byte* of each month file it describes — checked
        across 48 month files in four years, first entry at offset 0, each record's end exactly
        the next one's start, the last ending exactly at the file size — so inside a year it
        covers, a document with no position is a document the layer does not have."""
        return TEXT | ({"indexed": sorted(self._indexed)} if self._indexed else {})

    def years(self) -> list[str]:
        have = lambda d: {n for n in os.listdir(d) if n.isdigit()} if os.path.isdir(d) else set()  # noqa: E731
        return sorted(have(self.meta_dir) & have(self.tax_dir))

    def taxonomy(self) -> dict:
        with open(os.path.join(self.tax_dir, "taxonomy.json"), encoding="utf-8") as f:
            return json.load(f)

    def _months(self, year: str) -> list[str]:
        d = os.path.join(self.tax_dir, year)
        return sorted(fn[:-6] for fn in os.listdir(d) if re.fullmatch(r"\d{4}-\d{2}\.jsonl", fn))

    def _meta(self, year: str, month: str) -> dict[str, dict]:
        p = os.path.join(self.meta_dir, year, f"{month}.jsonl")
        out: dict[str, dict] = {}
        if not os.path.exists(p):
            return out
        with open(p, encoding="utf-8") as f:
            for line in f:
                if line.strip():
                    m = json.loads(line)
                    out[m["pdf_file"][:-4]] = m
        return out

    def _textindex(self, year: str) -> dict[str, tuple[int, int]]:
        """Where each of this year's records sits in its month file, if the publisher says.

        Optional by design: a year with no index just produces documents without a position, and
        the site falls back to searching the file. Read once per year — the file is a few
        megabytes and holds every month at once."""
        p = os.path.join(self.textindex_dir, year, "index.ndjson")
        out: dict[str, tuple[int, int]] = {}
        if not os.path.exists(p):
            return out
        self._indexed.append(year)
        with open(p, encoding="utf-8") as f:
            for line in f:
                if not line.strip():
                    continue
                r = json.loads(line)
                did, off, ln = r.get("doc_id"), r.get("offset"), r.get("length")
                if isinstance(did, str) and isinstance(off, int) and isinstance(ln, int) and ln > 0:
                    out[did] = (off, ln)
        return out

    def iter_docs(self, year: str) -> Iterator[Doc]:
        textat = self._textindex(year)
        for month in self._months(year):
            meta = self._meta(year, month)
            with open(os.path.join(self.tax_dir, year, f"{month}.jsonl"), encoding="utf-8") as f:
                for line in f:
                    if not line.strip():
                        continue
                    r = json.loads(line)
                    did = r["pdf_file"][:-4]
                    m = meta.get(did, {})
                    yield Doc(
                        id=did, year=year, month=month,
                        title=clean_title(m.get("doctitle")) or "(ไม่มีชื่อเรื่อง)",
                        # meta first, taxonomy as the fallback. The two layers disagree about
                        # 46 volumes and 1,009 dates across 790,052 records, and the เล่ม↔year
                        # invariant settles every one of them the same way: where only one layer
                        # can be right, it is meta — 15 volumes and 10 dates to nil. The wrong
                        # values in taxonomy are parse damage, not another opinion (`volume: 1`
                        # for a 2006 document, `1203` for a 2010 one). This page prints a
                        # citation people copy into filings, so the more reliable layer wins.
                        date=m.get("publishDate") or r.get("publish_date") or None,
                        volume=_int(m.get("bookNo")) or r.get("volume"),
                        # meta keeps ตอนพิเศษ (category "งพิเศษ"); the taxonomy's part drops it, and a citation needs it
                        part=_part(m) or r.get("part"), part_class=_letter(m.get("category")) or r.get("part_class"),
                        page=_int(m.get("pageNo")), doc_type=r.get("doc_type"),
                        agency=r.get("agency"), agency_type=r.get("agency_type"), province=r.get("province"),
                        topic=r.get("topic"), action=r.get("action"), govlevel=r.get("govlevel"),
                        topic_c=bool(r.get("topic_corroborated")), action_c=bool(r.get("action_corroborated")),
                        govlevel_c=bool(r.get("govlevel_corroborated")),
                        labels=[Label(lb["slug"], lb["axis"], float(lb.get("weight", 0)), bool(lb.get("corroborated")),
                                      list(lb.get("matched_by") or [])) for lb in r.get("labels") or []],
                        extracted={k: v for k, v in (r.get("extracted") or {}).items() if v not in (None, "", [])},
                        source=self.id,
                        # Being added upstream year by year — present for the older files, absent
                        # for 2013 onward as of 2026-09. Modern ids carry the same number in the
                        # id itself, so the site can still build the link; the years in between
                        # have neither, and that gap is what this field will close.
                        source_url=m.get("source_url") or None,
                        text_at=textat.get(did),
                        # published since 2026-09-14; absent in an older snapshot, and `None`
                        # there means "not stated", which is not the same as "no"
                        has_text=r["has_text"] if isinstance(r.get("has_text"), bool) else None,
                    )


def _letter(cat) -> str | None:
    return next((c for c in str(cat or "") if c in "กขคง"), None)


def _part(m: dict) -> str | None:
    """"219 ง พิเศษ" from section "219" + category "งพิเศษ"/"ง พิเศษ": letter, then พิเศษ when present."""
    sec = str(m.get("section") or "").strip()
    cat = str(m.get("category") or "").strip()
    letter = _letter(cat)
    if not sec and not letter:
        return None
    tail = " ".join(x for x in (letter, "พิเศษ" if "พิเศษ" in cat else None) if x)
    return f"{sec} {tail}".strip()
