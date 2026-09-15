"""index/agencies.json, stored the small way.

Every page that names an agency loads this one file, so it is the index a reader actually feels.
Agency names repeat each other heavily — the same office in all 77 provinces, the same ministry in
front of a hundred departments — so the names are sorted and each line keeps only what it does not
already share with the line above it: ``"12|<the rest>"``. Nothing is dropped and no id changes;
ids are public URLs (``agg/agency/<id>.json``, ``#/…/agency/<id>``) and must stay exactly as they
are. ``page`` is not stored at all, because it was always ``n >= min_page``.

On the real archive that is 2.64 MB → 811 KB, and 281 KB → 194 KB over the wire.
"""
from __future__ import annotations

BMP_MAX = 0xFFFF


def _share(prev: str, cur: str) -> int:
    """How much of `cur` the decoder may copy from `prev`.

    Counted in characters, but the browser counts UTF-16 code units, so the prefix stops before
    the first character outside the BMP — where the two would disagree. Thai is all BMP, so this
    costs nothing in practice and removes the one way this encoding could corrupt a name."""
    k = 0
    limit = min(len(prev), len(cur))
    while k < limit and prev[k] == cur[k] and ord(prev[k]) <= BMP_MAX:
        k += 1
    return k


def encode(rows: list[dict], min_page: int) -> dict:
    """`[{id,name,n,page?}]` → the stored shape. `rows` may be in any order."""
    rows = sorted(rows, key=lambda r: r["name"])
    names: list[str] = []
    prev = ""
    for r in rows:
        name = r["name"]
        k = _share(prev, name)
        # the length marker is always written, so a name that itself looks like "5|x" is safe
        names.append(f"{k}|{name[k:]}")
        prev = name
    return {"min_page": min_page, "id": [r["id"] for r in rows], "name": names,
            "n": [r["n"] for r in rows]}


def decode(blob: dict | list) -> list[dict]:
    """The stored shape → `[{id,name,n,page?}]`, most documents first, as callers expect.

    A plain list is returned untouched: that is what older builds wrote."""
    if isinstance(blob, list):
        return blob
    min_page = blob.get("min_page", 0)
    ids, names, ns = blob.get("id", []), blob.get("name", []), blob.get("n", [])
    out: list[dict] = []
    prev = ""
    for i, packed in enumerate(names):
        k, _, rest = packed.partition("|")
        name = prev[: int(k)] + rest
        prev = name
        n = ns[i]
        out.append({"id": ids[i], "name": name, "n": n} | ({"page": True} if n >= min_page else {}))
    out.sort(key=lambda r: (-r["n"], r["name"]))
    return out
