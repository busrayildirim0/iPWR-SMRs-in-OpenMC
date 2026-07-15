
"""Plot the 17x17 pin-power map and report the pin-power peaking factor.

The simulation scores fuel energy deposition per pin into the 2D histogram
`edep_fuel_pin_map`. Locally deposited fission energy is an excellent proxy for
relative pin power, so this reads that histogram from the ROOT output, draws a
heatmap, and computes the peaking factor

    F_q = max(pin power) / mean(pin power over fuelled pins)

Guide-tube and instrument-tube positions deposit ~no fuel energy and are
excluded from the average.

Usage:
    python plot_pin_map.py beavrs_output.root [--out pin_map.png]

Requires: uproot, numpy, matplotlib
"""
from __future__ import annotations

import argparse
import sys

def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("root", help="ROOT histogram file from the run")
    ap.add_argument("--hist", default="edep_fuel_pin_map")
    ap.add_argument("--out", default="pin_map.png")
    ap.add_argument("--threshold", type=float, default=0.05,
                    help="fraction of max below which a pin is treated as "
                         "unfuelled and excluded from the average (default 0.05)")
    args = ap.parse_args(argv)

    try:
        import numpy as np
        import uproot
        import matplotlib.pyplot as plt
    except ImportError as exc:
        print(f"Missing dependency: {exc}. Try: pip install uproot numpy matplotlib",
              file=sys.stderr)
        return 2

    with uproot.open(args.root) as f:
        keys = {k.split(";")[0] for k in f.keys()}
        if args.hist not in keys:
            print(f"{args.hist} not found in {args.root}", file=sys.stderr)
            return 2
        values = f[args.hist].to_numpy()[0]

    power = np.asarray(values, dtype=float)
    peak = power.max()
    if peak <= 0:
        print("pin map is empty (no fuel energy deposited)", file=sys.stderr)
        return 2

    fuelled = power[power > args.threshold * peak]
    mean_power = fuelled.mean()
    peaking = peak / mean_power if mean_power > 0 else float("nan")

    norm = power / mean_power

    print(f"# Pin-power map from {args.root}")
    print(f"  fuelled pins        : {fuelled.size}")
    print(f"  peak / mean         : {peak:.4g} / {mean_power:.4g}")
    print(f"  peaking factor F_q  : {peaking:.4f}")

    fig, ax = plt.subplots(figsize=(6.5, 5.5))
    im = ax.imshow(norm.T, origin="lower", cmap="inferno", interpolation="nearest")
    ax.set_title(f"BEAVRS pin power (normalized)  F_q = {peaking:.3f}")
    ax.set_xlabel("Pin column")
    ax.set_ylabel("Pin row")
    fig.colorbar(im, ax=ax, label="relative pin power")
    fig.tight_layout()
    fig.savefig(args.out, dpi=140)
    print(f"wrote {args.out}")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
