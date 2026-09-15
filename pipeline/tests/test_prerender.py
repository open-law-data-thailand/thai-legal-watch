

def test_a_static_page_names_its_own_feed(tmp_path):
    """A reader offers to subscribe from the page it is on, so the page has to declare the feed.
    Without the <link>, the only way to find it is the sentence in the body, which a reader that
    does not render the body never sees."""
    import json

    from tlw_pipeline import prerender
    out = tmp_path / "dist"
    src = out / "ratchakitcha"
    for rel, payload in (
        ("agg/meta.json", {"docs": 3, "site": "https://x.test"}),
        ("agg/taxonomy.json", {"topics": {"env": {"thai": "สิ่งแวดล้อม"}}, "actions": {}, "govlevels": {}}),
        ("index/topics.json", [{"slug": "env", "thai": "สิ่งแวดล้อม", "parent": None, "n": 3}]),
        ("index/provinces.json", []),
        ("index/agencies.json", {"min_page": 5, "id": [], "name": [], "n": []}),
        ("agg/topic/env.json", {"total": 3, "recent": [], "by_year": {}, "agencies": [], "provinces": {},
                                "by_topic": {}, "by_action": {}, "by_govlevel": {}}),
    ):
        p = src / rel
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(json.dumps(payload), encoding="utf-8")
    prerender.write(str(out), "ratchakitcha", "https://x.test")
    site = out / "_site"
    topic = (site / "ratchakitcha/topic/env.html").read_text(encoding="utf-8")
    assert 'rel="alternate" type="application/atom+xml"' in topic
    assert "https://x.test/data/ratchakitcha/feeds/topic/env.xml" in topic
    directory = (site / "directory.html").read_text(encoding="utf-8")
    assert "https://x.test/data/ratchakitcha/feeds/latest.xml" in directory
