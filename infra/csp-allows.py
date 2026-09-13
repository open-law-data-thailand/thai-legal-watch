#!/usr/bin/env python3
"""Does this Content-Security-Policy let the page connect to this host?

The document page reads a document's text straight from the publisher, and `resolve/` redirects to
whichever host is serving the file that minute. A redirect is checked against `connect-src` too,
so the policy has to allow wherever it lands — and naming the hosts individually was tried and
broke in production: the real target was a Xet bridge host on no published list.

    csp-allows.py "<the whole header line>" <host>

Exits 0 when the policy allows the host, 1 when it does not.
"""
import re
import sys


def sources(csp: str, directive: str = "connect-src") -> list[str]:
    """The sources named for one directive, or for default-src when it has none of its own."""
    parts = {}
    for chunk in csp.split(";"):
        bits = chunk.split()
        if bits:
            parts[bits[0].lower()] = bits[1:]
    return parts.get(directive, parts.get("default-src", []))


def allows(source: str, host: str) -> bool:
    """CSP host matching, for the https sources this site uses. `*.example.com` matches a
    subdomain but not the bare domain — which is why the policy has to name both."""
    s = source.strip().rstrip("/")
    if s in ("*", "https:"):
        return True
    if not s.startswith("https://"):
        return False
    pattern = s[len("https://"):].split("/")[0]
    if pattern.startswith("*."):
        return host.endswith("." + pattern[2:])
    return host == pattern


def main(argv: list[str]) -> int:
    if len(argv) != 3:
        print(__doc__, file=sys.stderr)
        return 2
    csp, host = argv[1], argv[2]
    csp = re.sub(r"(?i)^content-security-policy:\s*", "", csp.strip())
    named = sources(csp)
    if any(allows(s, host) for s in named):
        print(f"verified: connect-src allows {host}")
        return 0
    print(f"connect-src does not allow {host}\n  policy: {' '.join(named) or '(none)'}", file=sys.stderr)
    return 1


if __name__ == "__main__":
    sys.exit(main(sys.argv))
