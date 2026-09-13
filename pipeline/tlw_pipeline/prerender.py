"""Static HTML twins of the facet pages, for readers that do not run JavaScript.

The site is a hash-routed single-page app, which means a search engine sees exactly one page and a
link unfurler shows the home card for every link. 732,143 documents cannot each be a file, but the
76 topics, 77 provinces and the agencies that have their own page can — about three thousand files,
against a Cloudflare Pages limit of twenty thousand.

Each page carries the real title, description and og: tags, the facet's actual numbers, and its
most recent documents. It is not a doorway: what it shows is what the interactive page shows, and
it links straight to it.
"""
import html
import json
import os

STYLE = """
:root{color-scheme:light}
body{margin:0;background:#fbfaf7;color:#17171a;font:16px/1.75 Anuphan,Sarabun,system-ui,sans-serif}
.w{max-width:52rem;margin:0 auto;padding:1.5rem 1.25rem 4rem}
a{color:#3c3489}
h1{font-family:'Noto Serif Thai',serif;font-size:1.8rem;line-height:1.35;margin:.2rem 0 .6rem}
h2{font-family:'Noto Serif Thai',serif;font-size:1.15rem;margin:2rem 0 .6rem}
.k{color:#66666f;font-size:.85rem}
.app{display:inline-block;margin:1rem 0;padding:.6rem 1.1rem;border-radius:8px}
.app{background:#c9502a;color:#fff;text-decoration:none;font-weight:600}
.n{display:flex;gap:1.5rem;flex-wrap:wrap;margin:1rem 0;padding:0;list-style:none}
.n li{min-width:8rem}.n b{display:block;font-size:1.6rem;font-family:'Noto Serif Thai',serif;font-weight:500}
ul.d{list-style:none;padding:0}
ul.d li{padding:.7rem 0;border-bottom:1px solid #e3e0d8}
ul.d .m{color:#66666f;font-size:.85rem}
nav.x{margin:.5rem 0 1.5rem;font-size:.85rem;color:#66666f}
footer{margin-top:3rem;padding-top:1.5rem;border-top:1px solid #e3e0d8;color:#66666f;font-size:.85rem}
""".strip()


def BE(iso: str | None) -> str:
    """2026-09-11 -> 11 ก.ย. 2569. Thai readers do not count in Christian years."""
    months = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
              "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."]
    if not iso or len(iso) < 10:
        return ""
    try:
        y, m, d = int(iso[:4]), int(iso[5:7]), int(iso[8:10])
        return f"{d} {months[m - 1]} {y + 543}"
    except (ValueError, IndexError):
        return ""


def e(s) -> str:
    return html.escape(str(s or ""), quote=True)


def _page(title: str, desc: str, canonical: str, body: str, site: str) -> str:
    return f"""<!doctype html>
<html lang="th">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>{e(title)} — Thai Legal Watch</title>
<meta name="description" content="{e(desc)}">
<link rel="canonical" href="{e(canonical)}">
<meta property="og:type" content="article">
<meta property="og:site_name" content="Thai Legal Watch">
<meta property="og:locale" content="th_TH">
<meta property="og:title" content="{e(title)} — Thai Legal Watch">
<meta property="og:description" content="{e(desc)}">
<meta property="og:url" content="{e(canonical)}">
<meta name="twitter:card" content="summary">
<style>{STYLE}</style>
</head>
<body><div class="w">
<nav class="x"><a href="{e(site)}/">Thai Legal Watch</a> › <a href="{e(site)}/directory">สารบัญ</a></nav>
{body}
<footer>
ข้อมูลจาก <a href="https://huggingface.co/datasets/open-law-data-thailand/soc-ratchakitcha">OpenLawData — soc-ratchakitcha</a>
· จำแนกหมวดอัตโนมัติ อาจคลาดเคลื่อน
<b>โปรดตรวจกับต้นฉบับที่ <a href="https://ratchakitcha.soc.go.th/">ราชกิจจานุเบกษา</a>
ก่อนใช้อ้างอิง</b>
</footer>
</div></body></html>
"""


def _docs(recent: list[dict], site: str, source: str, names: dict) -> str:
    if not recent:
        return "<p>ยังไม่มีฉบับล่าสุด</p>"
    out = ['<ul class="d">']
    for d in recent[:30]:
        month = (d.get("d") or "")[:7]
        url = f"{site}/#/{source}/doc/{d['id']}" + (f"?m={month}" if month else "")
        bits = [BE(d["d"]) if d.get("d") else "", names.get(d.get("a") or "", "")]
        out.append(
            f'<li><a href="{e(url)}">{e(d.get("t"))}</a>'
            f'<div class="m">{e(" · ".join(b for b in bits if b))}</div></li>'
        )
    out.append("</ul>")
    return "".join(out)


def _facet_body(name: str, kind: str, f: dict, site: str, source: str, app: str, names: dict,
                tax: dict, feed: str | None) -> str:
    years = sorted(f.get("by_year") or {})
    span = f"พ.ศ. {int(years[0]) + 543}–{int(years[-1]) + 543}" if years else "—"
    top_ag = "".join(
        f'<li><a href="{e(site)}/{source}/agency/{e(a["id"])}">{e(a["name"])}</a> · {a["n"]:,}</li>'
        for a in (f.get("agencies") or [])[:8]
    )
    def topic_name(slug: str) -> str:
        return (tax.get("topics", {}).get(slug) or {}).get("thai") or slug

    top_topic = "".join(
        f'<li><a href="{e(site)}/{source}/topic/{e(s)}">{e(topic_name(s))}</a> · {n:,}</li>'
        for s, n in sorted((f.get("by_topic") or {}).items(), key=lambda kv: -kv[1])[:8]
    )
    parts = [
        f'<div class="k">{e(kind)}</div><h1>{e(name)}</h1>',
        f'<ul class="n"><li><b>{f.get("total", 0):,}</b>ฉบับ</li>'
        f'<li><b>{len(f.get("provinces") or {}):,}</b>จังหวัด</li>'
        f'<li><b>{len(f.get("agencies") or []):,}</b>หน่วยงาน</li>'
        f"<li><b>{e(span)}</b>ช่วงปี</li></ul>",
        f'<a class="app" href="{e(app)}">เปิดหน้านี้แบบโต้ตอบ — กรอง ดูกราฟ ดาวน์โหลด CSV →</a>',
    ]
    if feed:
        parts.append(f'<p><a href="{e(site)}/data/{source}/feeds/{e(feed)}.xml">ติดตามด้วย RSS</a></p>')
    if top_topic:
        parts.append(f"<h2>หมวดที่พบมากที่สุด</h2><ul>{top_topic}</ul>")
    if top_ag:
        parts.append(f"<h2>หน่วยงานที่ออกมากที่สุด</h2><ul>{top_ag}</ul>")
    parts.append("<h2>ฉบับล่าสุด</h2>" + _docs(f.get("recent") or [], site, source, names))
    return "".join(parts)


def write(out: str, source: str, site: str) -> list[str]:
    """Write <out>/_site/<source>/... plus a directory page and a sitemap. Returns the URL paths."""
    src = os.path.join(out, source)
    dest = os.path.join(out, "_site")

    def load(rel, default=None):
        p = os.path.join(src, rel)
        if not os.path.exists(p):
            return default
        with open(p, encoding="utf-8") as fh:
            return json.load(fh)

    tax = load("agg/taxonomy.json", {}) or {}
    names = {a["id"]: a["name"] for a in (load("index/agencies.json", []) or [])}
    urls: list[str] = []

    def emit(rel_url: str, page: str) -> None:
        path = os.path.join(dest, rel_url.lstrip("/") + ".html")
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w", encoding="utf-8") as fh:
            fh.write(page)
        urls.append(rel_url)

    def facet(rel_url, agg_rel, name, kind, app_hash, feed):
        f = load(agg_rel)
        if not f:
            return
        canonical = f"{site}{rel_url}"
        desc = (f"{name}: {f.get('total', 0):,} ฉบับในราชกิจจานุเบกษา "
                f"จำแนกหมวดอัตโนมัติ พร้อมเล่ม ตอน หน้า สำหรับอ้างอิง และติดตามผ่าน RSS")
        body = _facet_body(name, kind, f, site, source, f"{site}/#{app_hash}", names, tax, feed)
        emit(rel_url, _page(name, desc, canonical, body, site))

    for t in load("index/topics.json", []) or []:
        slug = t["slug"]
        facet(f"/{source}/topic/{slug}", f"agg/topic/{slug}.json", t.get("thai") or slug,
              "หมวด", f"/{source}/topic/{slug}", f"topic/{slug}")
    for p in load("index/provinces.json", []) or []:
        facet(f"/{source}/province/{p['file']}", f"agg/province/{p['file']}.json", p["name"],
              "จังหวัด", f"/{source}/province/{p['file']}", f"province/{p['file']}")
    for a in load("index/agencies.json", []) or []:
        if not a.get("page"):
            continue
        facet(f"/{source}/agency/{a['id']}", f"agg/agency/{a['id']}.json", a["name"],
              "หน่วยงาน", f"/{source}/agency/{a['id']}", f"agency/{a['id']}" if a["n"] >= 50 else None)

    # a crawler needs one reachable page that links to the rest
    def links(items):
        return "".join(f'<li><a href="{e(site)}{e(u)}">{e(n)}</a> · {c:,}</li>' for u, n, c in items)

    topics = [(f"/{source}/topic/{t['slug']}", t.get("thai") or t["slug"], t["n"])
              for t in (load("index/topics.json", []) or []) if t["n"]]
    provs = [(f"/{source}/province/{p['file']}", p["name"], p["n"])
             for p in (load("index/provinces.json", []) or [])]
    ags = [(f"/{source}/agency/{a['id']}", a["name"], a["n"])
           for a in (load("index/agencies.json", []) or []) if a.get("page")]
    meta = load("agg/meta.json", {}) or {}
    body = (
        f'<div class="k">สารบัญ</div><h1>ทุกหมวด ทุกจังหวัด ทุกหน่วยงาน</h1>'
        f'<p>ราชกิจจานุเบกษา {meta.get("docs", 0):,} ฉบับ จำแนกเป็นหมวดหมู่ '
        f'<a href="{e(site)}/">เปิดเว็บแบบโต้ตอบ</a></p>'
        f"<h2>หมวด ({len(topics)})</h2><ul>{links(topics)}</ul>"
        f"<h2>จังหวัด ({len(provs)})</h2><ul>{links(provs)}</ul>"
        f"<h2>หน่วยงาน ({len(ags)})</h2><ul>{links(ags)}</ul>"
    )
    emit("/directory", _page("สารบัญ", f"สารบัญหมวด จังหวัด และหน่วยงานทั้งหมดของราชกิจจานุเบกษา "
                             f"{meta.get('docs', 0):,} ฉบับ", f"{site}/directory", body, site))

    sm = ['<?xml version="1.0" encoding="UTF-8"?>',
          '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
          f"<url><loc>{e(site)}/</loc><changefreq>daily</changefreq><priority>1.0</priority></url>"]
    sm += [f"<url><loc>{e(site)}{e(u)}</loc><changefreq>daily</changefreq></url>" for u in sorted(urls)]
    sm.append("</urlset>")
    with open(os.path.join(dest, "sitemap.xml"), "w", encoding="utf-8") as fh:
        fh.write("\n".join(sm))
    return urls
