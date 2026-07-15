
"""Summarise / plot the k-eigenvalue power-iteration convergence.

Reads `beavrs_eigen_summary.txt` (written by /beavrs/eigen/run): one row per
generation with the generation k, the fission-source Shannon entropy, and an
active/inactive flag, followed by the final k_eff and its standard error.

Prints a convergence table and the final k_eff. If matplotlib is available it
also writes a PNG with two panels: generation k (inactive vs active) and the
Shannon entropy vs generation, with the inactive/active boundary marked.

Usage:
    python plot_eigen.py beavrs_eigen_summary.txt [--png eigen_convergence.png]
"""
from __future__ import annotations

import argparse

def parse(path):
    rows, meta = [], {}
    with open(path) as fh:
        for line in fh:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            if "=" in line:
                key, val = line.split("=", 1)
                meta[key.strip()] = val.strip()
                continue
            parts = line.split()
            if len(parts) >= 5:
                rows.append({
                    "cycle": int(parts[0]),
                    "k": float(parts[1]),
                    "entropy": float(parts[2]),
                    "active": bool(int(parts[3])),
                    "source": int(parts[4]),
                })
    return rows, meta

def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("summary", nargs="?", default="beavrs_eigen_summary.txt")
    ap.add_argument("--png", default="eigen_convergence.png")
    args = ap.parse_args(argv)

    rows, meta = parse(args.summary)
    if not rows:
        ap.error(f"no per-generation rows found in {args.summary}")

    print(f"# k-eigenvalue convergence from {args.summary}")
    print(f"{'gen':>4} {'k_gen':>9} {'H[bits]':>9}  phase")
    for r in rows:
        print(f"{r['cycle']:>4} {r['k']:>9.5f} {r['entropy']:>9.4f}"
              f"  {'active' if r['active'] else 'inactive'}")

    keff = meta.get("k_eff")
    kerr = meta.get("k_eff_standard_error")
    hmax = meta.get("max_shannon_entropy_bits")
    if keff is not None:
        print(f"\nk_eff = {float(keff):.5f} +/- {float(kerr or 0):.5f}"
              f"   ({meta.get('active_cycles', '?')} active, "
              f"{meta.get('inactive_cycles', '?')} discarded)")
        rho = (float(keff) - 1.0) / float(keff) * 1e5
        print(f"rho   = {rho:+.1f} pcm")
    if hmax is not None:
        print(f"final H / H_max = {rows[-1]['entropy']:.4f} / {float(hmax):.4f} bits")

    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
    except ImportError:
        print("\n(matplotlib not available; skipping the PNG)")
        return 0

    inactive_n = int(meta.get("inactive_cycles", 0)) if not any(
        r["active"] for r in rows) else None
    boundary = next((r["cycle"] for r in rows if r["active"]), None)
    if boundary is not None:
        boundary -= 0.5

    cyc = [r["cycle"] for r in rows]
    fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(8, 6), sharex=True)

    ax1.plot([r["cycle"] for r in rows if not r["active"]],
             [r["k"] for r in rows if not r["active"]],
             "o-", color="0.6", label="inactive (discarded)", ms=4)
    ax1.plot([r["cycle"] for r in rows if r["active"]],
             [r["k"] for r in rows if r["active"]],
             "o-", color="C0", label="active", ms=4)
    if keff is not None:
        ax1.axhline(float(keff), color="C3", ls="--",
                    label=f"k_eff = {float(keff):.5f}")
        if kerr:
            ax1.axhspan(float(keff) - float(kerr), float(keff) + float(kerr),
                        color="C3", alpha=0.15)
    if boundary is not None:
        ax1.axvline(boundary, color="k", ls=":", lw=1)
    ax1.set_ylabel("generation k")
    ax1.legend(fontsize=8)
    ax1.grid(alpha=0.3)

    ax2.plot(cyc, [r["entropy"] for r in rows], "o-", color="C2", ms=4)
    if hmax is not None:
        ax2.axhline(float(hmax), color="0.5", ls="--",
                    label=f"H_max = {float(hmax):.2f}")
        ax2.legend(fontsize=8)
    if boundary is not None:
        ax2.axvline(boundary, color="k", ls=":", lw=1)
    ax2.set_ylabel("Shannon entropy [bits]")
    ax2.set_xlabel("generation")
    ax2.grid(alpha=0.3)

    fig.suptitle("BEAVRS 17x17 - k-eigenvalue power iteration")
    fig.tight_layout()
    fig.savefig(args.png, dpi=120)
    print(f"\nwrote {args.png}")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
