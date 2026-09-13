#!/usr/bin/env python3
"""Refuse a `_headers` file where two matching rules set the same header.

Cloudflare *appends* when two rules both match a path and both set a header, so
`Access-Control-Allow-Origin: *` twice becomes `*, *` — which is not a valid value, and browsers
reject it outright. That made every feed unfetchable from any other site while the JSON beside it
was fine: nothing inside the site notices, because the site is same-origin with its own data.

    check-headers.py dist/_headers

Exits 0 when no path can receive a header twice, 1 otherwise.
"""
import re
import sys

# A header that is genuinely additive. Cloudflare appends these on purpose and more than one is
# meaningful; everything else is a single value and a second one corrupts it.
REPEATABLE = {"set-cookie", "link"}


def parse(text: str) -> list[tuple[str, list[tuple[str, str]]]]:
    """`_headers` is a path on its own line, then indented `Name: value` lines. `#` is a comment."""
    rules: list[tuple[str, list[tuple[str, str]]]] = []
    for raw in text.splitlines():
        line = re.sub(r"\s+#.*$", "", raw.rstrip())
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        if not line[:1].isspace():
            rules.append((line.strip(), []))
            continue
        if ":" in line and rules:
            name, value = line.split(":", 1)
            rules[-1][1].append((name.strip(), value.strip()))
    return [(p, h) for p, h in rules if h]


def matches(pattern: str, path: str) -> bool:
    """Cloudflare's `*` spans any run of characters, including `/`."""
    rx = "^" + ".*".join(re.escape(part) for part in pattern.split("*")) + "$"
    return re.fullmatch(rx, path) is not None


def sample_paths(rules: list[tuple[str, list[tuple[str, str]]]]) -> list[str]:
    """One concrete path per rule — a pattern's own `*` filled in with something plausible, so
    overlaps are found against real paths rather than against patterns."""
    return [p.replace("*", "x/y.txt") if "*" in p else p for p, _ in rules]


def main(argv: list[str]) -> int:
    if len(argv) != 2:
        print(__doc__, file=sys.stderr)
        return 2
    with open(argv[1], encoding="utf-8") as f:
        rules = parse(f.read())
    problems = []
    for path in sample_paths(rules):
        seen: dict[str, list[str]] = {}
        for pattern, headers in rules:
            if not matches(pattern, path):
                continue
            for name, _ in headers:
                key = name.lower()
                if key in REPEATABLE:
                    continue
                seen.setdefault(key, []).append(pattern)
        for name, patterns in seen.items():
            if len(patterns) > 1:
                problems.append(f"{path}: '{name}' is set by {len(patterns)} rules "
                                f"({', '.join(patterns)}) — Cloudflare will join them with a comma")
    if problems:
        print("\n".join(problems), file=sys.stderr)
        return 1
    print(f"verified: no path in {argv[1]} receives a header twice ({len(rules)} rules)")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
