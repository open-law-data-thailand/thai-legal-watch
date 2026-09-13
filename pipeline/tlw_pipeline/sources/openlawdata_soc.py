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
    text = TEXT

    def __init__(self, root: str):
        self.root = root
        self.meta_dir = os.path.join(root, "meta")
        self.tax_dir = os.path.join(root, "taxonomy")

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

    def iter_docs(self, year: str) -> Iterator[Doc]:
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
                        date=r.get("publish_date") or m.get("publishDate") or None,
                        volume=r.get("volume") or _int(m.get("bookNo")),
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
