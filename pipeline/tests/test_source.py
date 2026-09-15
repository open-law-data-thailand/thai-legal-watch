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


def test_a_document_the_publisher_says_has_no_text_says_so_in_the_slim_record():
    """`has_text` is the publisher's own answer and it is not the same question as whether the
    build found a byte offset. Text can exist where the position index does not reach, and a
    record can be deliberately withheld while its PDF sits on disk — 10,912 of them are, because
    the refile could not prove which document the file belongs to."""
    from tlw_pipeline.model import Doc
    base = dict(year="2021", month="2021-01", title="t", date="2021-01-01", volume=138,
                part="1 ง", part_class="ง", page=1, doc_type="ประกาศ", agency=None,
                agency_type=None, province=None, topic=None, action=None, govlevel=None,
                topic_c=False, action_c=False, govlevel_c=False)
    assert Doc(id="2021-007568", has_text=False, **base).slim()["ht"] is False
    # true and unstated both stay out of the payload: only the minority costs bytes
    assert "ht" not in Doc(id="a", has_text=True, **base).slim()
    assert "ht" not in Doc(id="b", has_text=None, **base).slim()


def test_meta_settles_a_disagreement_with_taxonomy_about_volume_and_date(tmp_path):
    """The layers disagree about 46 volumes and 1,009 dates across the archive, and the
    เล่ม↔year invariant picks meta every time it can pick either: 15 volumes and 10 dates to
    nil. `volume: 1` on a 2006 document is parse damage, not a second opinion — and this site
    prints a citation people copy into filings."""
    import json

    from tlw_pipeline.sources.openlawdata_soc import OpenLawDataSoc
    root = tmp_path
    (root / "meta" / "2006").mkdir(parents=True)
    (root / "taxonomy" / "2006").mkdir(parents=True)
    (root / "meta" / "2006" / "2006-09.jsonl").write_text(json.dumps({
        "no": "1", "doctitle": "ประกาศ", "bookNo": "123", "section": "77", "category": "ง",
        "publishDate": "2006-09-14", "pageNo": "1", "pdf_file": "2006-009743.pdf"}) + "\n",
        encoding="utf-8")
    (root / "taxonomy" / "2006" / "2006-09.jsonl").write_text(json.dumps({
        "pdf_file": "2006-009743.pdf", "doc_id": "2006-009743", "year": "2006", "month": "2006-09",
        "volume": 1, "part": "77 ง", "part_class": "ง", "publish_date": "2006-09-30",
        "doc_type": "ประกาศ", "labels": []}) + "\n", encoding="utf-8")
    (root / "taxonomy" / "taxonomy.json").write_text("{}", encoding="utf-8")

    doc = next(iter(OpenLawDataSoc(str(root)).iter_docs("2006")))
    assert doc.volume == 123, "taxonomy said 1, which no 2006 document can be"
    assert doc.date == "2006-09-14"


def test_taxonomy_still_fills_in_where_meta_is_empty(tmp_path):
    import json

    from tlw_pipeline.sources.openlawdata_soc import OpenLawDataSoc
    root = tmp_path
    (root / "meta" / "2006").mkdir(parents=True)
    (root / "taxonomy" / "2006").mkdir(parents=True)
    # 1,469 meta records carry no bookNo at all; the other layer is better than nothing
    (root / "meta" / "2006" / "2006-09.jsonl").write_text(json.dumps({
        "no": "1", "doctitle": "ประกาศ", "bookNo": "", "section": "", "category": "ง",
        "publishDate": "", "pageNo": "1", "pdf_file": "2006-009744.pdf"}) + "\n", encoding="utf-8")
    (root / "taxonomy" / "2006" / "2006-09.jsonl").write_text(json.dumps({
        "pdf_file": "2006-009744.pdf", "doc_id": "2006-009744", "year": "2006", "month": "2006-09",
        "volume": 123, "part": "77 ง", "part_class": "ง", "publish_date": "2006-09-30",
        "doc_type": "ประกาศ", "labels": []}) + "\n", encoding="utf-8")
    (root / "taxonomy" / "taxonomy.json").write_text("{}", encoding="utf-8")

    doc = next(iter(OpenLawDataSoc(str(root)).iter_docs("2006")))
    assert doc.volume == 123 and doc.date == "2006-09-30"


def _tiny_root(tmp_path, rows):
    """A dataset root holding exactly `rows` — {year: [(pdf_file, source_url), ...]}."""
    import json
    import os
    os.makedirs(tmp_path / "taxonomy", exist_ok=True)
    json.dump({"topics": {}, "actions": {}, "govlevels": {}},
              open(tmp_path / "taxonomy" / "taxonomy.json", "w", encoding="utf-8"))
    for year, recs in rows.items():
        os.makedirs(tmp_path / "meta" / year, exist_ok=True)
        os.makedirs(tmp_path / "taxonomy" / year, exist_ok=True)
        month = f"{year}-01"
        with open(tmp_path / "meta" / year / f"{month}.jsonl", "w", encoding="utf-8") as mf, \
             open(tmp_path / "taxonomy" / year / f"{month}.jsonl", "w", encoding="utf-8") as tf:
            for pdf, url in recs:
                mf.write(json.dumps({"pdf_file": pdf, "doctitle": "ประกาศ", "bookNo": "141",
                                     "section": "1", "category": "ง", "publishDate": f"{month}-01",
                                     "pageNo": "1", "source_url": url}, ensure_ascii=False) + "\n")
                tf.write(json.dumps({"pdf_file": pdf, "month": month, "year": year,
                                     "labels": []}, ensure_ascii=False) + "\n")
    return str(tmp_path)


def _links(root, years):
    src = OpenLawDataSoc(root)
    out = {}
    for y in years:
        for d in src.iter_docs(y):
            out[d.id] = d.source_url
    return out, src.links


def test_a_pdf_two_documents_claim_goes_to_the_one_whose_id_it_is(tmp_path):
    """The file at documents/41500.pdf turned out to be the modern document every time it was
    fetched, never the 2002 record that also claimed it, so the modern one keeps the link."""
    u = "https://ratchakitcha.soc.go.th/documents/41500.pdf"
    root = _tiny_root(tmp_path, {"2002": [("2002-007132.pdf", u)],
                                 "2025": [("2025-03-03-00041500.pdf", u)]})
    links, counts = _links(root, ["2002", "2025"])
    assert links == {"2002-007132": None, "2025-03-03-00041500": u}
    assert counts == {"linked": 1, "withheld": 1, "disputed_urls": 1}


def test_nobody_keeps_a_pdf_several_documents_could_each_have_produced(tmp_path):
    """documents/29400.pdf is claimed by five 2025 records that each derive it and one 2024
    record that does not — and the file is the 2024 one. With no unique deriving claimant the
    derivation says nothing, so the link is withheld from all of them."""
    u = "https://ratchakitcha.soc.go.th/documents/29400.pdf"
    root = _tiny_root(tmp_path, {"2024": [("2024-013253.pdf", u)],
                                 "2025": [("2025-01-27-00029400.pdf", u), ("2025-01-30-00029400.pdf", u)]})
    links, counts = _links(root, ["2024", "2025"])
    assert set(links.values()) == {None}
    assert counts == {"linked": 0, "withheld": 3, "disputed_urls": 1}


def test_an_undisputed_link_is_kept_whoever_it_belongs_to(tmp_path):
    """Only a contested URL is withheld. A 2002 record that nothing else claims keeps its link,
    even though its id could never have produced the number."""
    a = "https://ratchakitcha.soc.go.th/documents/1732794.pdf"
    b = "https://ratchakitcha.soc.go.th/documents/11213.pdf"
    root = _tiny_root(tmp_path, {"2000": [("2000-008757.pdf", a)],
                                 "2025": [("2025-01-02-00011213.pdf", b)]})
    links, counts = _links(root, ["2000", "2025"])
    assert links == {"2000-008757": a, "2025-01-02-00011213": b}
    assert counts == {"linked": 2, "withheld": 0, "disputed_urls": 0}
