"""A source turns one dataset into Doc records. Add a module per dataset."""
from __future__ import annotations

from collections.abc import Iterator
from typing import Protocol

from ..model import Doc


class Source(Protocol):
    name: str
    credit: dict

    def years(self) -> list[str]: ...
    def iter_docs(self, year: str) -> Iterator[Doc]: ...
    def taxonomy(self) -> dict: ...
