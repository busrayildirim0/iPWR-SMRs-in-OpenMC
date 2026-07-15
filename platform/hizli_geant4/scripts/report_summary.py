
"""Render a compact Markdown report from BEAVRS summary outputs."""

from __future__ import annotations

import argparse
import csv
from pathlib import Path

def read_key_values(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        if not line.strip() or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip()
    return values

def read_region_flux(path: Path) -> list[dict[str, str]]:
    if not path.exists():
        return []
    with path.open(newline="", encoding="utf-8") as handle:
        return list(csv.DictReader(handle))

def fmt_float(value: str, digits: int = 6) -> str:
    try:
        return f"{float(value):.{digits}g}"
    except (TypeError, ValueError):
        return value

def print_existing(summary: dict[str, str], keys: tuple[str, ...]) -> None:
    for key in keys:
        if key in summary:
            print(f"- `{key}`: {fmt_float(summary[key])}")

def main() -> int:
    parser = argparse.ArgumentParser(
        description="Create a Markdown report from *_summary.txt outputs."
    )
    parser.add_argument("summary", type=Path, help="Path to *_summary.txt")
    parser.add_argument(
        "--region-flux",
        type=Path,
        default=None,
        help="Optional path to *_region_flux.csv",
    )
    args = parser.parse_args()

    summary = read_key_values(args.summary)
    region_flux_path = args.region_flux
    if region_flux_path is None:
        stem = args.summary.name.removesuffix("_summary.txt")
        region_flux_path = args.summary.with_name(f"{stem}_region_flux.csv")
    region_flux = read_region_flux(region_flux_path)

    print(f"# BEAVRS Run Report: `{args.summary.stem.removesuffix('_summary')}`")
    print()
    print("## Run")
    print()
    for key in (
        "events",
        "source_neutrons",
        "neutron_transport_steps",
        "output_histogram_file",
    ):
        if key in summary:
            print(f"- `{key}`: {summary[key]}")

    print()
    print("## Multiplication And Balance")
    print()
    print_existing(
        summary,
        (
            "k_production_over_source",
            "k_uncertainty_1sigma",
            "k_uncertainty_1sigma_poisson",
            "k_inf_prod_over_absorption",
            "mean_nu",
            "alpha_capture_over_fission",
            "thermal_fission_fraction",
            "balance_residual",
        ),
    )

    print()
    print("## Batch Statistics")
    print()
    print_existing(
        summary,
        (
            "k_batch_mean",
            "k_batch_standard_error",
            "k_relative_error",
            "n_batches",
            "wall_time_seconds",
            "figure_of_merit",
        ),
    )

    print()
    print("## Reaction Counts")
    print()
    for key in (
        "fissions_induced",
        "fission_neutrons_produced",
        "captures",
        "leakage",
        "elastic_scatters",
        "inelastic_scatters",
        "thermalized_neutrons",
    ):
        if key in summary:
            print(f"- `{key}`: {summary[key]}")

    if region_flux:
        print()
        print("## Region Integral Flux")
        print()
        print("| Region | Volume [mm^3] | Track Length [mm] | Flux/source [1/mm^2] |")
        print("|---|---:|---:|---:|")
        for row in region_flux:
            print(
                "| {region} | {volume} | {track} | {flux} |".format(
                    region=row["region"],
                    volume=fmt_float(row["volume_mm3"]),
                    track=fmt_float(row["track_length_mm"]),
                    flux=fmt_float(row["integral_flux_per_source_1_per_mm2"]),
                )
            )

    return 0

if __name__ == "__main__":
    raise SystemExit(main())
