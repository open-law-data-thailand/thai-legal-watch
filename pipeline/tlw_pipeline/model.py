"""The one record shape every source must produce and every stage consumes."""
from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass, field

TH_DIGITS = str.maketrans("๐๑๒๓๔๕๖๗๘๙", "0123456789")

#: Every source_url the dataset publishes has this one shape, so the slim record can carry the
#: document number alone — an integer instead of a fifty-byte string, 1.4 million times over.
#: A URL that does not match is kept whole rather than dropped: the shape is an observation
#: about today's data, not a promise the publisher made.
GAZETTE_PDF = re.compile(r"^https://ratchakitcha\.soc\.go\.th/documents/(\d+)\.pdf$")

#: The largest integer a JSON number survives on the other side. The document numbers run from
#: five digits to eighteen — `documents/544639616062325576.pdf` is a real, fetchable PDF — and
#: anything past this would be read back by a browser as a *different*, rounded number, which
#: means a link to the wrong document rather than a missing one. Those keep their url whole.
JS_SAFE_INT = 2**53 - 1


def source_ref(url: str | None) -> int | str | None:
    """The smallest thing that can be turned back into `url` exactly, or None when there is none."""
    u = (url or "").strip()
    if not u:
        return None
    m = GAZETTE_PDF.match(u)
    if not m:
        return u
    n = int(m.group(1))
    return n if 0 < n <= JS_SAFE_INT else u


def agency_id(name: str) -> str:
    """Stable short id for an agency string (normalized upstream)."""
    return hashlib.sha1(name.strip().encode("utf-8")).hexdigest()[:10]


@dataclass(slots=True)
class Label:
    slug: str
    axis: str
    weight: float
    corroborated: bool
    matched_by: list[str] = field(default_factory=list)

    def slim(self) -> dict:
        return {"s": self.slug, "x": self.axis, "w": round(self.weight, 3), "c": self.corroborated,
                "m": self.matched_by}


@dataclass(slots=True)
class Doc:
    id: str                      # pdf_file minus .pdf
    year: str
    month: str                   # YYYY-MM
    title: str
    date: str | None             # YYYY-MM-DD
    volume: int | None
    part: str | None             # "17 ก", "211 ง พิเศษ"
    part_class: str | None
    page: int | None
    doc_type: str | None
    agency: str | None
    agency_type: str | None
    province: str | None
    topic: str | None
    action: str | None
    govlevel: str | None
    topic_c: bool
    action_c: bool
    govlevel_c: bool
    labels: list[Label] = field(default_factory=list)
    extracted: dict = field(default_factory=dict)
    source: str = "openlawdata-soc"
    source_url: str | None = None   # the publisher's own link to the PDF, when it gives one
    #: (offset, length) of this record inside its month file in the text layer, from the
    #: publisher's index. Lets the site read the text in one request instead of searching a file
    #: it cannot download — the search costs seventeen requests and about seven seconds.
    text_at: tuple[int, int] | None = None

    @property
    def agency_ref(self) -> str | None:
        return agency_id(self.agency) if self.agency else None

    def slim(self) -> dict:
        d = {"id": self.id, "t": self.title, "d": self.date, "v": self.volume, "p": self.part, "pg": self.page,
             "dt": self.doc_type, "a": self.agency_ref, "pr": self.province,
             "topic": self.topic, "action": self.action, "govlevel": self.govlevel,
             "tc": self.topic_c, "ac": self.action_c, "gc": self.govlevel_c,
             "labels": [lb.slim() for lb in self.labels]}
        ref = source_ref(self.source_url)
        if ref is not None:
            d["u"] = ref
        if self.text_at:
            d["tx"] = list(self.text_at)
        if self.extracted:
            d["x"] = self.extracted
        return d
