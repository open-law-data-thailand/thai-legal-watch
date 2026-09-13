from tlw_pipeline.aggregate import Aggregator
from tlw_pipeline.sources.openlawdata_soc import OpenLawDataSoc


def _agg(dataset):
    src = OpenLawDataSoc(dataset)
    agg = Aggregator(src.taxonomy())
    for y in src.years():
        for d in src.iter_docs(y):
            agg.add(d)
    return agg


def test_topic_counts_roll_up_to_ancestors(dataset):
    agg = _agg(dataset)
    waste = agg.topics["pollution_waste"].total
    assert waste > 0
    assert agg.topics["pollution"].total == waste
    assert agg.topics["environment"].total == waste


def test_headline_counts_use_corroborated_labels_only(dataset):
    agg = _agg(dataset)
    src = OpenLawDataSoc(dataset)
    docs = [d for y in src.years() for d in src.iter_docs(y)]
    corroborated_waste = sum(1 for d in docs if d.topic == "pollution_waste" and d.topic_c)
    all_waste = sum(1 for d in docs if d.topic == "pollution_waste")
    assert corroborated_waste < all_waste, "fixture must contain uncorroborated labels"
    assert agg.topics["pollution_waste"].total == corroborated_waste
    assert agg.all.by_topic["pollution_waste"] == corroborated_waste


def test_home_describes_the_newest_day(dataset):
    agg = _agg(dataset)
    h = agg.home()
    assert h["latest_date"] == max(agg.by_day)
    assert h["count"] == agg.by_day[h["latest_date"]]
    assert len(h["sparkline"]) <= 30 and h["sparkline"][-1]["d"] == h["latest_date"]
    for x in h["highlights"]:
        assert x["action"] in ("rulemaking", "amendment", "repeal") and x["ac"]
    assert len(h["latest"]) <= 8 and all(x["tc"] and x["topic"] != "bankruptcy" for x in h["latest"])


def test_recent_lists_are_newest_first_and_capped(dataset):
    agg = _agg(dataset)
    out = agg.topics["bankruptcy"].out(agg.agency_ids())
    dates = [r["d"] for r in out["recent"]]
    assert dates == sorted(dates, reverse=True)
    assert len(out["recent"]) <= 30


def test_bankruptcy_funnel_counts_every_extracted_stage(dataset):
    agg = _agg(dataset)
    src = OpenLawDataSoc(dataset)
    with_stage = sum(1 for y in src.years() for d in src.iter_docs(y) if d.extracted.get("stage"))
    assert agg.extracted_stage[("ศาลล้มละลายกลาง", "absolute_receivership")] == with_stage
    assert with_stage >= agg.topics["bankruptcy"].total


def test_trends_series_line_up_with_the_year_axis(tmp_path):
    """Every series in agg/trends.json is one number per year, in the same order as `years`."""
    import json

    from tlw_pipeline import fixtures
    from tlw_pipeline.cli import main

    root = tmp_path / "data"
    out = tmp_path / "dist"
    fixtures.make_dataset(str(root), years=("2023", "2024"), per_month=20)
    assert main(["--root", str(root), "--out", str(out), "--years", "2023-2024"]) == 0

    t = json.loads((out / "ratchakitcha" / "agg" / "trends.json").read_text(encoding="utf-8"))
    assert t["years"] == ["2023", "2024"]
    for group in ("topics", "actions", "govlevels"):
        assert t[group], f"{group} is empty"
        for slug, series in t[group].items():
            assert len(series) == len(t["years"]), f"{group}/{slug}"
            assert any(series), f"{group}/{slug} is all zeroes"
    years = json.loads((out / "ratchakitcha" / "agg" / "years.json").read_text(encoding="utf-8"))
    # a document can carry several topics once roll-up is applied, but never more than the corpus
    for series in t["actions"].values():
        for y, n in zip(t["years"], series, strict=False):
            assert n <= years["by_year"][y]


def test_month_index_locates_a_document_without_opening_shards(tmp_path):
    """index/months/<year>.json must cover every document, so a link with no ?m= needs one fetch."""
    import json

    from tlw_pipeline import fixtures
    from tlw_pipeline.cli import main

    root = tmp_path / "data"
    out = tmp_path / "dist"
    fixtures.make_dataset(str(root), years=("2023", "2024"), per_month=20)
    assert main(["--root", str(root), "--out", str(out), "--years", "2023-2024"]) == 0

    src = out / "ratchakitcha"
    for year in ("2023", "2024"):
        idx = json.loads((src / "index" / "months" / f"{year}.json").read_text(encoding="utf-8"))
        assert idx["year"] == year
        for month, (lo, hi) in idx["months"].items():
            docs = json.loads((src / "docs" / year / f"{month}.json").read_text(encoding="utf-8"))
            ids = sorted(d["id"] for d in docs)
            assert lo == ids[0] and hi == ids[-1], month
        # every document of the year falls inside exactly one month's range
        for month in idx["months"]:
            for d in json.loads((src / "docs" / year / f"{month}.json").read_text(encoding="utf-8")):
                owners = [m for m, (lo, hi) in idx["months"].items() if lo <= d["id"] <= hi]
                assert month in owners, (d["id"], month, owners)


def test_static_pages_say_what_they_are(tmp_path):
    """The prerendered pages exist for readers that do not run JavaScript, so the things such a
    reader needs — a real title, a description, a canonical URL, and a way to the rest — are the
    things worth asserting. And nothing from the data may land in the HTML unescaped."""
    import json

    from tlw_pipeline import fixtures
    from tlw_pipeline.cli import main

    root = tmp_path / "data"
    out = tmp_path / "dist"
    fixtures.make_dataset(str(root), years=("2023", "2024"), per_month=20)
    assert main(["--root", str(root), "--out", str(out), "--years", "2023-2024",
                 "--site", "https://example.org"]) == 0

    site = out / "_site"
    topics = json.loads((out / "ratchakitcha" / "index" / "topics.json").read_text(encoding="utf-8"))
    for t in topics:
        page = site / "ratchakitcha" / "topic" / f"{t['slug']}.html"
        if not page.exists():
            continue
        html = page.read_text(encoding="utf-8")
        name = t["thai"] or t["slug"]
        assert f"<title>{name} — Thai Legal Watch</title>" in html
        assert 'name="description"' in html and 'property="og:description"' in html
        assert f'rel="canonical" href="https://example.org/ratchakitcha/topic/{t["slug"]}"' in html
        # and a way through to the interactive page it mirrors
        assert f"https://example.org/#/ratchakitcha/topic/{t['slug']}" in html

    directory = (site / "directory.html").read_text(encoding="utf-8")
    for t in topics:
        if (site / "ratchakitcha" / "topic" / f"{t['slug']}.html").exists():
            assert f"/ratchakitcha/topic/{t['slug']}" in directory, t["slug"]

    sitemap = (site / "sitemap.xml").read_text(encoding="utf-8")
    assert sitemap.startswith("<?xml")
    assert "<loc>https://example.org/</loc>" in sitemap
    assert sitemap.count("<loc>") > 1


def test_static_pages_escape_what_comes_from_the_data(tmp_path):
    """Titles come from OCR of scanned pages; a stray angle bracket must not become markup."""
    from tlw_pipeline.prerender import _docs, e

    assert e('<img src=x onerror="alert(1)">') == "&lt;img src=x onerror=&quot;alert(1)&quot;&gt;"
    out = _docs([{"id": "2024-000001", "t": '<script>alert(1)</script>', "d": "2024-02-03", "a": None}],
                "https://example.org", "ratchakitcha", {})
    assert "<script>" not in out
    assert "&lt;script&gt;" in out


def test_build_records_which_code_read_which_data(tmp_path):
    """A number on a page should be traceable to the pair of commits that produced it."""
    import json

    from tlw_pipeline import fixtures
    from tlw_pipeline.cli import main

    root = tmp_path / "data"
    out = tmp_path / "dist"
    fixtures.make_dataset(str(root), years=("2024",), per_month=5)
    assert main(["--root", str(root), "--out", str(out), "--years", "2024",
                 "--dataset-revision", "0" * 40, "--code-revision", "1" * 40,
                 "--site", "https://example.org"]) == 0

    meta = json.loads((out / "ratchakitcha" / "agg" / "meta.json").read_text(encoding="utf-8"))
    assert meta["build"]["dataset"]["sha"] == "0" * 40
    assert meta["build"]["code"]["sha"] == "1" * 40
    assert "huggingface.co" in meta["build"]["dataset"]["repo"]
    assert "github.com" in meta["build"]["code"]["repo"]

    # and the static pages a crawler reads carry it as links, not bare text
    page = (out / "_site" / "directory.html").read_text(encoding="utf-8")
    assert f'/commit/{"0" * 40}' in page
    assert f'/commit/{"1" * 40}' in page
    assert "1111111</code>" in page  # shortened for reading


def test_build_survives_having_no_revisions_to_report(tmp_path):
    """Built outside a checkout with no dataset sha: provenance is absent, not broken."""
    import json

    from tlw_pipeline import fixtures
    from tlw_pipeline.cli import main

    root = tmp_path / "data"
    out = tmp_path / "dist"
    fixtures.make_dataset(str(root), years=("2024",), per_month=5)
    assert main(["--root", str(root), "--out", str(out), "--years", "2024",
                 "--code-revision", " ", "--site", "https://example.org"]) == 0
    meta = json.loads((out / "ratchakitcha" / "agg" / "meta.json").read_text(encoding="utf-8"))
    assert meta["build"]["dataset"]["sha"] == ""
    page = (out / "_site" / "directory.html").read_text(encoding="utf-8")
    assert "รุ่น:" not in page or "commit/" not in page


def test_cube_row_and_shard_position_are_the_same_document(tmp_path):
    """The cube stores no ids: row i is identified by its month and offset. If that mapping ever
    slips, every filter silently returns the wrong documents — so it is checked exhaustively."""
    import array
    import gzip
    import json

    from tlw_pipeline import fixtures
    from tlw_pipeline.cli import main

    root = tmp_path / "data"
    out = tmp_path / "dist"
    fixtures.make_dataset(str(root), years=("2023", "2024"), per_month=40)
    assert main(["--root", str(root), "--out", str(out), "--years", "2023-2024"]) == 0

    src = out / "ratchakitcha"
    meta = json.loads((src / "agg" / "cube.json").read_text(encoding="utf-8"))
    raw = (src / "agg" / "cube.bin").read_bytes()
    assert raw[:2] == b"\x1f\x8b", "the client sniffs the gzip magic number to know what it got"
    assert meta["encoding"] == "gzip"
    blob = gzip.decompress(raw)

    cols = {}
    for c in meta["layout"]:
        width = 2 if c["type"] == "u16" else 1
        a = array.array("H" if width == 2 else "B")
        a.frombytes(blob[c["offset"]: c["offset"] + meta["rows"] * width])
        cols[c["name"]] = a
        assert len(a) == meta["rows"], c["name"]

    total = sum(m["n"] for m in meta["months"])
    assert total == meta["rows"]
    assert len(blob) == meta["bytes"]

    codes = meta["codes"]
    checked = 0
    for m in meta["months"]:
        month = m["m"]
        docs = json.loads((src / "docs" / month[:4] / f"{month}.json").read_text(encoding="utf-8"))
        assert len(docs) == m["n"], month
        for offset, d in enumerate(docs):
            row = m["start"] + offset
            for col, field in (("topic", "topic"), ("action", "action"), ("gov", "govlevel"),
                               ("prov", "pr"), ("dtype", "dt"), ("agency", "a"), ("day", "d")):
                assert codes[col][cols[col][row]] == (d.get(field) or None), (month, offset, col)
            f = cols["flags"][row]
            assert bool(f & 1) is bool(d["tc"]) and bool(f & 2) is bool(d["ac"])
            assert bool(f & 4) is bool(d["gc"])
            checked += 1
    assert checked == meta["rows"]


def test_cube_months_are_in_order_and_cover_every_shard(tmp_path):
    """Row order is the concatenation of the shards, so the month list must be complete and
    chronological — insertion order is not something to leave to chance."""
    import json

    from tlw_pipeline import fixtures
    from tlw_pipeline.cli import main

    root = tmp_path / "data"
    out = tmp_path / "dist"
    fixtures.make_dataset(str(root), years=("2023", "2024"), per_month=10)
    assert main(["--root", str(root), "--out", str(out), "--years", "2023-2024"]) == 0

    src = out / "ratchakitcha"
    months = json.loads((src / "agg" / "cube.json").read_text(encoding="utf-8"))["months"]
    names = [m["m"] for m in months]
    assert names == sorted(names)
    on_disk = sorted(p.stem for p in (src / "docs").glob("*/*.json"))
    assert names == on_disk
    at = 0
    for m in months:
        assert m["start"] == at
        at += m["n"]
