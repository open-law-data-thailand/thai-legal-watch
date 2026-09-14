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


# ── the publisher's own PDF link ────────────────────────────────────────────────────────────────
# `source_url` is being backfilled upstream a year at a time: present for the older meta files,
# absent from 2013 onward as of 2026-09. Everything here is about surviving that middle state.

def test_source_ref_keeps_only_the_number_that_varies():
    from tlw_pipeline.model import source_ref
    assert source_ref("https://ratchakitcha.soc.go.th/documents/1010467.pdf") == 1010467
    assert source_ref("https://ratchakitcha.soc.go.th/documents/121899.pdf") == 121899


def test_source_ref_is_none_when_there_is_no_url():
    from tlw_pipeline.model import source_ref
    for empty in (None, "", "   "):
        assert source_ref(empty) is None


def test_source_ref_keeps_an_unexpected_url_whole_rather_than_dropping_it():
    from tlw_pipeline.model import source_ref
    # the integer form is an observation about today's data, not a promise the publisher made
    odd = "https://ratchakitcha.soc.go.th/api/v1/documents/1010467/download"
    assert source_ref(odd) == odd
    assert source_ref("https://example.org/x.pdf") == "https://example.org/x.pdf"


def test_a_doc_without_a_source_url_emits_no_key_at_all():
    from tlw_pipeline.model import Doc
    d = Doc(id="2014-009286", year="2014", month="2014-06", title="t", date="2014-06-01",
            volume=131, part="1 ง", part_class="ง", page=1, doc_type="ประกาศ", agency=None,
            agency_type=None, province=None, topic=None, action=None, govlevel=None,
            topic_c=False, action_c=False, govlevel_c=False)
    assert "u" not in d.slim()


def test_a_doc_with_a_source_url_emits_the_number():
    from tlw_pipeline.model import Doc
    d = Doc(id="1885-000092", year="1885", month="1885-01", title="t", date="1885-01-31",
            volume=1, part="1 ง", part_class="ง", page=1, doc_type="ประกาศ", agency=None,
            agency_type=None, province=None, topic=None, action=None, govlevel=None,
            topic_c=False, action_c=False, govlevel_c=False,
            source_url="https://ratchakitcha.soc.go.th/documents/1010467.pdf")
    assert d.slim()["u"] == 1010467


def test_a_document_number_too_big_for_a_json_number_keeps_its_url():
    """The gazette's ids run from five digits to eighteen, and the long ones are real: fetching
    `documents/544639616062325576.pdf` returns a PDF. Compressed to a JSON number, a browser
    would read that back as 544639616062325600 — a link to the wrong document, which is worse
    than no link. Verified present in meta/2001/2001-01.jsonl and meta/2000/2000-07.jsonl."""
    from tlw_pipeline.model import source_ref
    big = "https://ratchakitcha.soc.go.th/documents/544639616062325576.pdf"
    assert source_ref(big) == big
    # and the boundary itself still compresses
    ok = "https://ratchakitcha.soc.go.th/documents/9007199254740991.pdf"
    assert source_ref(ok) == 9007199254740991
    assert source_ref("https://ratchakitcha.soc.go.th/documents/9007199254740992.pdf") == \
        "https://ratchakitcha.soc.go.th/documents/9007199254740992.pdf"


def test_a_compressed_number_survives_a_json_round_trip():
    """The whole point of the integer form is that it comes back the same on the other side."""
    import json

    from tlw_pipeline.model import source_ref
    for n in ("19231", "153082", "1955786", "9007199254740991"):
        url = f"https://ratchakitcha.soc.go.th/documents/{n}.pdf"
        ref = source_ref(url)
        assert str(json.loads(json.dumps({"u": ref}))["u"]) == n
