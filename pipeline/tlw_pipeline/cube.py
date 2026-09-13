"""A columnar index of every document's dimensions, for filtering the whole corpus in a browser.

Pre-computing a file per facet means every question has to be anticipated: you can ask "waste
rules in Trang" only if someone built that page. Shipping the *dimensions* of all 773,000
documents instead — as small integer codes, one column per field — lets the client answer any
combination of them, including ones nobody thought of.

It is affordable because the dimensions have tiny cardinality: 76 topics, 9 actions, 8 government
levels, 77 provinces. Ten bytes a row, and columnar data of that shape compresses to about half a
megabyte for the entire archive — less than the 90-day listing of titles.

Row order is the concatenation of the month shards in their own order, so row i identifies a
document without storing an id: find its month in `months`, and the offset within that shard.

The blob is written gzipped. Cloudflare compresses by content type and `application/octet-stream`
is not on its list, so a raw .bin would cross the wire at its full 7 MB; compressing it here puts
the file under a megabyte whatever the CDN decides to do. `cube.json` says so in `encoding`, and
the gzip magic number is in the first two bytes, so the client can tell without being told.
"""
import array
import gzip
import json
import os

# u16 columns first so their byte offsets stay 2-aligned however many rows there are
U16 = ("agency", "day")
U8 = ("topic", "action", "gov", "prov", "dtype", "flags")
COLUMNS = U16 + U8
LIMIT_U16 = 65_535


class Cube:
    def __init__(self) -> None:
        self.cols: dict[str, array.array] = {c: array.array("H" if c in U16 else "B") for c in COLUMNS}
        # 0 always means "none"; real values start at 1
        self.codes: dict[str, dict[str, int]] = {c: {} for c in COLUMNS if c != "flags"}
        self.months: list[dict] = []

    def _code(self, col: str, value) -> int:
        if not value:
            return 0
        tbl = self.codes[col]
        if value not in tbl:
            tbl[value] = len(tbl) + 1
        return tbl[value]

    def add_month(self, month: str, docs: list[dict]) -> None:
        """`docs` must be the month shard exactly as written, in its final order."""
        self.months.append({"m": month, "start": len(self.cols["topic"]), "n": len(docs)})
        for d in docs:
            self.cols["agency"].append(self._code("agency", d.get("a")))
            self.cols["day"].append(self._code("day", d.get("d")))
            self.cols["topic"].append(self._code("topic", d.get("topic")))
            self.cols["action"].append(self._code("action", d.get("action")))
            self.cols["gov"].append(self._code("gov", d.get("govlevel")))
            self.cols["prov"].append(self._code("prov", d.get("pr")))
            self.cols["dtype"].append(self._code("dtype", d.get("dt")))
            self.cols["flags"].append(
                (1 if d.get("tc") else 0) | (2 if d.get("ac") else 0) | (4 if d.get("gc") else 0)
            )

    def write(self, out: str) -> tuple[int, int]:
        """Writes agg/cube.bin and agg/cube.json. Returns their sizes."""
        rows = len(self.cols["topic"])
        for col in U16:
            biggest = len(self.codes[col])
            if biggest > LIMIT_U16:
                raise ValueError(f"{col} has {biggest:,} distinct values, over the {LIMIT_U16:,} a "
                                 f"uint16 column can hold — widen the column before this ships")
        layout, offset, blob = [], 0, bytearray()
        for c in COLUMNS:
            data = self.cols[c].tobytes()
            layout.append({"name": c, "type": "u16" if c in U16 else "u8", "offset": offset})
            blob += data
            offset += len(data)

        os.makedirs(os.path.join(out, "agg"), exist_ok=True)
        bin_path = os.path.join(out, "agg", "cube.bin")
        with open(bin_path, "wb") as f:
            # mtime=0: the same corpus must produce the same bytes, or every nightly build looks
            # like a change to anything comparing checksums
            f.write(gzip.compress(bytes(blob), compresslevel=6, mtime=0))

        def table(col: str) -> list:
            # index 0 is "none"; the rest in code order
            back = [None] * (len(self.codes[col]) + 1)
            for value, i in self.codes[col].items():
                back[i] = value
            return back

        meta = {
            "rows": rows,
            "encoding": "gzip",
            # the decompressed length, which is what the client allocates
            "bytes": len(blob),
            "layout": layout,
            "months": self.months,
            "codes": {c: table(c) for c in COLUMNS if c != "flags"},
            "flags": {"topic_corroborated": 1, "action_corroborated": 2, "govlevel_corroborated": 4},
        }
        json_path = os.path.join(out, "agg", "cube.json")
        with open(json_path, "w", encoding="utf-8") as f:
            json.dump(meta, f, ensure_ascii=False, separators=(",", ":"))
        return os.path.getsize(bin_path), os.path.getsize(json_path)
