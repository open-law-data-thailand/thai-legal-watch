"""Validate a dist-data/ folder against DATA_CONTRACT.md: files, shapes, byte budgets."""
from __future__ import annotations

import json
import os

BUDGETS = {  # bytes
    "agg/meta.json": 10_000, "agg/taxonomy.json": 100_000, "agg/home.json": 100_000, "agg/years.json": 50_000,
    "agg/bankruptcy.json": 200_000,
    "agg/topic/": 150_000, "agg/agency/": 100_000, "agg/province/": 100_000,
    "index/agencies.json": 1_500_000, "index/provinces.json": 10_000, "index/topics.json": 20_000,
    "docs/": 6_000_000, "feeds/": 100_000,
}
REQUIRED_DOC_KEYS = {"id", "t", "d", "v", "p", "pg", "dt", "a", "pr", "topic", "action", "govlevel",
                     "tc", "ac", "gc", "labels"}


def budget_for(rel: str) -> int | None:
    if rel in BUDGETS:
        return BUDGETS[rel]
    return next((b for k, b in BUDGETS.items() if k.endswith("/") and rel.startswith(k)), None)


def validate(out: str) -> list[str]:
    problems: list[str] = []
    for rel in ("agg/meta.json", "agg/taxonomy.json", "agg/home.json", "index/agencies.json", "index/topics.json"):
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
    if total_files > 19_000:
        problems.append(f"{total_files} files — Cloudflare Pages caps a deploy at 20,000")
    for y in meta.get("years", []):
        d = os.path.join(out, "docs", y)
        if not os.path.isdir(d):
            problems.append(f"year {y} in meta but docs/{y}/ missing")
            continue
        for fn in os.listdir(d)[:1]:
            with open(os.path.join(d, fn), encoding="utf-8") as f:
                docs = json.load(f)
            if docs and not set(docs[0]) >= REQUIRED_DOC_KEYS:
                problems.append(f"docs/{y}/{fn}: record lacks {sorted(REQUIRED_DOC_KEYS - set(docs[0]))}")
            if docs != sorted(docs, key=lambda x: (x["d"] or "", x["id"])):
                problems.append(f"docs/{y}/{fn}: not sorted by date,id")
    return problems
