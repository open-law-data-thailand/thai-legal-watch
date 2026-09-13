from tlw_pipeline.model import agency_id
from tlw_pipeline.sources.openlawdata_soc import OpenLawDataSoc, clean_title


def test_years_are_the_intersection(dataset, tmp_path):
    src = OpenLawDataSoc(dataset)
    assert src.years() == ["2023", "2024"]
    # a year with taxonomy but no meta is not built
    import os
    os.makedirs(os.path.join(dataset, "taxonomy", "1999"))
    assert "1999" not in OpenLawDataSoc(dataset).years()


def test_docs_join_title_from_meta_and_labels_from_taxonomy(dataset):
    docs = list(OpenLawDataSoc(dataset).iter_docs("2024"))
    assert len(docs) == 80
    d = docs[0]
    assert d.title.startswith("ข้อบัญญัติ") or d.title.startswith("ประกาศ")
    assert "  " not in d.title and not d.title.endswith(" ")
    assert d.volume == 141 and d.part in ("17 ง", "17 ง พิเศษ") and d.page == 1
    assert d.labels and d.labels[0].axis in ("topic", "action")
    assert d.date.startswith("2024-01")


def test_slim_record_has_contract_keys_and_no_empty_extracted(dataset):
    from tlw_pipeline.contract import REQUIRED_DOC_KEYS
    for d in OpenLawDataSoc(dataset).iter_docs("2023"):
        s = d.slim()
        assert set(s) >= REQUIRED_DOC_KEYS
        assert ("x" in s) == bool(d.extracted)
        if d.agency:
            assert s["a"] == agency_id(d.agency) and len(s["a"]) == 10


def test_clean_title_collapses_whitespace():
    assert clean_title("  ก  ข\n\tค ") == "ก ข ค"
    assert clean_title(None) == ""


def test_agency_id_is_stable_and_whitespace_insensitive():
    assert agency_id("กระทรวงสาธารณสุข") == agency_id(" กระทรวงสาธารณสุข ")
    assert agency_id("a") != agency_id("b")


def test_part_keeps_special_issue_marker():
    from tlw_pipeline.sources.openlawdata_soc import _part
    assert _part({"section": "219", "category": "งพิเศษ"}) == "219 ง พิเศษ"
    assert _part({"section": "219", "category": "ง พิเศษ"}) == "219 ง พิเศษ"
    assert _part({"section": "17", "category": "ก"}) == "17 ก"
    assert _part({"section": "", "category": "ก"}) == "ก"
    assert _part({"section": "", "category": ""}) is None
