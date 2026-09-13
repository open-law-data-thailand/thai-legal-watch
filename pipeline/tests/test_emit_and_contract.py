import json
import os
import xml.etree.ElementTree as ET

from tlw_pipeline.contract import validate
from tlw_pipeline.emit import safe_name


def test_build_passes_its_own_contract(built):
    root, meta = built
    assert validate(root) == []
    idx = json.load(open(os.path.join(root, "sources.json"), encoding="utf-8"))
    assert [s["id"] for s in idx["sources"]] == ["ratchakitcha"] and idx["sources"][0]["docs"] == 160
    assert meta["docs"] == 160 and meta["years"] == ["2023", "2024"]
    assert meta["sources"][0]["name"].startswith("OpenLawData")


def test_shards_are_per_month_and_sorted(built):
    out, _ = built
    out = os.path.join(out, "ratchakitcha")
    docs = json.load(open(os.path.join(out, "docs/2024/2024-02.json"), encoding="utf-8"))
    assert len(docs) == 40
    assert docs == sorted(docs, key=lambda x: (x["d"], x["id"]))


def test_indexes_link_to_aggregate_files(built):
    out, _ = built
    out = os.path.join(out, "ratchakitcha")
    for a in json.load(open(os.path.join(out, "index/agencies.json"), encoding="utf-8")):
        assert os.path.exists(os.path.join(out, "agg/agency", f"{a['id']}.json")) == a["page"]
    for p in json.load(open(os.path.join(out, "index/provinces.json"), encoding="utf-8")):
        assert os.path.exists(os.path.join(out, "agg/province", f"{p['file']}.json"))
    for t in json.load(open(os.path.join(out, "index/topics.json"), encoding="utf-8")):
        if t["n"]:
            assert os.path.exists(os.path.join(out, "agg/topic", f"{t['slug']}.json"))


def test_feeds_are_valid_atom_with_site_links(built):
    out, _ = built
    out = os.path.join(out, "ratchakitcha")
    p = os.path.join(out, "feeds/topic/pollution_waste.xml")
    root = ET.parse(p).getroot()
    ns = {"a": "http://www.w3.org/2005/Atom"}
    entries = root.findall("a:entry", ns)
    assert 0 < len(entries) <= 50
    assert entries[0].find("a:link", ns).get("href").startswith("https://example.test/#/ratchakitcha/doc/")
    assert "OpenLawData" in root.find("a:author/a:name", ns).text


def test_contract_flags_budget_and_unexpected_files(built, tmp_path):
    root, _ = built
    stray = os.path.join(root, "ratchakitcha", "agg", "stray.bin")
    open(stray, "wb").write(b"x")
    try:
        assert any("unexpected file" in p for p in validate(root))
    finally:
        os.remove(stray)


def test_safe_name_keeps_thai_and_strips_slashes():
    assert safe_name("กรุงเทพมหานคร") == "กรุงเทพมหานคร"
    assert "/" not in safe_name("a/b c")


def test_graph_has_edges_between_topics_and_agencies(built):
    out, _ = built
    out = os.path.join(out, "ratchakitcha")
    g = json.load(open(os.path.join(out, "agg/graph.json"), encoding="utf-8"))
    slugs = {t["slug"] for t in g["topics"]}
    aids = {a["id"] for a in g["agencies"]}
    assert g["topic_agency"] and all(e["t"] in slugs and e["a"] in aids for e in g["topic_agency"])
    assert all(e["a"] < e["b"] for e in g["topic_topic"])


def test_year_graph_is_a_subset_of_the_global_graph(built):
    out, _ = built
    out = os.path.join(out, "ratchakitcha")
    g = json.load(open(os.path.join(out, "agg/graph.json"), encoding="utf-8"))
    gy = json.load(open(os.path.join(out, "agg/graph/2024.json"), encoding="utf-8"))
    assert gy["year"] == "2024"
    assert {t["slug"] for t in gy["topics"]} <= {t["slug"] for t in g["topics"]}
    assert sum(t["n"] for t in gy["topics"]) < sum(t["n"] for t in g["topics"])
    assert all(e["n"] > 0 for e in gy["topic_agency"] + gy["topic_topic"])
