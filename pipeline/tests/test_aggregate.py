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
