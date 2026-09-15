"""Atom feeds: the zero-server way to follow a topic, a province or an agency."""
from __future__ import annotations

from xml.sax.saxutils import escape

SITE = "https://thai-legal-watch.openlawdatathailand.org"


def atom(title: str, feed_id: str, items: list[dict], updated: str | None, site: str = SITE,
         source: str = "ratchakitcha", subtitle: str = "") -> str:
    out = ['<?xml version="1.0" encoding="utf-8"?>', '<feed xmlns="http://www.w3.org/2005/Atom">',
           f"<title>{escape(title)}</title>", f"<id>{escape(site)}/{escape(source)}/{escape(feed_id)}</id>",
           f'<link rel="alternate" href="{escape(site)}/#/{escape(source)}/{escape(feed_id)}"/>',
           f'<link rel="self" href="{escape(site)}/data/{escape(source)}/feeds/{escape(feed_id)}.xml"/>',
           f"<updated>{updated or '1970-01-01'}T00:00:00Z</updated>",
           "<author><name>Thai Legal Watch · data: OpenLawData</name></author>"]
    if subtitle:
        out.insert(3, f"<subtitle>{escape(subtitle)}</subtitle>")
    for it in items:
        link = f"{site}/#/{source}/doc/{it['id']}"
        # The citation comes first because it is what a reader checks before opening anything:
        # a feed row without เล่ม/ตอน/หน้า cannot be looked up or quoted.
        summary = " · ".join(x for x in (it.get("cite"), it.get("dt"), it.get("ag"), it.get("topic"),
                                         it.get("action"), it.get("govlevel"), it.get("pr")) if x)
        out += ["<entry>", f"<title>{escape(it['t'])}</title>", f"<id>{escape(link)}</id>",
                f'<link href="{escape(link)}"/>', f"<updated>{it.get('d') or '1970-01-01'}T00:00:00Z</updated>",
                f"<summary>{escape(summary)}</summary>"]
        for term in (it.get("topic"), it.get("action"), it.get("govlevel")):
            if term:
                out.append(f'<category term="{escape(term)}"/>')
        out.append("</entry>")
    out.append("</feed>")
    return "\n".join(out)
