"""tlw-build: dataset root → dist-data/.

    tlw-build --root ~/olw-build/data --out dist-data [--years 2024,2025] [--limit 5000]
    tlw-build --validate dist-data
"""
from __future__ import annotations

import argparse
import os
import sys
import time

from . import prerender
from .aggregate import Aggregator
from .contract import validate
from .emit import Emitter
from .feeds import SITE
from .sources.openlawdata_soc import OpenLawDataSoc

CODE_REPO = "https://github.com/open-law-data-thailand/thai-legal-watch"


def git_head(repo: str | None = None) -> str:
    """The commit this code is. Empty outside a checkout, which is fine — it is provenance, not
    a requirement."""
    import subprocess
    try:
        out = subprocess.run(["git", "rev-parse", "HEAD"], capture_output=True, text=True,
                             timeout=10, cwd=repo or os.path.dirname(os.path.dirname(__file__)))
        return out.stdout.strip() if out.returncode == 0 else ""
    except (OSError, subprocess.SubprocessError):
        return ""


def build(root: str, out: str, years: list[str] | None = None, limit: int | None = None,
          site: str = SITE, dataset_revision: str = "", code_revision: str = "") -> dict:
    src = OpenLawDataSoc(root)
    todo = years or src.years()
    missing = set(todo) - set(src.years())
    if missing:
        sys.exit(f"years not present in both meta/ and taxonomy/: {sorted(missing)}")
    agg = Aggregator(src.taxonomy())
    em = Emitter(out, src.id)
    t0 = time.time()
    n = 0
    for y in todo:
        k = 0
        for d in src.iter_docs(y):
            agg.add(d)
            em.add(d)
            n += 1
            k += 1
            if limit and k >= limit:
                break
        em.flush_year(y)
        print(f"  {y}: {k:,} docs · {time.time() - t0:.0f}s", flush=True)
    # strip: an empty-ish value from a shell variable that did not expand must read as absent,
    # not become a link to <repo>/commit/ with nothing after it
    build_info = {
        "code": {"repo": CODE_REPO, "sha": (code_revision or git_head()).strip()},
        "dataset": {"repo": src.credit.get("url", ""), "sha": dataset_revision.strip()},
    }
    meta = em.finish(agg, [src.credit | {"built_from_years": todo}], site, build_info,
                     getattr(src, "text", None))
    # A hash-routed app is one page to a crawler and one card to a link unfurler. The facets can
    # each be a real file — about three thousand of them — so they are.
    pages = prerender.write(out, src.id, site)
    print(f"built {n:,} docs → {meta['files']:,} files, {meta['bytes'] / 1e6:.1f} MB in {time.time() - t0:.0f}s"
          f" · {len(pages):,} static pages")
    return meta


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="tlw-build")
    ap.add_argument("--root", help="dataset root with meta/ and taxonomy/")
    ap.add_argument("--out", default="dist-data")
    ap.add_argument("--years", help="2024 | 2020-2026 | 2024,2025")
    ap.add_argument("--limit", type=int, help="docs per year (smoke builds)")
    ap.add_argument("--site", default=SITE)
    ap.add_argument("--dataset-revision", default="", help="Hugging Face commit sha the data came from")
    ap.add_argument("--code-revision", default="", help="git sha of this code (default: git rev-parse HEAD)")
    ap.add_argument("--validate", metavar="DIR", help="only validate an existing dist-data/")
    a = ap.parse_args(argv)
    if a.validate:
        problems = validate(a.validate)
        for p in problems:
            print("✗", p)
        print("contract OK" if not problems else f"{len(problems)} problem(s)")
        return 1 if problems else 0
    if not a.root:
        ap.error("--root is required to build")
    years = None
    if a.years:
        years = []
        for part in a.years.split(","):
            if "-" in part:
                lo, hi = part.split("-")
                years += [str(y) for y in range(int(lo), int(hi) + 1)]
            else:
                years.append(part)
    build(a.root, a.out, years, a.limit, a.site, a.dataset_revision, a.code_revision)
    problems = validate(a.out)
    for p in problems:
        print("✗", p)
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
