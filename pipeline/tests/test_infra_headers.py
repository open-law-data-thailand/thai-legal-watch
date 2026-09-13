"""`infra/check-headers.py` refuses a `_headers` file where two matching rules set one header.

Checked here because the bug it guards against shipped: the deploy appended a per-source feed
block that repeated `Cache-Control` and `Access-Control-Allow-Origin`, Cloudflare joined each
with a comma, and `Access-Control-Allow-Origin: *, *` is not a value a browser accepts. Every
feed was unfetchable from any other site — while the JSON beside it was fine, because nothing
same-origin ever exercises CORS.
"""
import os
import subprocess
import sys

SCRIPT = os.path.join(os.path.dirname(__file__), "..", "..", "infra", "check-headers.py")
REAL = os.path.join(os.path.dirname(__file__), "..", "..", "infra", "_headers")

GLOBAL = """/data/*
  Cache-Control: public, max-age=3600
  Access-Control-Allow-Origin: *

/*
  X-Content-Type-Options: nosniff
"""


def run(text: str, tmp_path) -> subprocess.CompletedProcess:
    f = tmp_path / "_headers"
    f.write_text(text, encoding="utf-8")
    return subprocess.run([sys.executable, SCRIPT, str(f)], capture_output=True, text=True)


def test_the_file_this_repo_ships_is_clean():
    r = subprocess.run([sys.executable, SCRIPT, REAL], capture_output=True, text=True)
    assert r.returncode == 0, r.stderr


def test_the_feed_block_that_shipped_is_rejected(tmp_path):
    # exactly what deploy.sh used to append
    bad = GLOBAL + """
/data/ratchakitcha/feeds/*
  Content-Type: application/atom+xml; charset=utf-8
  Cache-Control: public, max-age=3600, stale-while-revalidate=86400
  Access-Control-Allow-Origin: *
"""
    r = run(bad, tmp_path)
    assert r.returncode == 1
    assert "access-control-allow-origin" in r.stderr
    assert "cache-control" in r.stderr


def test_the_feed_block_that_replaced_it_is_accepted(tmp_path):
    good = GLOBAL + """
/data/ratchakitcha/feeds/*
  Content-Type: application/atom+xml; charset=utf-8
"""
    assert run(good, tmp_path).returncode == 0


def test_two_rules_may_overlap_as_long_as_they_set_different_headers(tmp_path):
    # /data/* and /* both match a data path already, and that is fine and intended
    assert run(GLOBAL, tmp_path).returncode == 0


def test_a_wildcard_spans_slashes_the_way_cloudflare_does(tmp_path):
    # `/data/*` has to be seen as matching `/data/a/b/c.json`, or an overlap goes unnoticed
    overlapping = """/data/*
  Cache-Control: a

/data/x/deep/*
  Cache-Control: b
"""
    assert run(overlapping, tmp_path).returncode == 1


def test_set_cookie_may_legitimately_repeat(tmp_path):
    repeated = """/*
  Set-Cookie: a=1

/x*
  Set-Cookie: b=2
"""
    assert run(repeated, tmp_path).returncode == 0


def test_comments_and_blank_lines_are_not_rules(tmp_path):
    commented = """# a comment
/data/*
  # an indented comment
  Cache-Control: public

/orphan-with-no-headers
"""
    assert run(commented, tmp_path).returncode == 0


def test_wrong_arguments_are_a_usage_error_not_a_pass():
    assert subprocess.run([sys.executable, SCRIPT], capture_output=True).returncode == 2
