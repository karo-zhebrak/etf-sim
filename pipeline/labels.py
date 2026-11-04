"""Label normalisation using the label_mappings taxonomy.

The seed rows live in the initial migration (single source of truth). Without a database
connection (--dry-run), they are read straight from that SQL file; with one, the table is used.
"""

from __future__ import annotations

import re
from pathlib import Path

from pipeline.models import Exposure

MIGRATION = Path(__file__).resolve().parent.parent / "supabase" / "migrations" / "20261103234500_initial_schema.sql"

# key: (kind, issuer, lower-case label) -> (normalised label, iso code)
Mappings = dict[tuple[str, str, str], tuple[str, str | None]]

_ROW = re.compile(r"\(\s*'([^']*)',\s*'([^']*)',\s*'((?:[^']|'')*)',\s*'([^']*)'(?:,\s*(null|'[^']*'))?\s*\)")


def load_seed_mappings(path: Path = MIGRATION) -> Mappings:
    sql = re.sub(r"--[^\n]*", "", path.read_text())  # drop comments (labels contain no "--")
    out: Mappings = {}
    for block in re.findall(r"insert into public\.label_mappings.*?;", sql, re.S | re.I):
        for kind, issuer, label, norm, iso in _ROW.findall(block):
            iso_v = None if not iso or iso == "null" else iso.strip("'")
            out[(kind, issuer, label.replace("''", "'").lower())] = (norm, iso_v)
    return out


def lookup(m: Mappings, kind: str, scopes: list[str], label: str) -> tuple[str, str | None] | None:
    """Most specific scope first, e.g. ['hsbc_fixed_income', 'hsbc', '*']."""
    key = label.strip().lower()
    for s in scopes:
        if (kind, s, key) in m:
            return m[(kind, s, key)]
    return None


def scopes_for(issuer: str, asset_class: str | None) -> list[str]:
    """Most specific first: '<issuer>_<asset class>', '<asset class>', '<issuer>', '*'."""
    return ([f"{issuer}_{asset_class}", asset_class] if asset_class else []) + [issuer, "*"]


def normalise(exposures: list[Exposure], issuer: str, asset_class: str | None, m: Mappings) -> list[str]:
    """Fill label_normalised (and iso_code when missing). Returns warnings for unmapped labels."""
    warnings = []
    scopes = scopes_for(issuer, asset_class)
    for e in exposures:
        hit = lookup(m, e.kind, scopes, e.label)
        if hit:
            e.label_normalised = hit[0]
            if e.iso_code is None:
                e.iso_code = hit[1]
        elif e.kind == "country" and e.iso_code:
            e.label_normalised = e.label  # iShares supplies the ISO code; keep its name
        else:
            warnings.append(f"unmapped {e.kind} label {e.label!r}")
    return warnings


def known_labels(m: Mappings, kind: str, scopes: tuple[str, ...] = ("*",)) -> list[str]:
    """Lower-case source labels of a kind in the given scopes, longest first."""
    return sorted({k[2] for k in m if k[0] == kind and k[1] in scopes}, key=len, reverse=True)
