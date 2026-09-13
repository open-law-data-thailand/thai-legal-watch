"""Validate a dist-data/ folder against DATA_CONTRACT.md: files, shapes, byte budgets."""
from __future__ import annotations

import json
import os

BUDGETS = {  # bytes
    "agg/meta.json": 10_000, "agg/taxonomy.json": 100_000, "agg/home.json": 100_000, "agg/years.json": 50_000,
    "agg/trends.json": 200_000, "index/months/": 5_000,
    "agg/bankruptcy.json": 200_000, "agg/graph.json": 400_000, "agg/graph/": 400_000,
    "agg/topic/": 150_000, "agg/agency/": 100_000, "agg/province/": 100_000,
    "index/agencies.json": 2_500_000, "index/volumes/": 200_000, "index/provinces.json": 10_000,
    "index/topics.json": 20_000,
    "docs/": 12_000_000, "feeds/": 100_000,
}
REQUIRED_DOC_KEYS = {"id", "t", "d", "v", "p", "pg", "dt", "a", "pr", "topic", "action", "govlevel",
                     "tc", "ac", "gc", "labels"}


def budget_for(rel: str) -> int | None:
    if rel in BUDGETS:
        return BUDGETS[rel]
    return next((b for k, b in BUDGETS.items() if k.endswith("/") and rel.startswith(k)), None)


def validate(root: str) -> list[str]:
    """Validate <root>/sources.json and every <root>/<source>/ tree."""
    problems: list[str] = []
    idx_path = os.path.join(root, "sources.json")
    if not os.path.exists(idx_path):
        return ["missing sources.json"]
    with open(idx_path, encoding="utf-8") as f:
        idx = json.load(f)
    if not idx.get("sources"):
        problems.append("sources.json lists no source")
    for s in idx.get("sources", []):
        problems += [f"[{s['id']}] {p}" for p in validate_source(os.path.join(root, s["id"]))]
    total = sum(len(files) for _, _, files in os.walk(root))
    if total > 19_000:
        problems.append(f"{total} files — Cloudflare Pages caps a deploy at 20,000")
    return problems


def validate_source(out: str) -> list[str]:
    problems: list[str] = []
    # trends.json and index/months/ are not decoration: the dashboard is built from the first and
    # opening a document by a legacy id depends on the second. If a future change stops emitting
    # them the site degrades quietly, which is exactly what a contract is for.
    for rel in ("agg/meta.json", "agg/taxonomy.json", "agg/home.json", "agg/years.json",
                "agg/trends.json", "index/agencies.json", "index/topics.json"):
        if not os.path.exists(os.path.join(out, rel)):
            problems.append(f"missing {rel}")
    if problems:
        return problems
    with open(os.path.join(out, "agg/meta.json"), encoding="utf-8") as f:
        meta = json.load(f)
    if meta.get("contract") != 1:
        problems.append(f"contract version {meta.get('contract')} != 1")
    if not meta.get("sources"):
        problems.append("meta.sources is empty — every build must credit its data")
    total_files = 0
    for root, _, files in os.walk(out):
        for fn in files:
            p = os.path.join(root, fn)
            rel = os.path.relpath(p, out).replace(os.sep, "/")
            total_files += 1
            b = budget_for(rel)
            if b is None:
                problems.append(f"unexpected file {rel}")
            elif os.path.getsize(p) > b:
                problems.append(f"{rel} is {os.path.getsize(p):,} B > budget {b:,}")
    with open(os.path.join(out, "agg/trends.json"), encoding="utf-8") as f:
        trends = json.load(f)
    for group in ("topics", "actions", "govlevels"):
        for slug, series in trends.get(group, {}).items():
            if len(series) != len(trends.get("years", [])):
                problems.append(f"trends.{group}.{slug}: {len(series)} points for {len(trends.get('years', []))} years")
                break

    for y in meta.get("years", []):
        d = os.path.join(out, "docs", y)
        if not os.path.isdir(d):
            problems.append(f"year {y} in meta but docs/{y}/ missing")
            continue
        # every shard of the year must be findable from the month index, or a document reached by
        # a link without ?m= silently falls back to opening all twelve
        mi = os.path.join(out, "index", "months", f"{y}.json")
        if not os.path.exists(mi):
            problems.append(f"year {y} in meta but index/months/{y}.json missing")
        else:
            with open(mi, encoding="utf-8") as f:
                indexed = set(json.load(f).get("months", {}))
            shards = {fn[:-5] for fn in os.listdir(d) if fn.endswith(".json")}
            if indexed != shards:
                problems.append(f"index/months/{y}.json covers {sorted(indexed - shards)} extra, "
                                f"misses {sorted(shards - indexed)}")
        for fn in os.listdir(d)[:1]:
            with open(os.path.join(d, fn), encoding="utf-8") as f:
                docs = json.load(f)
            if docs and not set(docs[0]) >= REQUIRED_DOC_KEYS:
                problems.append(f"docs/{y}/{fn}: record lacks {sorted(REQUIRED_DOC_KEYS - set(docs[0]))}")
            if docs != sorted(docs, key=lambda x: (x["d"] or "", x["id"])):
                problems.append(f"docs/{y}/{fn}: not sorted by date,id")
    return problems
