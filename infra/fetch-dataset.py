#!/usr/bin/env python3
"""Pull the layers this site reads out of Hugging Face and lay them out for tlw-build.

    infra/fetch-dataset.py --out ~/tlw-data [--years 2005-2026]

The dataset is public, so no token is needed. Only `meta/` and
`taxonomy/openlawdata-taxonomy/` are fetched — not `ocr/` (hundreds of GB) and not `zip/`.

Years are *discovered*, not assumed: whatever the taxonomy layer has published, intersected with
--years, is what gets built. The day 2002–2004 go up, the next run picks them up on its own.

Needs `huggingface_hub`; the pipeline itself stays dependency-free on purpose.
"""
import argparse
import json
import os
import pathlib
import shutil
import sys
import urllib.request

REPO = "open-law-data-thailand/soc-ratchakitcha"
TAXONOMY = "taxonomy/openlawdata-taxonomy"
API = f"https://huggingface.co/api/datasets/{REPO}/tree/main/"


def hf_token() -> str | None:
    """A *read* token if one is offered. The dataset is public, so this is only about rate limits:
    Hugging Face limits anonymous requests per IP, and CI runners share their IPs with everyone
    else on the platform, which makes a daily job the thing most likely to be throttled.

    Read-only is the whole requirement. Never give this the token that publishes the dataset."""
    return os.environ.get("HF_TOKEN") or os.environ.get("HUGGING_FACE_HUB_TOKEN") or None


def verify(token: str) -> bool:
    """Does this token actually authenticate? A wrong one is accepted silently for public files."""
    req = urllib.request.Request("https://huggingface.co/api/whoami-v2")
    req.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.load(r).get("name") is not None
    except Exception:
        return False


def published_years(prefix: str, token: str | None) -> set[str]:
    """Year folders that actually exist under `prefix`, straight from the repository tree."""
    req = urllib.request.Request(API + prefix)
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    with urllib.request.urlopen(req, timeout=60) as r:
        tree = json.load(r)
    return {e["path"].rsplit("/", 1)[-1] for e in tree if e["path"].rsplit("/", 1)[-1].isdigit()}


def wanted(spec: str) -> set[str]:
    lo, _, hi = spec.partition("-")
    return {str(y) for y in range(int(lo), int(hi or lo) + 1)}


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True, help="download directory (kept between runs; reused)")
    ap.add_argument("--root", help="where to assemble the meta/ + taxonomy/ root (default <out>/root)")
    # Default: whatever both layers publish. Pinning a range here is how a site quietly stops
    # picking up new years — 2002–2004 went up the same day this was written.
    ap.add_argument("--years", help="range to intersect with what is published (default: all of it)")
    ap.add_argument("--print-years", action="store_true", help="print the years and exit")
    ap.add_argument("--emit-years", help="write the resolved range (e.g. 2002-2026) to this file")
    a = ap.parse_args(argv)

    try:
        from huggingface_hub import snapshot_download
    except ImportError:
        print("needs huggingface_hub:  pip install huggingface_hub", file=sys.stderr)
        return 1

    # a year is only usable if BOTH layers have it: meta gives titles and dates, taxonomy gives
    # the classification, and a year with one and not the other would build to nothing useful
    token = hf_token()
    if token and not verify(token):
        # A rejected token still downloads fine — the dataset is public — but claiming
        # "authenticated" in the log while being throttled as an anonymous caller is how a
        # rate-limit failure months from now becomes impossible to explain.
        print("hugging face: HF_TOKEN was rejected; continuing anonymously", file=sys.stderr)
        token = None
    print("hugging face:", "authenticated" if token else "anonymous (subject to per-IP rate limits)")
    both = published_years("meta", token) & published_years(TAXONOMY, token)
    ask = wanted(a.years) if a.years else both
    years = sorted(ask & both)
    if not years:
        print(f"no year in {a.years or 'the repository'} is published in both layers", file=sys.stderr)
        return 1
    # only worth reporting a gap inside the range, or a year someone explicitly asked for
    missing = sorted(y for y in ask - both if years[0] <= y <= years[-1]) if not a.years else sorted(ask - both)
    print(f"years: {years[0]}–{years[-1]} ({len(years)})" + (f" · missing: {missing}" if missing else ""))
    span = f"{years[0]}-{years[-1]}"
    if a.emit_years:
        pathlib.Path(a.emit_years).write_text(span, encoding="utf-8")
    if a.print_years:
        print(" ".join(years))
        return 0

    patterns = [f"meta/{y}/*" for y in years] + [f"{TAXONOMY}/{y}/*" for y in years] + [f"{TAXONOMY}/taxonomy.json"]
    snapshot_download(
        repo_id=REPO, repo_type="dataset", local_dir=a.out, allow_patterns=patterns,
        token=token or False, max_workers=8,
    )

    # tlw-build wants <root>/meta/<year>/ and <root>/taxonomy/<year>/; the repository nests the
    # taxonomy one level deeper because `taxonomy/` is shared by several publishers
    root = a.root or os.path.join(a.out, "root")
    os.makedirs(root, exist_ok=True)
    for name, target in (("meta", os.path.join(a.out, "meta")), ("taxonomy", os.path.join(a.out, TAXONOMY))):
        link = os.path.join(root, name)
        if os.path.islink(link) or os.path.exists(link):
            os.remove(link) if os.path.islink(link) else shutil.rmtree(link)
        os.symlink(os.path.abspath(target), link)

    size = sum(
        os.path.getsize(os.path.join(d, f))
        for layer in ("meta", TAXONOMY)
        for d, _, fs in os.walk(os.path.join(a.out, layer))
        for f in fs
    )
    print(f"downloaded {size / 1e9:.2f} GB → root {root}")
    print(f"next:  tlw-build --root {root} --out <dist> --years {span}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
