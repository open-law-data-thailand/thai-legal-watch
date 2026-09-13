"""`infra/csp-allows.py` decides whether the deployed policy lets the site read a document's text.

It is checked here because the failure it guards against already happened in production: the
policy named four Hugging Face hosts by hand, the redirect went to a fifth, and the browser
blocked it — silently, because a local preview serves no CSP at all.
"""
import os
import subprocess
import sys

import pytest

SCRIPT = os.path.join(os.path.dirname(__file__), "..", "..", "infra", "csp-allows.py")
FULL = ("content-security-policy: default-src 'self'; script-src 'self'; "
        "connect-src 'self' https://huggingface.co https://*.huggingface.co https://*.hf.co; "
        "frame-ancestors 'none'")


def run(csp: str, host: str) -> int:
    return subprocess.run([sys.executable, SCRIPT, csp, host], capture_output=True, text=True).returncode


@pytest.mark.parametrize("host", [
    "huggingface.co",            # the page the redirect starts from
    "cdn-lfs.huggingface.co",    # the LFS backend
    "us.aws.cdn.hf.co",          # the Xet bridge — the one that actually broke production
    "eu.aws.cdn.hf.co",
    "transfer.xethub.hf.co",
])
def test_the_policy_the_site_ships_allows_every_host_the_publisher_uses(host):
    assert run(FULL, host) == 0


@pytest.mark.parametrize("host", ["example.com", "hf.co.evil.com", "nothuggingface.co"])
def test_it_does_not_allow_anything_else(host):
    assert run(FULL, host) == 1


def test_a_wildcard_covers_subdomains_but_not_the_bare_domain():
    # this is CSP's own rule, and it is why the policy names huggingface.co separately
    assert run("connect-src https://*.hf.co", "us.aws.cdn.hf.co") == 0
    assert run("connect-src https://*.hf.co", "hf.co") == 1


def test_the_policy_that_broke_production_is_reported_as_broken():
    # naming hosts by hand: the redirect landed somewhere not on the list
    named = ("connect-src 'self' https://huggingface.co https://cdn-lfs.huggingface.co "
             "https://cdn-lfs-us-1.hf.co https://transfer.xethub.hf.co")
    assert run(named, "us.aws.cdn.hf.co") == 1


def test_connect_src_falls_back_to_default_src_when_it_has_none_of_its_own():
    assert run("default-src 'self' https://*.hf.co", "us.aws.cdn.hf.co") == 0
    assert run("default-src 'self'; connect-src 'self'", "us.aws.cdn.hf.co") == 1


def test_a_header_line_is_accepted_with_or_without_its_name():
    assert run(FULL, "us.aws.cdn.hf.co") == 0
    assert run(FULL.split(":", 1)[1].strip(), "us.aws.cdn.hf.co") == 0


def test_http_sources_never_count_for_an_https_page():
    assert run("connect-src http://us.aws.cdn.hf.co", "us.aws.cdn.hf.co") == 1


def test_wrong_arguments_are_a_usage_error_not_a_pass():
    assert subprocess.run([sys.executable, SCRIPT], capture_output=True).returncode == 2
