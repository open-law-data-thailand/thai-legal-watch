"""The one record shape every source must produce and every stage consumes."""
from __future__ import annotations

import hashlib
from dataclasses import dataclass, field

TH_DIGITS = str.maketrans("๐๑๒๓๔๕๖๗๘๙", "0123456789")


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

    @property
    def agency_ref(self) -> str | None:
        return agency_id(self.agency) if self.agency else None

    def slim(self) -> dict:
        d = {"id": self.id, "t": self.title, "d": self.date, "v": self.volume, "p": self.part, "pg": self.page,
             "dt": self.doc_type, "a": self.agency_ref, "pr": self.province,
             "topic": self.topic, "action": self.action, "govlevel": self.govlevel,
             "tc": self.topic_c, "ac": self.action_c, "gc": self.govlevel_c,
             "labels": [lb.slim() for lb in self.labels]}
        if self.extracted:
            d["x"] = self.extracted
        return d
