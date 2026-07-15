
"""Run a parameter sweep of the BEAVRS simulation and collect the summaries.

For each value of a swept material parameter this generates a macro, runs the
`beavrs_assembly` executable in batch mode, and gathers the resulting
`<file>_summary.txt`. The produced summary files can then be fed to
`reactivity.py` to obtain the corresponding reactivity coefficient.

Example: a Doppler (fuel-temperature) sweep at 600/900/1200 K
    python run_sweep.py --exe ../build/beavrs_assembly \
        --param fuelTemperature --unit kelvin --values 600 900 1200 \
        --events 2000 --neutrons 20 --outdir sweep_doppler

Then:
    python reactivity.py --param fuel_temperature_K sweep_doppler/*_summary.txt

Notes
-----
* Material commands must precede /run/initialize, which this script handles.
* Each run uses an independent random seed so the points are statistically
  independent.
* The simulation must be built with G4 high-precision neutron data available so
  that the Doppler treatment is active (see README).
"""
from __future__ import annotations

import argparse
import subprocess
from pathlib import Path

MAT_COMMAND = {
    "boronPPM": "/beavrs/mat/boronPPM",
    "enrichment": "/beavrs/mat/enrichment",
    "fuelTemperature": "/beavrs/mat/fuelTemperature",
    "moderatorTemperature": "/beavrs/mat/moderatorTemperature",
    "moderatorDensity": "/beavrs/mat/moderatorDensity",
}

def build_macro(param_cmd: str, value: str, unit: str, out_base: str,
                events: int, neutrons: int, seed: int,
                reflect_radial: bool, reflect_axial: bool) -> str:
    unit_suffix = f" {unit}" if unit else ""
    return "\n".join([
        f"/random/setSeeds {seed} {seed + 1}",
        f"{param_cmd} {value}{unit_suffix}",
        "/run/initialize",
        f"/beavrs/output/fileName {out_base}",
        f"/beavrs/geom/reflectRadial {'true' if reflect_radial else 'false'}",
        f"/beavrs/geom/reflectAxial {'true' if reflect_axial else 'false'}",
        f"/beavrs/gun/neutronsPerEvent {neutrons}",
        "/run/printProgress 1000",
        f"/run/beamOn {events}",
        "",
    ])

def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--exe", required=True, help="path to beavrs_assembly")
    ap.add_argument("--param", required=True, choices=sorted(MAT_COMMAND),
                    help="material parameter to sweep")
    ap.add_argument("--values", required=True, nargs="+", help="parameter values")
    ap.add_argument("--unit", default="", help="unit for the value (e.g. kelvin)")
    ap.add_argument("--events", type=int, default=2000)
    ap.add_argument("--neutrons", type=int, default=20)
    ap.add_argument("--seed", type=int, default=1, help="base seed (incremented)")
    ap.add_argument("--outdir", default="sweep", help="output directory")
    ap.add_argument("--open-radial", action="store_true",
                    help="disable radial reflection (bare assembly)")
    ap.add_argument("--open-axial", action="store_true",
                    help="disable axial reflection")
    ap.add_argument("--dry-run", action="store_true",
                    help="write macros but do not run the executable")
    args = ap.parse_args(argv)

    exe = Path(args.exe).resolve()
    if not args.dry_run and not exe.exists():
        ap.error(f"executable not found: {exe}")

    outdir = Path(args.outdir)
    outdir.mkdir(parents=True, exist_ok=True)
    cmd = MAT_COMMAND[args.param]

    summaries = []
    for i, value in enumerate(args.values):
        tag = f"{args.param}_{value}".replace(".", "p").replace("-", "m")
        out_base = str(outdir / tag)
        macro_path = outdir / f"{tag}.mac"
        macro_path.write_text(build_macro(
            cmd, value, args.unit, out_base, args.events, args.neutrons,
            args.seed + 2 * i, not args.open_radial, not args.open_axial))
        print(f"[macro] {macro_path}")
        if args.dry_run:
            continue
        print(f"[run]   {args.param} = {value} {args.unit}")
        subprocess.run([str(exe), "-m", str(macro_path)], check=True)
        summaries.append(f"{out_base}_summary.txt")

    summary_key = {
        "fuelTemperature": "fuel_temperature_K",
        "moderatorTemperature": "moderator_temperature_K",
        "boronPPM": "boron_ppm",
        "enrichment": "enrichment_wt_u235",
        "moderatorDensity": "moderator_density_g_cm3",
    }[args.param]

    if summaries:
        print("\nSummaries written:")
        for s in summaries:
            print(" ", s)
        print("\nNext, e.g.:")
        print(f"  python reactivity.py --param {summary_key} "
              f"{outdir}/*_summary.txt")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
