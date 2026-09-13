"""Atom feeds: the zero-server way to follow a topic, a province or an agency."""
from __future__ import annotations

from xml.sax.saxutils import escape

SITE = "https://thai-legal-watch.pages.dev"


def atom(title: str, feed_id: str, items: list[dict], updated: str | None, site: str = SITE,
         source: str = "ratchakitcha") -> str:
    out = ['<?xml version="1.0" encoding="utf-8"?>', '<feed xmlns="http://www.w3.org/2005/Atom">',
           f"<title>{escape(title)}</title>", f"<id>{escape(site)}/{escape(source)}/{escape(feed_id)}</id>",
           f'<link rel="alternate" href="{escape(site)}/#/{escape(source)}/{escape(feed_id)}"/>',
           f"<updated>{updated or '1970-01-01'}T00:00:00Z</updated>",
           "<author><name>Thai Legal Watch · data: OpenLawData</name></author>"]
    for it in items:
        link = f"{site}/#/{source}/doc/{it['id']}"
        summary = " · ".join(x for x in (it.get("topic"), it.get("action"), it.get("govlevel"), it.get("pr")) if x)
        out += ["<entry>", f"<title>{escape(it['t'])}</title>", f"<id>{escape(link)}</id>",
                f'<link href="{escape(link)}"/>', f"<updated>{it.get('d') or '1970-01-01'}T00:00:00Z</updated>",
                f"<summary>{escape(summary)}</summary>", "</entry>"]
    out.append("</feed>")
    return "\n".join(out)
