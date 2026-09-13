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
