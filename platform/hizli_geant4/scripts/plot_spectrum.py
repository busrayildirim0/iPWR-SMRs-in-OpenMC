
"""Plot the neutron flux spectrum, normalized to flux per unit lethargy.

Reads the ROOT histogram file written by the simulation (via `uproot`) together
with the `<file>_summary.txt` for the normalization constants (region volumes and
source-neutron count), and plots

    phi(u) = bin_track_length / (lethargy_bin_width * region_volume * N_source)

which is the standard reactor-physics view of a spectrum (thermal peak, 1/E
slowing-down plateau, fast fission bump).

Usage:
    python plot_spectrum.py beavrs_output.root beavrs_output_summary.txt \
        [--regions total fuel moderator] [--out spectrum.png]

Requires: uproot, numpy, matplotlib  (pip install uproot numpy matplotlib)
"""
from __future__ import annotations

import argparse
import sys

from beavrs_io import parse_summary

REGION_HIST = {
    "total": "flux_E",
    "fuel": "flux_E_fuel",
    "moderator": "flux_E_moderator",
    "zircaloy": "flux_E_zircaloy",
    "gas": "flux_E_gas",
}
REGION_VOLUME_KEY = {
    "total": "volume_total_mm3",
    "fuel": "volume_fuel_mm3",
    "moderator": "volume_moderator_mm3",
    "zircaloy": "volume_zircaloy_mm3",
    "gas": "volume_gas_mm3",
}

def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("root", help="ROOT histogram file from the run")
    ap.add_argument("summary", help="matching <file>_summary.txt")
    ap.add_argument("--regions", nargs="+", default=["total", "fuel", "moderator"],
                    choices=list(REGION_HIST))
    ap.add_argument("--out", default="spectrum.png")
    args = ap.parse_args(argv)

    try:
        import numpy as np
        import uproot
        import matplotlib.pyplot as plt
    except ImportError as exc:
        print(f"Missing dependency: {exc}. Try: pip install uproot numpy matplotlib",
              file=sys.stderr)
        return 2

    s = parse_summary(args.summary)
    n_source = float(s.get("source_neutrons", 0.0))
    if n_source <= 0:
        print("source_neutrons missing/zero in summary", file=sys.stderr)
        return 2

    fig, ax = plt.subplots(figsize=(8, 5))
    with uproot.open(args.root) as f:
        keys = {k.split(";")[0] for k in f.keys()}
        for region in args.regions:
            hist_name = REGION_HIST[region]
            if hist_name not in keys:
                print(f"[skip] {hist_name} not in {args.root}", file=sys.stderr)
                continue
            values, edges = f[hist_name].to_numpy()
            volume = float(s.get(REGION_VOLUME_KEY[region], 0.0))
            if volume <= 0:
                continue
            edges = np.asarray(edges, dtype=float)
            lo, hi = edges[:-1], edges[1:]
            lethargy = np.log(hi / lo)
            centers = np.sqrt(lo * hi)
            with np.errstate(divide="ignore", invalid="ignore"):
                phi = values / (lethargy * volume * n_source)
            phi = np.nan_to_num(phi)
            ax.step(centers, phi, where="mid", label=region)

    ax.set_xscale("log")
    ax.set_xlabel("Neutron energy [MeV]")
    ax.set_ylabel(r"$\phi(u)$  [per lethargy, per source n, per mm$^2$]")
    ax.set_title("BEAVRS assembly neutron flux spectrum")
    ax.legend()
    ax.grid(True, which="both", alpha=0.3)
    fig.tight_layout()
    fig.savefig(args.out, dpi=140)
    print(f"wrote {args.out}")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
