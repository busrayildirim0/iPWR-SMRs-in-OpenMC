
"""Compute reactivity coefficients from a set of BEAVRS run summaries.

Each run is a separate execution of the simulation with one material parameter
changed (fuel temperature, boron, moderator temperature, ...). This script reads
the parameter value and the multiplication factor k (with its statistical error)
out of every `<file>_summary.txt`, converts k to reactivity rho = (k-1)/k, and
fits rho versus the swept parameter. The fitted slope is the reactivity
coefficient, reported in pcm per unit with a 1-sigma uncertainty.

Examples
--------
Doppler (fuel-temperature) coefficient from a temperature sweep:
    python reactivity.py --param fuel_temperature_K \
        run_T600_summary.txt run_T900_summary.txt run_T1200_summary.txt

Boron worth (pcm per ppm):
    python reactivity.py --param boron_ppm run_b*_summary.txt

The parameter key must match a key present in the summary files, e.g.
fuel_temperature_K, moderator_temperature_K, boron_ppm, enrichment_wt_u235,
moderator_density_g_cm3.
"""
from __future__ import annotations

import argparse
import sys

from beavrs_io import k_and_error, parse_summary, pcm, rho, rho_sigma, weighted_linear_fit

UNIT = {
    "fuel_temperature_K": "K",
    "moderator_temperature_K": "K",
    "boron_ppm": "ppm",
    "enrichment_wt_u235": "wt-frac",
    "moderator_density_g_cm3": "g/cm3",
}

def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--param", required=True,
                    help="summary key that was swept (e.g. fuel_temperature_K)")
    ap.add_argument("summaries", nargs="+", help="<file>_summary.txt files")
    args = ap.parse_args(argv)

    points = []
    for path in args.summaries:
        s = parse_summary(path)
        if args.param not in s:
            print(f"[skip] {path}: no key '{args.param}'", file=sys.stderr)
            continue
        k, sk = k_and_error(s)
        points.append((float(s[args.param]), k, sk, path))

    if len(points) < 2:
        print("Need at least two runs with the swept parameter.", file=sys.stderr)
        return 2

    points.sort(key=lambda p: p[0])
    unit = UNIT.get(args.param, "unit")

    print(f"# Reactivity vs {args.param}")
    print(f"{'param':>14} {'k':>10} {'sigma_k':>10} {'rho[pcm]':>12} {'sig[pcm]':>10}")
    xs, rhos, rsig = [], [], []
    for x, k, sk, path in points:
        r = rho(k)
        rs = rho_sigma(k, sk)
        xs.append(x)
        rhos.append(r)
        rsig.append(rs)
        print(f"{x:14.5g} {k:10.5f} {sk:10.5f} {pcm(r):12.1f} {pcm(rs):10.1f}")

    b, b_sig, a, a_sig = weighted_linear_fit(xs, rhos, rsig)
    print()
    print(f"Reactivity coefficient (d rho / d {args.param}):")
    print(f"  {pcm(b):+.3f} +/- {pcm(b_sig):.3f}  pcm/{unit}")

    if len(points) >= 2:
        x0, k0, sk0, _ = points[0]
        x1, k1, sk1, _ = points[-1]
        dx = x1 - x0
        if dx != 0:
            dr = rho(k1) - rho(k0)
            dr_sig = (rho_sigma(k1, sk1) ** 2 + rho_sigma(k0, sk0) ** 2) ** 0.5
            print(f"  end-to-end: {pcm(dr / dx):+.3f} +/- {pcm(dr_sig / abs(dx)):.3f}"
                  f"  pcm/{unit}  (over {dx:g} {unit})")

    if b < 0:
        print("  -> negative coefficient (stabilising feedback).")
    else:
        print("  -> positive coefficient (check configuration / statistics).")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
