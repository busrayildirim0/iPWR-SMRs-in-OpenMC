import os
import subprocess

from main import generate_geant4_macro, SimulationParams
from results_parser import parse_geant4_results

RUNS_DIR = os.path.join(os.path.dirname(__file__), "runs", "test_all_models")
os.makedirs(RUNS_DIR, exist_ok=True)

presets = ["BEAVRS", "NuScale", "SMART", "CAREM-25"]
g4_exe = "/mnt/c/Users/Hp/OneDrive/Masaüstü/SMRs modeling and analysis/platform/hizli_geant4/build/beavrs_assembly"

for p in presets:
    print(f"\n================ TESTING PRESET: {p} ================")
    case_dir = os.path.join(RUNS_DIR, p)
    os.makedirs(case_dir, exist_ok=True)
    
    params = SimulationParams()
    params.particles = 1000
    params.batches = 10
    params.inactive_batches = 3
    params.run_geant4 = True
    params.run_openmc = False
    
    if p == "CAREM-25":
        params.lattice_type = "Hexagonal"
        params.pin_pitch = 1.38
        params.active_height = 140.0
    elif p == "SMART":
        params.lattice_type = "Square"
        params.pin_pitch = 1.20
        params.active_height = 200.0
    elif p == "NuScale":
        params.lattice_type = "Square"
        params.pin_pitch = 1.25984
        params.active_height = 200.0
    else:
        params.lattice_type = "Square"
        params.pin_pitch = 1.25984
        params.active_height = 365.76
        
    macro_path = generate_geant4_macro(case_dir, params, prefix="geant4_run")
    
    wsl_run_dir = "/mnt/c/Users/Hp/OneDrive/Masaüstü/SMRs modeling and analysis/platform/backend/runs/test_all_models/" + p
    wsl_macro_path = wsl_run_dir + "/geant4_run.mac"
    
    cmd = [
        "bash", "-c",
        f"source /home/busra/geant4/geant4-install/bin/geant4.sh && "
        f"export G4NEUTRONHPDATA=\"/home/busra/geant4/geant4-install/share/Geant4/data/ENDF-VII.1\" && "
        f"export G4PARTICLEHPDATA=\"/home/busra/geant4/geant4-install/share/Geant4/data/G4TENDL1.4\" && "
        f"cd \"{wsl_run_dir}\" && "
        f"\"{g4_exe}\" -m \"{wsl_macro_path}\""
    ]
    
    res = subprocess.run(cmd, capture_output=True, text=True)
    print(f"[{p}] Exit code: {res.returncode}")
    if res.returncode != 0:
        print(f"[{p}] STDERR:\n", res.stderr[-1500:])
        print(f"[{p}] STDOUT:\n", res.stdout[-1500:])
    else:
        print(f"[{p}] SUCCESS!")
