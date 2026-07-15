
"""Validate a BEAVRS run summary against physics sanity checks.

Used as a regression/smoke check (e.g. from CTest). Exits non-zero if any check
fails. The checks are deliberately loose so they catch gross breakage (a broken
neutron balance, a non-physical k) without being brittle to statistics.

Usage:
    python check_summary.py <file>_summary.txt
        [--kmin 0.0 --kmax 3.0 --balance-tol 0.02]
"""
from __future__ import annotations

import argparse
import sys

from beavrs_io import parse_summary

def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("summary")
    ap.add_argument("--kmin", type=float, default=0.0)
    ap.add_argument("--kmax", type=float, default=3.0)
    ap.add_argument("--balance-tol", type=float, default=0.02,
                    help="max |residual|/source allowed (default 2%%)")
    args = ap.parse_args(argv)

    s = parse_summary(args.summary)
    failures = []

    def need(key):
        if key not in s:
            failures.append(f"missing key '{key}'")
            return None
        return s[key]

    source = need("source_neutrons")
    k = s.get("k_batch_mean", s.get("k_production_over_source"))
    if k is None:
        failures.append("missing k value")
    elif not (args.kmin <= k <= args.kmax):
        failures.append(f"k={k} outside [{args.kmin}, {args.kmax}]")

    resid = s.get("balance_residual")
    if source and resid is not None:
        rel = abs(resid) / source if source else 0.0
        if rel > args.balance_tol:
            failures.append(f"balance residual {resid} = {rel*100:.2f}% of "
                            f"source exceeds {args.balance_tol*100:.1f}%")

    for key in ("captures", "fissions_induced", "leakage", "source_neutrons"):
        v = s.get(key)
        if v is not None and v < 0:
            failures.append(f"{key} is negative ({v})")

    if failures:
        print(f"FAIL: {args.summary}")
        for f in failures:
            print("  -", f)
        return 1

    print(f"OK: {args.summary}  (k={k}, source={source:.0f}, "
          f"residual={resid})")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
