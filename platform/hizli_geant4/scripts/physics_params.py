
"""Derive reactor-physics quantities from a single BEAVRS run summary.

All inputs come from `<file>_summary.txt`, so this adds an interpretation layer
on top of the analog tallies without touching the simulation. Quantities:

  k (production/source)         single-generation multiplication factor
  k_inf (production/absorption) leakage-removed estimate
  reactivity rho                (k - 1) / k, reported in pcm
  epsilon (fast fission factor) total fissions / thermal fissions
  alpha (capture/fission)       Sigma_c / Sigma_f
  thermal fission fraction      thermal fissions / total fissions
  thermal absorption fraction   thermal absorptions / total absorptions
  thermalization fraction       neutrons reaching < 0.625 eV / source

Note: a fully rigorous four-factor (eta, f, p, epsilon) split needs region- and
group-resolved absorption tallies; epsilon is exact here, the rest are reported
as the closest quantities the present tallies support.

Usage:
    python physics_params.py beavrs_output_summary.txt
"""
from __future__ import annotations

import argparse

from beavrs_io import k_and_error, parse_summary, pcm, rho, rho_sigma

def _ratio(num, den):
    return num / den if den else float("nan")

def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("summary")
    args = ap.parse_args(argv)

    s = parse_summary(args.summary)
    g = lambda key: float(s.get(key, 0.0))

    source = g("source_neutrons")
    fiss = g("fissions_induced")
    fiss_th = g("fissions_thermal")
    fiss_fast = g("fissions_fast")
    cap = g("captures")
    absorp = g("absorptions") or (fiss + cap)
    leak = g("leakage")
    prod = g("fission_neutrons_produced")
    thermalized = g("thermalized_neutrons")

    k, k_sig = k_and_error(s)
    k_inf_abs = _ratio(prod, absorp)
    r = rho(k)
    r_sig = rho_sigma(k, k_sig)

    other_abs = g("other_absorptions")
    epsilon = _ratio(fiss, fiss_th)
    alpha = _ratio(cap, fiss)
    th_fiss_frac = _ratio(fiss_th, fiss)
    thermal_abs = g("captures_thermal") + fiss_th + g("other_absorptions_thermal")
    th_abs_frac = _ratio(thermal_abs, absorp)
    mean_nu = _ratio(prod, fiss)

    print(f"# Reactor-physics parameters from {args.summary}")
    print(f"  source neutrons            : {source:.0f}")
    print(f"  k (production/source)      : {k:.5f} +/- {k_sig:.5f}")
    print(f"  k_inf (prod./absorption)   : {k_inf_abs:.5f}")
    print(f"  reactivity rho             : {pcm(r):+.1f} +/- {pcm(r_sig):.1f} pcm")
    print(f"  mean nu (neutrons/fission) : {mean_nu:.4f}")
    print(f"  epsilon (fast fission)     : {epsilon:.4f}")
    print(f"  alpha (radcap/fission)     : {alpha:.4f}")
    print(f"  other absorption (n,a/p)   : {other_abs:.0f}  (parasitic, e.g. boron)")
    print(f"  thermal fission fraction   : {th_fiss_frac:.4f}")
    print(f"  thermal absorption frac.   : {th_abs_frac:.4f}")
    print(f"  thermalized neutrons       : {thermalized:.0f}")

    resid = g("balance_residual")
    if source:
        print(f"  neutron-balance residual   : {resid:.0f}"
              f"  ({100.0 * abs(resid) / source:.2f}% of source)")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
