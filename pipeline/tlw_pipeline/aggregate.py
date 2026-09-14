"""Accumulate everything the site's aggregate files need in one pass over the docs.

Headline numbers count corroborated labels only (see DATA_CONTRACT.md); the raw label is
still kept per document so the UI can show it as "คาดว่า".
"""
from __future__ import annotations

from collections import Counter, defaultdict
from dataclasses import dataclass, field

from .model import Doc

#: Words that sit in front of a body's name without changing which body it is. Upstream records
#: the same office under more than one form — `ของสำนักงานการบินพลเรือนแห่งประเทศไทย` alongside
#: `สำนักงานการบินพลเรือนแห่งประเทศไทย`, both in the same year — and without this the largest
#: "change of issuer" in the archive is an office handing a subject to itself.
LEAD_NOISE = ("ของ", "พนักงานเจ้าหน้าที่")


def same_body(a: str, b: str) -> bool:
    """Whether two agency strings are plainly the same office written two ways.

    Deliberately narrow: containment after stripping a leading noise word. Anything looser starts
    merging bodies that really are different — `สำนักงานคณะกรรมการกำกับหลักทรัพย์และตลาดหลักทรัพย์`
    and `คณะกรรมการกำกับตลาดทุน` share fifteen characters and are not the same authority.
    """
    def norm(x: str) -> str:
        x = "".join(x.split())
        for w in LEAD_NOISE:
            if x.startswith(w):
                x = x[len(w):]
        return x
    na, nb = norm(a), norm(b)
    return bool(na) and bool(nb) and (na in nb or nb in na)

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
        self.topic_pairs: Counter = Counter()          # two topic labels on one document → an edge in the graph
        self.topic_pairs_year: dict[str, Counter] = defaultdict(Counter)
        self.volume_parts: dict[int, dict[str, set[str]]] = defaultdict(lambda: defaultdict(set))  # volume → part → months
        self.topic_agency_year: dict[str, Counter] = defaultdict(Counter)   # (topic, agency) per year, corroborated topics
        self.doc_id_range: dict[str, dict[str, tuple[str, str]]] = defaultdict(dict)  # year → month → (min id, max id)
        self.action_year: dict[str, Counter] = defaultdict(Counter)   # action  → year → n, corroborated only
        self.gov_year: dict[str, Counter] = defaultdict(Counter)      # govlevel → year → n, corroborated only
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
        lo_hi = self.doc_id_range[d.year].get(d.month)
        self.doc_id_range[d.year][d.month] = (
            (d.id, d.id) if lo_hi is None else (min(lo_hi[0], d.id), max(lo_hi[1], d.id))
        )
        if d.volume and d.part:
            self.volume_parts[d.volume][d.part].add(d.month)
        if d.topic or d.action or d.govlevel:
            self.labelled += 1
        if d.topic_c or d.action_c or d.govlevel_c:
            self.corroborated_any += 1
        if d.topic and d.topic_c:
            for slug in self.ancestors(d.topic):          # a waste rule counts for pollution and environment too
                self.topics[slug].add(d)
        if d.action and d.action_c:
            self.action_year[d.action][d.year] += 1
        if d.govlevel and d.govlevel_c:
            self.gov_year[d.govlevel][d.year] += 1
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
        tl = sorted({lb.slug for lb in d.labels if lb.axis == "topic" and (lb.corroborated or lb.weight >= 0.7)})
        for i, a in enumerate(tl):
            for b in tl[i + 1:]:
                self.topic_pairs[(a, b)] += 1
                self.topic_pairs_year[d.year][(a, b)] += 1
        if d.topic and d.topic_c and d.agency:
            for slug in self.ancestors(d.topic):
                self.topic_agency_year[d.year][(slug, d.agency)] += 1
        x = d.extracted
        if x.get("stage"):
            self.extracted_stage[(x.get("court") or "?", x["stage"])] += 1

    # ---- outputs -------------------------------------------------------------------------------
    def overlaps(self, agency_ids: dict[str, str], only: set[str], per_topic: int = 25,
                 limit: int = 6) -> dict[str, list[dict]]:
        """For each agency, the other bodies working the same subjects.

        "Whose rules am I under" has a second half that nobody publishes: when several bodies
        share a subject, who else is in it. Overlap is measured as min(mine, theirs) summed over
        the subjects we both issue in — symmetric, and not simply a list of the largest agencies
        in the country, which is what a plain count would give.

        `only` keeps this to agencies that get a page; the rest are reachable by search and would
        double the work for nothing.
        """
        out: dict[str, list[dict]] = {}
        for name in only:
            mine = self.agencies[name].by_topic
            if not mine:
                continue
            shared: Counter = Counter()
            subjects: dict[str, set[str]] = defaultdict(set)
            for topic, n_mine in mine.items():
                for other, n_other in self.topics[topic].agencies.most_common(per_topic):
                    if other == name or other not in agency_ids:
                        continue
                    shared[other] += min(n_mine, n_other)
                    subjects[other].add(topic)
            rows = [{"id": agency_ids[o], "name": o, "n": n, "topics": sorted(subjects[o])}
                    for o, n in shared.most_common(limit)]
            if rows:
                out[name] = rows
        return out

    def handovers(self, min_year_total: int = 20, min_share: float = 0.3) -> list[dict]:
        """Subjects where the body issuing most of them changed, and when.

        A subject quietly moving from one authority to another is a fact about how the country is
        governed, and it is invisible in any single year's view. Only changes with something
        behind them are reported: a year needs `min_year_total` documents before its leader means
        anything, and the new leader has to hold `min_share` of that year — otherwise a subject
        with four documents a year appears to change hands constantly.

        Part-finished years are left out entirely. The newest year is always short — the archive
        stops at whatever was published this week — and a body that simply has not filed yet this
        year is not a body that has lost a subject.

        And a handover requires both bodies to still be in the field. Without that rule the
        largest finding in this archive was อากาศยาน "changing hands" from
        `ของสำนักงานการบินพลเรือนแห่งประเทศ` to `สำนักงานการบินพลเรือนแห่งประเทศไทย` — the same
        office, under a name that had a stray `ของ` in front of it until upstream cleaned it up.
        A renamed body stops appearing entirely; one that has genuinely been overtaken is still
        there, issuing less. Checking that costs one lookup and removes a whole class of
        non-findings that string comparison would never catch reliably.
        """
        whole = {y for y in self.all.by_year
                 if len({m for m in self.all.by_month if m.startswith(f"{y}-")}) == 12}
        leaders: dict[str, dict[str, tuple[str, int, int]]] = defaultdict(dict)
        for year, counts in self.topic_agency_year.items():
            if year not in whole:
                continue
            totals: Counter = Counter()
            best: dict[str, tuple[str, int]] = {}
            for (topic, agency), n in counts.items():
                totals[topic] += n
                if topic not in best or n > best[topic][1]:
                    best[topic] = (agency, n)
            for topic, (agency, n) in best.items():
                total = totals[topic]
                if total >= min_year_total and n >= total * min_share:
                    leaders[topic][year] = (agency, n, total)
        out: list[dict] = []
        for topic, per_year in leaders.items():
            years = sorted(per_year)
            change = None
            for a, b in zip(years, years[1:], strict=False):
                if per_year[a][0] != per_year[b][0]:
                    change = (a, b)
            if not change:
                continue
            a, b = change
            was, was_n, was_total = per_year[a]
            now, now_n, now_total = per_year[b]
            # still in the field in the year it lost? a rename simply vanishes
            if same_body(was, now):
                continue
            still = self.topic_agency_year.get(b, Counter()).get((topic, was), 0)
            if still < max(1, was_n * 0.1):
                continue
            out.append({
                "topic": topic, "year": b, "since": a,
                "was": {"name": was, "n": was_n, "of": was_total},
                "now": {"name": now, "n": now_n, "of": now_total},
            })
        out.sort(key=lambda r: (r["year"], r["now"]["n"]), reverse=True)
        return out

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
            # a day with no new rules still has a story: the strongest corroborated documents, national first
            "latest": [d.slim() | {"labels": []} for d in sorted(
                (d for d in docs if d.topic_c and d.topic not in ("bankruptcy", "court")),
                key=lambda d: (d.govlevel != "central", -(d.labels[0].weight if d.labels else 0), d.id))[:8]],
            "sparkline": [{"d": k, "n": self.by_day[k]} for k in days],
        }
