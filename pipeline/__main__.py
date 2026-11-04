"""CLI: python -m pipeline run [--issuer ishares|hsbc] [--isin ISIN] [--skip-download] [--dry-run]"""

from __future__ import annotations

import argparse
import logging
import sys

from pipeline.run import run


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m pipeline", description="Monthly ETF data pipeline")
    sub = parser.add_subparsers(dest="command", required=True)
    r = sub.add_parser("run", help="fetch, parse, validate and load")
    r.add_argument("--issuer", choices=["ishares", "hsbc"], help="only this issuer")
    r.add_argument("--isin", help="only this ETF")
    r.add_argument("--skip-download", action="store_true", help="re-parse the latest stored raw files")
    r.add_argument("--dry-run", action="store_true", help="parse and validate; no database writes")
    r.add_argument("-v", "--verbose", action="store_true", help="debug logging, including tracebacks")
    args = parser.parse_args(argv)
    logging.basicConfig(level=logging.DEBUG if args.verbose else logging.INFO, format="%(message)s")
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("pdfminer").setLevel(logging.WARNING)
    return run(issuer=args.issuer, isin=args.isin.upper() if args.isin else None,
               skip_download=args.skip_download, dry_run=args.dry_run)


if __name__ == "__main__":
    sys.exit(main())
