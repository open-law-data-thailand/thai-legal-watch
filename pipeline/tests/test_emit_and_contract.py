import json
import os
import xml.etree.ElementTree as ET

from tlw_pipeline.contract import validate
from tlw_pipeline.emit import safe_name


def test_build_passes_its_own_contract(built):
    out, meta = built
    assert validate(out) == []
    assert meta["docs"] == 160 and meta["years"] == ["2023", "2024"]
    assert meta["sources"][0]["name"].startswith("OpenLawData")


def test_shards_are_per_month_and_sorted(built):
    out, _ = built
    docs = json.load(open(os.path.join(out, "docs/2024/2024-02.json"), encoding="utf-8"))
    assert len(docs) == 40
    assert docs == sorted(docs, key=lambda x: (x["d"], x["id"]))


def test_indexes_link_to_aggregate_files(built):
    out, _ = built
    for a in json.load(open(os.path.join(out, "index/agencies.json"), encoding="utf-8")):
        assert os.path.exists(os.path.join(out, "agg/agency", f"{a['id']}.json")) == a["page"]
    for p in json.load(open(os.path.join(out, "index/provinces.json"), encoding="utf-8")):
        assert os.path.exists(os.path.join(out, "agg/province", f"{p['file']}.json"))
    for t in json.load(open(os.path.join(out, "index/topics.json"), encoding="utf-8")):
        if t["n"]:
            assert os.path.exists(os.path.join(out, "agg/topic", f"{t['slug']}.json"))


def test_feeds_are_valid_atom_with_site_links(built):
    out, _ = built
    p = os.path.join(out, "feeds/topic/pollution_waste.xml")
    root = ET.parse(p).getroot()
    ns = {"a": "http://www.w3.org/2005/Atom"}
    entries = root.findall("a:entry", ns)
    assert 0 < len(entries) <= 50
    assert entries[0].find("a:link", ns).get("href").startswith("https://example.test/#/doc/")
    assert "OpenLawData" in root.find("a:author/a:name", ns).text


def test_contract_flags_budget_and_unexpected_files(built, tmp_path):
    out, _ = built
    stray = os.path.join(out, "agg", "stray.bin")
    open(stray, "wb").write(b"x")
    try:
        assert any("unexpected file" in p for p in validate(out))
    finally:
        os.remove(stray)


def test_safe_name_keeps_thai_and_strips_slashes():
    assert safe_name("กรุงเทพมหานคร") == "กรุงเทพมหานคร"
    assert "/" not in safe_name("a/b c")
