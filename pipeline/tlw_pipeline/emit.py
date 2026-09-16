"""Write dist-data/ from an Aggregator plus the per-month slim shards collected on the way."""
from __future__ import annotations

import json
import os
import re
import time
from collections import Counter, defaultdict

from . import CONTRACT_VERSION, agency_index
from .aggregate import Aggregator
from .cube import Cube
from .feeds import atom
from .model import Doc

_SAFE = re.compile(r"[^\w฀-๿-]+")
def coordinates(volume: int | None, part: str | None, page: int | None) -> str:
    """"เล่ม 143 ตอนพิเศษ 223 ง หน้า 1" — what a lawyer writes down, same as the web's cite.ts."""
    out = []
    if volume:
        out.append(f"เล่ม {volume}")
    if part:
        rest = re.sub(r"\s+", " ", part.replace("พิเศษ", "")).strip()
        out.append(f"ตอนพิเศษ {rest}" if "พิเศษ" in part else f"ตอนที่ {rest}")
    if page:
        out.append(f"หน้า {page}")
    return " ".join(out)


MIN_AGENCY_PAGE = 5
# how many days of raw listing the "ล่าสุด" page covers
LATEST_DAYS = 90
MIN_AGENCY_FEED = 50
# A feed is read by a machine that polls, so it has to cover the gap between two polls. This
# site rebuilds once a night and the gazette prints a median of 119 documents a day, 614 on its
# busiest — 200 covers an ordinary day and most of a heavy one. The per-topic feeds keep the
# aggregator's 30, which is right for a subject that sees a few documents a month.
FEED_ENTRIES = 200
# The front page lists the newest documents and pages through them. It cannot read latest.json to
# do it — that is 9 MB, and this is the page everybody lands on — so the newest slice ships as its
# own small file. Ten pages of 50; past that the page has earned the bigger download and fetches
# latest.json to keep going.
RECENT_DOCS = 500
# The gazette is four series, printed and numbered separately. Following all of them and
# following ก are different needs: ก is where statutes appear, about 1.4 documents a day, while
# ง is 98% of the volume. Anyone who wants "new law" and gets the firehose will stop reading.
PART_FEEDS = {
    "ก": ("laws", "ฉบับกฤษฎีกา", "พระราชบัญญัติ พระราชกฤษฎีกา กฎกระทรวง — กฎหมายที่ออกใหม่"),
    "ข": ("honours", "ฉบับทะเบียนฐานันดร", "เครื่องราชอิสริยาภรณ์และฐานันดรศักดิ์"),
    "ค": ("commerce", "ฉบับทะเบียนการค้า", "จดทะเบียนห้างหุ้นส่วน บริษัท เครื่องหมายการค้า"),
    "ง": ("general", "ฉบับประกาศทั่วไป", "ประกาศ ระเบียบ คำสั่ง และงานทั่วไปของราชการ"),
}


def safe_name(s: str) -> str:
    """Filesystem/URL-safe file stem for Thai names (provinces)."""
    return _SAFE.sub("_", s.strip())[:80] or "_"


def dump(path: str, obj) -> int:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, separators=(",", ":"))
    os.replace(tmp, path)
    return os.path.getsize(path)


def _feed_push(lst: list[dict], item: dict, n: int = FEED_ENTRIES) -> None:
    """Keep the n newest by (date, id). Sorting every 4n keeps this off the hot path."""
    lst.append(item)
    if len(lst) > n * 4:
        lst.sort(key=lambda x: (x["d"] or "", x["id"]), reverse=True)
        del lst[n:]


class Emitter:
    """Writes one source's tree under <root>/<source id>/; `root` keeps the cross-source sources.json."""

    def __init__(self, root: str, source: str):
        self.root = root
        self.source = source
        self.out = os.path.join(root, source)
        self.shards: dict[tuple[str, str], list[dict]] = defaultdict(list)
        self.sizes: dict[str, int] = {}
        # A lawyer checking the news wants the last few months in one list, newest first. Building
        # that from the month shards would be four requests and ~12 MB to parse on a page meant to
        # be opened every morning; dropping the evidence arrays makes it one request and a third
        # of the work. Kept as a date -> records map and trimmed after every year, so memory does
        # not grow with the corpus.
        self.latest: dict[str, list[dict]] = defaultdict(list)
        # "" is every document; the other keys are the gazette's four series. Held apart from
        # self.latest because a feed entry needs the citation and a listing row does not, and
        # because these keep 200 while the listing keeps 90 days.
        self.feeds: dict[str, list[dict]] = defaultdict(list)
        self.feed_index: list[dict] = []
        # counted here rather than on the Aggregator: only this one feed directory reads it, and
        # a field on Facet would land in every topic, agency and province file unread
        self.part_totals: Counter = Counter()
        self.labels: dict[str, str] = {}
        self.cube = Cube()

    def add(self, d: Doc) -> None:
        slim = d.slim()
        self.shards[(d.year, d.month)].append(slim)
        if d.date:
            # labels are the evidence trail and x the bankruptcy extras: neither is shown in a
            # listing, and together they are half the bytes
            self.latest[d.date].append({k: v for k, v in slim.items() if k not in ("labels", "x")})
            item = {"id": d.id, "t": d.title, "d": d.date, "pr": d.province, "topic": d.topic,
                    "action": d.action, "govlevel": d.govlevel, "dt": d.doc_type, "ag": d.agency,
                    "cite": coordinates(d.volume, d.part, d.page)}
            _feed_push(self.feeds[""], item)
            if d.part_class:
                self.part_totals[d.part_class] += 1
            if d.part_class in PART_FEEDS:
                _feed_push(self.feeds[d.part_class], item)

    def flush_year(self, year: str) -> None:
        """Shards are written per year so memory does not grow with the corpus."""
        # sorted, not insertion order: the cube's row order is the concatenation of these shards,
        # and it has to be reproducible from the files alone
        for (y, m), docs in sorted(self.shards.items()):
            if y == year:
                docs.sort(key=lambda x: (x["d"] or "", x["id"]))
                self.sizes[f"docs/{y}/{m}.json"] = dump(os.path.join(self.out, "docs", y, f"{m}.json"), docs)
                # after the sort, so a cube row and a shard position are the same thing
                self.cube.add_month(m, docs)
                del self.shards[(y, m)]
        for day in sorted(self.latest)[:-LATEST_DAYS]:
            del self.latest[day]

    def finish(self, agg: Aggregator, sources: list[dict], site: str, build: dict | None = None,
               text: dict | None = None, links: dict | None = None) -> dict:
        self.site = site
        ids = agg.agency_ids()
        tax = agg.taxonomy
        self.labels: dict[str, str] = {
            **{slug: v.get("thai") or slug for slug, v in tax.get("topics", {}).items()},
            **{slug: th for slug, th in tax.get("actions", {}).items()},
            **{slug: th for slug, th in tax.get("govlevels", {}).items()}}
        topics_out = {}
        for slug, t in tax.get("topics", {}).items():
            f = agg.topics.get(slug)
            topics_out[slug] = {"thai": t.get("thai"), "parent": t.get("parent"), "n": f.total if f else 0,
                                "children": [s for s, v in tax["topics"].items() if v.get("parent") == slug]}
        self.sizes["agg/taxonomy.json"] = dump(os.path.join(self.out, "agg/taxonomy.json"), {
            "topics": topics_out, "actions": tax.get("actions", {}), "govlevels": tax.get("govlevels", {}),
            "action_counts": dict(agg.all.by_action), "govlevel_counts": dict(agg.all.by_govlevel)})
        for slug, f in agg.topics.items():
            o = f.out(ids) | {"slug": slug, "thai": tax["topics"].get(slug, {}).get("thai"),
                              "parent": agg.parents.get(slug), "children": topics_out.get(slug, {}).get("children", [])}
            self.sizes[f"agg/topic/{slug}.json"] = dump(os.path.join(self.out, "agg/topic", f"{slug}.json"), o)
            self._feed(f"topic/{slug}", o["thai"] or slug, o["recent"], site, "topic", f.total)
        paged = {name for name, f in agg.agencies.items() if f.total >= MIN_AGENCY_PAGE}
        overlaps = agg.overlaps(ids, paged)
        for name, f in agg.agencies.items():
            # a page per agency would be ~10k files across the corpus (Pages caps a deploy at 20k):
            # agencies below the threshold are listed in the index and reached through search only
            if f.total < MIN_AGENCY_PAGE:
                continue
            o = f.out(ids) | {"id": ids[name], "name": name, "type": agg.agency_type.get(name),
                              "overlap": overlaps.get(name, [])}
            self.sizes[f"agg/agency/{ids[name]}.json"] = dump(os.path.join(self.out, "agg/agency", f"{ids[name]}.json"), o)
            if f.total >= MIN_AGENCY_FEED:
                self._feed(f"agency/{ids[name]}", name, o["recent"], site, "agency", f.total)
        for name, f in agg.provinces.items():
            o = f.out(ids) | {"name": name}
            fn = f"{safe_name(name)}.json"
            self.sizes[f"agg/province/{fn}"] = dump(os.path.join(self.out, "agg/province", fn), o)
            self._feed(f"province/{safe_name(name)}", name, o["recent"], site, "province", f.total)
        # Every page that shows an agency name loads this file, so it is the one index whose
        # size a reader actually feels. Three things are left out of it:
        #   `type` — declared, shipped, and read by nothing. The agency page's own "ประเภท" comes
        #     from that page's payload, not from here. It repeated `name` verbatim for 84% of
        #     rows, which made it a third of the file.
        #   `page` — always `n >= MIN_AGENCY_PAGE`, so agency_index derives it rather than store it.
        #   the shared head of each name — see agency_index, which is where the 2.64 MB went 811 KB.
        # Cutting what is already implied beats raising a budget: the budget is what noticed, twice.
        self.sizes["index/agencies.json"] = dump(os.path.join(self.out, "index/agencies.json"),
            agency_index.encode([{"id": ids[a], "name": a, "n": f.total}
                                 for a, f in agg.agencies.items()], MIN_AGENCY_PAGE))
        self.sizes["index/provinces.json"] = dump(os.path.join(self.out, "index/provinces.json"),
            [{"name": p, "file": safe_name(p), "n": f.total}
             for p, f in sorted(agg.provinces.items(), key=lambda kv: -kv[1].total)])
        self.sizes["index/topics.json"] = dump(os.path.join(self.out, "index/topics.json"),
            [{"slug": s, "thai": v["thai"], "parent": v["parent"], "n": v["n"]} for s, v in topics_out.items()])
        self.sizes["agg/years.json"] = dump(os.path.join(self.out, "agg/years.json"),
            {"by_year": dict(agg.all.by_year), "by_month": dict(agg.all.by_month)})
        self.sizes["agg/home.json"] = dump(os.path.join(self.out, "agg/home.json"), agg.home())
        # The whole archive, newest first: the one feed for "tell me what came out today".
        self._feed("latest", "ราชกิจจานุเบกษา ฉบับล่าสุด", self.feeds[""], site, "main",
                   agg.all.total, "ทุกฉบับที่ประกาศใหม่ ไม่แยกหมวด", FEED_ENTRIES)
        for letter, (slug, title, note) in PART_FEEDS.items():
            rows = self.feeds.get(letter) or []
            if rows:
                self._feed(f"part/{slug}", title, rows, site, "part",
                           self.part_totals.get(letter, 0), note, FEED_ENTRIES)
        days = sorted(self.latest, reverse=True)[:LATEST_DAYS]
        recent: list[dict] = []
        for day in days:
            if len(recent) >= RECENT_DOCS:
                break
            recent += sorted(self.latest[day], key=lambda r: (r.get("pg") or 0, r["id"]))
        self.sizes["agg/recent.json"] = dump(os.path.join(self.out, "agg/recent.json"),
                                             {"docs": recent[:RECENT_DOCS]})
        self.sizes["agg/latest.json"] = dump(os.path.join(self.out, "agg/latest.json"), {
            "days": LATEST_DAYS,
            "from": days[-1] if days else None,
            "to": days[0] if days else None,
            # newest first, and within a day by page, which is the order the gazette prints them
            "docs": [x for day in days
                     for x in sorted(self.latest[day], key=lambda r: (r.get("pg") or 0, r["id"]))],
        })
        # one small file with every series the dashboard draws, so it never fetches 22 year graphs
        years = sorted(agg.all.by_year)

        def series(by: dict) -> dict:
            return {k: [c.get(y, 0) for y in years] for k, c in by.items() if any(c.values())}

        self.sizes["agg/trends.json"] = dump(os.path.join(self.out, "agg/trends.json"), {
            "years": years,
            "topics": {s: [f.by_year.get(y, 0) for y in years] for s, f in agg.topics.items() if f.total},
            "actions": series(agg.action_year),
            "govlevels": series(agg.gov_year),
        })
        top_agencies = {a for f in agg.topics.values() for a, _ in f.agencies.most_common(6)}
        graph = {
            # `agencies_n` is how many distinct bodies have issued under this topic — the whole
            # count, not the six the edges below are trimmed to. It is the one number that says
            # whether a subject has one authority to deal with or a dozen, and counting it here
            # costs nothing because the tally already exists.
            "topics": [{"slug": s, "thai": v["thai"], "parent": v["parent"], "n": v["n"],
                        "agencies_n": len(agg.topics[s].agencies)}
                       for s, v in topics_out.items() if v["n"]],
            "agencies": [{"id": ids[a], "name": a, "n": agg.agencies[a].total} for a in top_agencies if a in ids],
            "topic_agency": [{"t": s, "a": ids[a], "n": n} for s, f in agg.topics.items()
                             for a, n in f.agencies.most_common(6) if a in ids],
            "topic_topic": [{"a": a, "b": b, "n": n} for (a, b), n in agg.topic_pairs.most_common(400)],
            # subjects where the body issuing most of them changed hands, newest first
            "handovers": agg.handovers()[:12],
        }
        self.sizes["agg/graph.json"] = dump(os.path.join(self.out, "agg/graph.json"), graph)
        # the same graph per year: node sizes, co-occurrence and agency edges of that year only
        for year in sorted(agg.all.by_year):
            ta = agg.topic_agency_year.get(year, Counter())
            gy = {
                "year": year,
                "topics": [{"slug": s, "n": f.by_year.get(year, 0)} for s, f in agg.topics.items() if f.by_year.get(year)],
                "agencies": [{"id": ids[a], "name": a, "n": agg.agencies[a].by_year.get(year, 0)}
                             for a in top_agencies if a in ids and agg.agencies[a].by_year.get(year)],
                "topic_agency": [{"t": s, "a": ids[a], "n": n} for (s, a), n in ta.most_common(1500)
                                 if a in top_agencies and a in ids],
                "topic_topic": [{"a": a, "b": b, "n": n}
                                for (a, b), n in agg.topic_pairs_year.get(year, Counter()).most_common(400)],
            }
            self.sizes[f"agg/graph/{year}.json"] = dump(os.path.join(self.out, "agg/graph", f"{year}.json"), gy)
        # A legacy document id (YYYY-NNNNNN) does not say which month it is in, so a link without
        # ?m= had to open shards one by one until it found it. Twelve numbers per year fix that.
        for year, months in sorted(agg.doc_id_range.items()):
            self.sizes[f"index/months/{year}.json"] = dump(
                os.path.join(self.out, "index/months", f"{year}.json"),
                {"year": year, "months": {m: [lo, hi] for m, (lo, hi) in sorted(months.items())}})
        # citation lookup: a lawyer types เล่ม/ตอน/หน้า; the site needs to know which month shard to open
        for vol, parts in agg.volume_parts.items():
            body = {"volume": vol, "parts": {p: sorted(m) for p, m in sorted(parts.items())}}
            self.sizes[f"index/volumes/{vol}.json"] = dump(os.path.join(self.out, "index/volumes", f"{vol}.json"), body)
        cube_bin, cube_json = self.cube.write(self.out)
        self.sizes["agg/cube.bin"] = cube_bin
        self.sizes["agg/cube.json"] = cube_json
        self.sizes["agg/bankruptcy.json"] = dump(os.path.join(self.out, "agg/bankruptcy.json"),
            {"by_court_stage": [{"court": c, "stage": s, "n": n} for (c, s), n in agg.extracted_stage.most_common()]})
        meta = {"contract": CONTRACT_VERSION, "generated_at": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
                "sources": sources, "years": sorted(agg.all.by_year), "docs": agg.all.total,
                "labelled": agg.labelled, "corroborated_any": agg.corroborated_any,
                "latest_date": max(agg.by_day) if agg.by_day else None, "site": site,
                "files": len(self.sizes) + 1, "bytes": sum(self.sizes.values()),
                # which code read which data: a reader looking at a number should be able to find
                # the exact commit that produced it, on both sides
                "build": build or {},
                # where the full text of a document can be read from, one record at a time. Not
                # built into the site — 10 GB — so the site range-reads it directly from the
                # publisher. Absent means the site simply does not offer full text.
                **({"text": text} if text else {}),
                # how many of the publisher's PDF links this build kept, and how many it withheld
                # because more than one document claimed the same file
                **({"links": links} if links else {})}
        self.sizes["agg/meta.json"] = dump(os.path.join(self.out, "agg/meta.json"), meta)
        # One request behind the feeds page. It lives with the other indexes, not in feeds/,
        # because the deploy gives everything under /data/<source>/feeds/ the Atom content type
        # and this is JSON. Sorted so the file is reproducible: the main feed first, then the
        # series, then the long tail by size within each group.
        order = {"main": 0, "part": 1, "topic": 2, "province": 3, "agency": 4}
        self.feed_index.sort(key=lambda f: (order.get(f["group"], 9), -f["n"], f["id"]))
        self.sizes["index/feeds.json"] = dump(os.path.join(self.out, "index/feeds.json"),
                                              {"feeds": self.feed_index})
        # the cross-source index the site boots from; other sources append themselves here
        idx_path = os.path.join(self.root, "sources.json")
        idx = {"contract": CONTRACT_VERSION, "sources": []}
        if os.path.exists(idx_path):
            with open(idx_path, encoding="utf-8") as f:
                idx = json.load(f)
        idx["sources"] = [s for s in idx["sources"] if s["id"] != self.source] + [{
            "id": self.source, "title": sources[0].get("title", self.source), "credit": sources[0].get("name"),
            "url": sources[0].get("url"), "docs": agg.all.total, "latest_date": meta["latest_date"],
            "generated_at": meta["generated_at"]}]
        idx["sources"].sort(key=lambda s: s["id"])
        dump(idx_path, idx)
        return meta

    def _feed(self, feed_id: str, title: str, recent: list[dict], site: str, group: str, n: int,
              note: str = "", limit: int = 50) -> None:
        p = os.path.join(self.out, "feeds", f"{feed_id}.xml")
        os.makedirs(os.path.dirname(p), exist_ok=True)
        items = sorted(recent, key=lambda x: (x["d"] or "", x["id"]), reverse=True)[:limit]
        # A feed is read by a person in their own reader, where there is no taxonomy to look a
        # slug up in: `public_admin · rulemaking` has to arrive as Thai or it says nothing.
        items = [it | {k: self.labels.get(it.get(k) or "", it.get(k)) for k in
                       ("topic", "action", "govlevel")} for it in items]
        with open(p, "w", encoding="utf-8") as f:
            updated = items[0]["d"] if items else None
            f.write(atom(f"{title} — Thai Legal Watch", feed_id, items, updated, site, self.source, note))
        self.sizes[f"feeds/{feed_id}.xml"] = os.path.getsize(p)
        # written from the same call that writes the file, so the directory cannot list a feed
        # that does not exist or miss one that does
        self.feed_index.append({"id": feed_id, "title": title, "group": group, "n": n,
                                "entries": len(items), **({"note": note} if note else {})})
