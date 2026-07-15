"""Shared I/O helpers for the BEAVRS Geant4 post-processing scripts.

The simulation writes, beside its ROOT/CSV histograms:
  <file>_summary.txt       key=value run summary (robust, version-independent)
  <file>_region_flux.csv   per-region volume / track length / integral flux

These helpers parse those well-defined formats. Nothing here depends on the
Geant4 histogram file format, so the analysis is stable across Geant4 versions.
"""
from __future__ import annotations

import csv
import math
from pathlib import Path

def parse_summary(path: str | Path) -> dict:
    """Parse a `<file>_summary.txt` (key=value) into a dict.

    Values that look numeric are converted to float; everything else stays str.
    """
    result: dict[str, object] = {}
    with open(path) as fh:
        for line in fh:
            line = line.strip()
            if not line or "=" not in line:
                continue
            key, value = line.split("=", 1)
            key, value = key.strip(), value.strip()
            try:
                result[key] = float(value)
            except ValueError:
                result[key] = value
    return result

def load_region_flux(path: str | Path) -> dict[str, dict[str, float]]:
    """Parse a `<file>_region_flux.csv` into {region: {col: value}}."""
    out: dict[str, dict[str, float]] = {}
    with open(path, newline="") as fh:
        for row in csv.DictReader(fh):
            region = row.pop("region")
            out[region] = {k: float(v) for k, v in row.items()}
    return out

def rho(k: float) -> float:
    """Reactivity in absolute units: rho = (k - 1) / k."""
    if k <= 0.0:
        raise ValueError(f"non-physical k = {k}")
    return (k - 1.0) / k

def rho_sigma(k: float, k_sigma: float) -> float:
    """1-sigma uncertainty on rho propagated from sigma_k. d(rho)/dk = 1/k^2."""
    return k_sigma / (k * k)

def pcm(value: float) -> float:
    """Convert an absolute reactivity (or coefficient) to pcm (1e-5)."""
    return value * 1.0e5

def k_and_error(summary: dict) -> tuple[float, float]:
    """Return (k, sigma_k), preferring the batch estimate, else pooled k."""
    k = summary.get("k_batch_mean", summary.get("k_production_over_source"))
    sk = summary.get("k_batch_standard_error", summary.get("k_uncertainty_1sigma", 0.0))
    if k is None:
        raise KeyError("summary has no k value")
    return float(k), float(sk)

def weighted_linear_fit(x, y, sigma):
    """Weighted least-squares straight-line fit y = a + b*x.

    Returns (b, b_sigma, a, a_sigma). Weights are 1/sigma^2; sigma<=0 -> w=1.
    """
    n = len(x)
    if n < 2:
        raise ValueError("need at least two points for a fit")
    w = [1.0 / (s * s) if s and s > 0 else 1.0 for s in sigma]
    sw = sum(w)
    swx = sum(wi * xi for wi, xi in zip(w, x))
    swy = sum(wi * yi for wi, yi in zip(w, y))
    swxx = sum(wi * xi * xi for wi, xi in zip(w, x))
    swxy = sum(wi * xi * yi for wi, xi, yi in zip(w, x, y))
    denom = sw * swxx - swx * swx
    if abs(denom) < 1e-30:
        raise ValueError("degenerate fit (all x equal?)")
    b = (sw * swxy - swx * swy) / denom
    a = (swy - b * swx) / sw
    b_sigma = math.sqrt(sw / denom)
    a_sigma = math.sqrt(swxx / denom)
    return b, b_sigma, a, a_sigma
