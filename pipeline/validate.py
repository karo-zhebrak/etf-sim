"""Validation of parsed records. Errors fail the ETF; warnings and flags do not.

Suspicious time-series points are not dropped: they are marked quality='flagged' and
reported as data flags, so they are loaded but excluded from the "clean" views.
"""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass, field

from pipeline.models import ParsedFile

JUMP_LIMIT = 0.25
WEIGHT_TOLERANCE = 2.0
TER_RANGE = (0.0, 2.0)


@dataclass
class DataFlag:
    table_name: str
    kind: str
    detail: str
    date: object = None


@dataclass
class ValidationResult:
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    flags: list[DataFlag] = field(default_factory=list)


def _dedupe(points, key, value, label, res: ValidationResult):
    """Drop exact duplicate dates; conflicting duplicates are an error."""
    seen: dict = {}
    out = []
    for p in points:
        k = key(p)
        if k in seen:
            if value(seen[k]) != value(p):
                res.errors.append(f"{label}: conflicting values for {k}")
            continue
        seen[k] = p
        out.append(p)
    if len(out) != len(points) and not res.errors:
        res.warnings.append(f"{label}: dropped {len(points) - len(out)} duplicate rows")
    return out


def _flag_jumps(points, value, label, table, res: ValidationResult):
    """Flag points whose move from the previous point exceeds JUMP_LIMIT. points must be date-sorted."""
    for prev, cur in zip(points, points[1:]):
        a, b = value(prev), value(cur)
        if a and abs(b / a - 1) > JUMP_LIMIT:
            cur.quality = "flagged"
            res.flags.append(DataFlag(table, "jump_gt_25pct",
                                      f"{label}: {prev.date} {a:g} -> {cur.date} {b:g} ({b / a - 1:+.1%})", cur.date))


def _flag_benchmark_vs_fund(fund, bench, res: ValidationResult):
    """A tracker's benchmark index stays close to its fund index (both start at 10,000).

    A glitch in issuer files shifts the benchmark onto a different base for stretches of
    time, so single-day jump checks miss the shifted stretch. Instead, flag every benchmark
    point whose ratio to the fund index is more than JUMP_LIMIT away from the median ratio,
    and report contiguous flagged stretches as one flag each.
    """
    fund_by_date = {t.date: t.value for t in fund}
    ratios = {t.date: t.value / fund_by_date[t.date] for t in bench if fund_by_date.get(t.date)}
    if not ratios:
        return
    median = sorted(ratios.values())[len(ratios) // 2]
    run: list = []

    def close_run():
        if run:
            res.flags.append(DataFlag(
                "total_return_index", "benchmark_off_fund",
                f"benchmark index off its fund index by >{JUMP_LIMIT:.0%} from {run[0].date} to {run[-1].date} "
                f"({len(run)} points)", run[0].date))
            run.clear()

    for t in bench:
        r = ratios.get(t.date)
        if r is not None and abs(r / median - 1) > JUMP_LIMIT:
            t.quality = "flagged"
            run.append(t)
        else:
            close_run()
    close_run()


def validate(p: ParsedFile, isin: str, expect_nav: bool = True, expect_facts: bool = True) -> ValidationResult:
    """expect_nav / expect_facts: whether the file carrying NAVs / fund facts was parsed this run
    (an unchanged file is skipped, so its data is legitimately absent)."""
    res = ValidationResult()
    if p.isin != isin:
        res.errors.append(f"ISIN mismatch: parsed {p.isin}, config {isin}")

    if p.facts is None:
        res.errors.append("no fund facts parsed")
    else:
        if p.facts.distribution == "dist":
            res.errors.append("share class is distributing; distributing ETFs are out of scope")
        elif p.facts.distribution is None and expect_facts:
            res.warnings.append("use of income not found in files")
        cur = p.facts.share_class_currency
        if cur and any(n.currency != cur for n in p.nav):
            res.warnings.append(f"NAV currency differs from share class currency {cur}")

    for s in p.snapshots:
        if s.ter is not None and not TER_RANGE[0] <= s.ter <= TER_RANGE[1]:
            res.errors.append(f"TER {s.ter}% outside {TER_RANGE[0]}-{TER_RANGE[1]}%")

    if expect_nav and not p.nav:
        res.errors.append("no NAV history parsed")
    p.exposures = _dedupe(p.exposures, lambda e: (e.as_of, e.kind, e.label), lambda e: e.weight, "exposures", res)
    p.performance = _dedupe(p.performance, lambda r: (r.as_of, r.period_type, r.period_label, r.source),
                            lambda r: (r.fund_return, r.benchmark_return), "performance returns", res)
    p.nav = sorted(_dedupe(p.nav, lambda n: n.date, lambda n: n.nav, "NAV", res), key=lambda n: n.date)
    _flag_jumps(p.nav, lambda n: n.nav, "NAV", "nav_prices", res)

    p.total_return = _dedupe(p.total_return, lambda t: (t.series, t.date), lambda t: t.value, "total return index", res)
    fund = sorted((t for t in p.total_return if t.series == "fund"), key=lambda t: t.date)
    bench = sorted((t for t in p.total_return if t.series == "benchmark"), key=lambda t: t.date)
    _flag_jumps(fund, lambda t: t.value, "total return index (fund)", "total_return_index", res)
    if fund and bench:
        _flag_benchmark_vs_fund(fund, bench, res)
    else:
        _flag_jumps(bench, lambda t: t.value, "total return index (benchmark)", "total_return_index", res)

    sums: dict = defaultdict(float)
    for e in p.exposures:
        sums[(e.kind, e.as_of)] += e.weight
    for (kind, as_of), total in sums.items():
        if abs(total - 100) > WEIGHT_TOLERANCE:
            res.flags.append(DataFlag("exposures", "weights_sum", f"{kind} weights sum to {total:.2f}% on {as_of}", as_of))
            res.warnings.append(f"{kind} exposure weights sum to {total:.2f}%")

    full = [h for h in p.holdings if not h.is_partial]
    if full:
        total = sum(h.weight or 0 for h in full)
        if abs(total - 100) > WEIGHT_TOLERANCE:
            res.flags.append(DataFlag("holdings", "weights_sum", f"holdings weights sum to {total:.2f}%", full[0].as_of))
            res.warnings.append(f"holdings weights sum to {total:.2f}%")
    return res
