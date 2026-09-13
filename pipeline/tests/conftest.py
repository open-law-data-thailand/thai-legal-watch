"""A tiny synthetic dataset in the real layout: 2 years × 2 months, a topic tree, agencies, provinces."""
import pytest

from tlw_pipeline.fixtures import make_dataset  # noqa: E402


@pytest.fixture(scope="session")
def dataset(tmp_path_factory):
    root = str(tmp_path_factory.mktemp("data"))
    make_dataset(root)
    return root


@pytest.fixture(scope="session")
def built(dataset, tmp_path_factory):
    from tlw_pipeline.cli import build
    out = str(tmp_path_factory.mktemp("dist"))
    meta = build(dataset, out, site="https://example.test")
    return out, meta
