"""Write dist-data/ from an Aggregator plus the per-month slim shards collected on the way."""
from __future__ import annotations

import json
import os
import re
import time
from collections import defaultdict

from . import CONTRACT_VERSION
from .aggregate import Aggregator
from .feeds import atom
from .model import Doc

_SAFE = re.compile(r"[^\w฀-๿-]+")
MIN_AGENCY_PAGE = 5
MIN_AGENCY_FEED = 50


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


class Emitter:
    def __init__(self, out: str):
        self.out = out
        self.shards: dict[tuple[str, str], list[dict]] = defaultdict(list)
        self.sizes: dict[str, int] = {}

    def add(self, d: Doc) -> None:
        self.shards[(d.year, d.month)].append(d.slim())

    def flush_year(self, year: str) -> None:
        """Shards are written per year so memory does not grow with the corpus."""
        for (y, m), docs in list(self.shards.items()):
            if y == year:
                docs.sort(key=lambda x: (x["d"] or "", x["id"]))
                self.sizes[f"docs/{y}/{m}.json"] = dump(os.path.join(self.out, "docs", y, f"{m}.json"), docs)
                del self.shards[(y, m)]

    def finish(self, agg: Aggregator, sources: list[dict], site: str) -> dict:
        ids = agg.agency_ids()
        tax = agg.taxonomy
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
            self._feed(f"topic/{slug}", o["thai"] or slug, o["recent"], site)
        for name, f in agg.agencies.items():
            # a page per agency would be ~10k files across the corpus (Pages caps a deploy at 20k):
            # agencies below the threshold are listed in the index and reached through search only
            if f.total < MIN_AGENCY_PAGE:
                continue
            o = f.out(ids) | {"id": ids[name], "name": name, "type": agg.agency_type.get(name)}
            self.sizes[f"agg/agency/{ids[name]}.json"] = dump(os.path.join(self.out, "agg/agency", f"{ids[name]}.json"), o)
            if f.total >= MIN_AGENCY_FEED:
                self._feed(f"agency/{ids[name]}", name, o["recent"], site)
        for name, f in agg.provinces.items():
            o = f.out(ids) | {"name": name}
            fn = f"{safe_name(name)}.json"
            self.sizes[f"agg/province/{fn}"] = dump(os.path.join(self.out, "agg/province", fn), o)
            self._feed(f"province/{safe_name(name)}", name, o["recent"], site)
        self.sizes["index/agencies.json"] = dump(os.path.join(self.out, "index/agencies.json"),
            [{"id": ids[a], "name": a, "type": agg.agency_type.get(a), "n": f.total, "page": f.total >= MIN_AGENCY_PAGE}
             for a, f in sorted(agg.agencies.items(), key=lambda kv: -kv[1].total)])
        self.sizes["index/provinces.json"] = dump(os.path.join(self.out, "index/provinces.json"),
            [{"name": p, "file": safe_name(p), "n": f.total}
             for p, f in sorted(agg.provinces.items(), key=lambda kv: -kv[1].total)])
        self.sizes["index/topics.json"] = dump(os.path.join(self.out, "index/topics.json"),
            [{"slug": s, "thai": v["thai"], "parent": v["parent"], "n": v["n"]} for s, v in topics_out.items()])
        self.sizes["agg/years.json"] = dump(os.path.join(self.out, "agg/years.json"),
            {"by_year": dict(agg.all.by_year), "by_month": dict(agg.all.by_month)})
        self.sizes["agg/home.json"] = dump(os.path.join(self.out, "agg/home.json"), agg.home())
        self.sizes["agg/bankruptcy.json"] = dump(os.path.join(self.out, "agg/bankruptcy.json"),
            {"by_court_stage": [{"court": c, "stage": s, "n": n} for (c, s), n in agg.extracted_stage.most_common()]})
        meta = {"contract": CONTRACT_VERSION, "generated_at": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
                "sources": sources, "years": sorted(agg.all.by_year), "docs": agg.all.total,
                "labelled": agg.labelled, "corroborated_any": agg.corroborated_any,
                "latest_date": max(agg.by_day) if agg.by_day else None, "site": site,
                "files": len(self.sizes) + 1, "bytes": sum(self.sizes.values())}
        self.sizes["agg/meta.json"] = dump(os.path.join(self.out, "agg/meta.json"), meta)
        return meta

    def _feed(self, feed_id: str, title: str, recent: list[dict], site: str) -> None:
        p = os.path.join(self.out, "feeds", f"{feed_id}.xml")
        os.makedirs(os.path.dirname(p), exist_ok=True)
        with open(p, "w", encoding="utf-8") as f:
            f.write(atom(f"{title} — Thai Legal Watch", feed_id, recent[:50], recent[0]["d"] if recent else None, site))
        self.sizes[f"feeds/{feed_id}.xml"] = os.path.getsize(p)
