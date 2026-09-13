"""Accumulate everything the site's aggregate files need in one pass over the docs.

Headline numbers count corroborated labels only (see DATA_CONTRACT.md); the raw label is
still kept per document so the UI can show it as "คาดว่า".
"""
from __future__ import annotations

from collections import Counter, defaultdict
from dataclasses import dataclass, field

from .model import Doc

RECENT = 30        # recent docs kept per topic/agency/province page
TOP_AGENCIES = 50


def _recent_push(lst: list[dict], doc: Doc, n: int = RECENT) -> None:
    """Keep the n newest slim docs by (date, id); lists are small so insertion is fine."""
    item = {"id": doc.id, "t": doc.title, "d": doc.date, "a": doc.agency_ref, "pr": doc.province,
            "topic": doc.topic, "action": doc.action, "govlevel": doc.govlevel, "tc": doc.topic_c, "ac": doc.action_c}
    lst.append(item)
    if len(lst) > n * 4:
        lst.sort(key=lambda x: (x["d"] or "", x["id"]), reverse=True)
        del lst[n:]


def _finish_recent(lst: list[dict], n: int = RECENT) -> list[dict]:
    lst.sort(key=lambda x: (x["d"] or "", x["id"]), reverse=True)
    return lst[:n]


@dataclass
class Facet:
    total: int = 0
    by_year: Counter = field(default_factory=Counter)
    by_month: Counter = field(default_factory=Counter)
    by_topic: Counter = field(default_factory=Counter)
    by_action: Counter = field(default_factory=Counter)
    by_govlevel: Counter = field(default_factory=Counter)
    agencies: Counter = field(default_factory=Counter)
    provinces: Counter = field(default_factory=Counter)
    recent: list[dict] = field(default_factory=list)

    def add(self, d: Doc) -> None:
        self.total += 1
        self.by_year[d.year] += 1
        self.by_month[d.month] += 1
        if d.topic and d.topic_c:
            self.by_topic[d.topic] += 1
        if d.action and d.action_c:
            self.by_action[d.action] += 1
        if d.govlevel and d.govlevel_c:
            self.by_govlevel[d.govlevel] += 1
        if d.agency:
            self.agencies[d.agency] += 1
        if d.province:
            self.provinces[d.province] += 1
        _recent_push(self.recent, d)

    def out(self, agency_ids: dict[str, str]) -> dict:
        return {
            "total": self.total,
            "by_year": dict(sorted(self.by_year.items())),
            "by_month": dict(sorted(self.by_month.items())),
            "by_topic": dict(self.by_topic.most_common()),
            "by_action": dict(self.by_action.most_common()),
            "by_govlevel": dict(self.by_govlevel.most_common()),
            "agencies": [{"id": agency_ids[a], "name": a, "n": n} for a, n in self.agencies.most_common(TOP_AGENCIES)],
            "provinces": dict(self.provinces.most_common()),
            "recent": _finish_recent(self.recent),
        }


class Aggregator:
    def __init__(self, taxonomy: dict):
        self.taxonomy = taxonomy
        self.all = Facet()
        self.topics: dict[str, Facet] = defaultdict(Facet)
        self.agencies: dict[str, Facet] = defaultdict(Facet)
        self.agency_type: dict[str, str] = {}
        self.provinces: dict[str, Facet] = defaultdict(Facet)
        self.by_day: Counter = Counter()
        self.day_docs: dict[str, list[Doc]] = defaultdict(list)   # only kept for the newest days (see home)
        self.labelled = 0
        self.corroborated_any = 0
        self.extracted_stage: Counter = Counter()      # (court, stage) for the bankruptcy funnel
        self.parents = {s: v.get("parent") for s, v in taxonomy.get("topics", {}).items()}
        self._newest_day = ""

    def ancestors(self, slug: str) -> list[str]:
        out, cur = [], slug
        while cur:
            out.append(cur)
            cur = self.parents.get(cur)
        return out

    def add(self, d: Doc) -> None:
        self.all.add(d)
        if d.topic or d.action or d.govlevel:
            self.labelled += 1
        if d.topic_c or d.action_c or d.govlevel_c:
            self.corroborated_any += 1
        if d.topic and d.topic_c:
            for slug in self.ancestors(d.topic):          # a waste rule counts for pollution and environment too
                self.topics[slug].add(d)
        if d.agency:
            self.agencies[d.agency].add(d)
            if d.agency_type:
                self.agency_type[d.agency] = d.agency_type
        if d.province:
            self.provinces[d.province].add(d)
        if d.date:
            self.by_day[d.date] += 1
            self.day_docs[d.date].append(d)
            if len(self.day_docs) > 45:                     # keep memory flat: only the newest ~45 days matter
                for k in sorted(self.day_docs)[:-45]:
                    del self.day_docs[k]
        x = d.extracted
        if x.get("stage"):
            self.extracted_stage[(x.get("court") or "?", x["stage"])] += 1

    # ---- outputs -------------------------------------------------------------------------------
    def agency_ids(self) -> dict[str, str]:
        from .model import agency_id
        return {a: agency_id(a) for a in self.agencies}

    def home(self, latest: str | None = None) -> dict:
        """The newest publication day: counts per axis and highlights, plus a 30-day sparkline."""
        latest = latest or (max(self.by_day) if self.by_day else None)
        docs = self.day_docs.get(latest, []) if latest else []
        days = sorted(self.by_day)[-30:]
        # the day's rule-making, national level first, then by label weight
        highlights = [d for d in docs if d.action in ("rulemaking", "amendment", "repeal") and d.action_c]
        highlights.sort(key=lambda d: (d.govlevel != "central", -(d.labels[0].weight if d.labels else 0), d.id))
        return {
            "latest_date": latest,
            "count": len(docs),
            "parts": sorted({d.part for d in docs if d.part}),
            "volume": next((d.volume for d in docs if d.volume), None),
            "by_topic": dict(Counter(d.topic for d in docs if d.topic and d.topic_c).most_common()),
            "by_action": dict(Counter(d.action for d in docs if d.action and d.action_c).most_common()),
            "by_govlevel": dict(Counter(d.govlevel for d in docs if d.govlevel and d.govlevel_c).most_common()),
            "provinces": len({d.province for d in docs if d.province}),
            "bankruptcy_stages": dict(
                Counter(d.extracted.get("stage") for d in docs if d.extracted.get("stage")).most_common()),
            "highlights": [d.slim() | {"labels": []} for d in highlights[:12]],
            "sparkline": [{"d": k, "n": self.by_day[k]} for k in days],
        }
