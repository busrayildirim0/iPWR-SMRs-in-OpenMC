from fastapi import FastAPI, BackgroundTasks, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel
import uuid
import os
import subprocess
import threading
import time
import pandas as pd
import json
import glob
import warnings

# Suppress OpenMC auto ID warnings
warnings.filterwarnings("ignore", message="Another .* instance already exists")

from model_generator import generate_smr_model
from results_parser import parse_openmc_results

app = FastAPI(title="OpenMC SMR Neutronics Platform API")

# Setup CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Workspace directories
BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
RUNS_DIR = os.path.join(BACKEND_DIR, "runs")
os.makedirs(RUNS_DIR, exist_ok=True)

# Datasets
DATASET_PATH = os.path.join(BACKEND_DIR, "generated_dataset.csv")

# Global Jobs Queue & States
jobs = {}  # job_id -> {status, logs, results, progress, params}
dataset_generator_state = {
    "active": False,
    "total_cases": 0,
    "completed_cases": 0,
    "current_params": {},
    "job_id": None
}

import shutil
import urllib.request

class SimulationParams(BaseModel):
    lattice_type: str = "Square"
    active_height: float = 200.0
    pin_pitch: float = 1.25984
    fuel_radius: float = 0.39218
    gap_radius: float = 0.40005
    clad_radius: float = 0.45720
    gt_inner_radius: float = 0.56134
    gt_outer_radius: float = 0.60198
    enrichment: float = 4.5
    soluble_boron: float = 975.0
    clad_material: str = "Zircaloy4"
    poison_enabled: bool = False
    poison_fraction: float = 2.0
    control_rod_state: str = "Fully Withdrawn"
    control_rod_material: str = "Ag-In-Cd"
    particles: int = 5000
    batches: int = 40
    inactive_batches: int = 10
    temperature: float = 566.5
    boundary_type: str = "Reflective"
    kinetics_enabled: bool = False
    safety_coefs_enabled: bool = False
    depletion_enabled: bool = False
    shielding_enabled: bool = False
    economy_enabled: bool = False
    flux_3d_enabled: bool = False

class DatasetGenParams(BaseModel):
    enrichment_min: float = 2.0
    enrichment_max: float = 5.0
    enrichment_steps: int = 4
    
    boron_min: float = 0.0
    boron_max: float = 2000.0
    boron_steps: int = 4
    
    pitch_min: float = 1.20
    pitch_max: float = 1.35
    pitch_steps: int = 4
    
    # default base settings for other parameters
    base_params: SimulationParams

def download_depletion_chain():
    chain_path = os.path.join(BACKEND_DIR, "chain_simple.xml")
    if not os.path.exists(chain_path):
        url = "https://raw.githubusercontent.com/openmc-dev/openmc-notebooks/develop/chain_simple.xml"
        print(f"Downloading simple depletion chain from {url} to {chain_path}...")
        try:
            urllib.request.urlretrieve(url, chain_path)
            print("Download completed successfully.")
        except Exception as e:
            print(f"Failed to download depletion chain: {e}")

def run_openmc_sync(run_dir):
    import sys
    is_linux = sys.platform == 'linux'
    if is_linux:
        cmd = ["openmc"]
        cwd_dir = run_dir
    else:
        wsl_run_dir = windows_to_wsl_path(run_dir)
        cmd = [
            "wsl", "bash", "-c",
            f"source /home/busra/miniconda3/bin/activate openmc && "
            f"export OPENMC_CROSS_SECTIONS=/home/busra/openmc_project/endfb-vii.1-hdf5/cross_sections.xml && "
            f"cd \"{wsl_run_dir}\" && "
            f"openmc"
        ]
        cwd_dir = None
        
    env = os.environ.copy()
    if is_linux:
        env["OPENMC_CROSS_SECTIONS"] = "/home/busra/openmc_project/endfb-vii.1-hdf5/cross_sections.xml"
        
    subprocess.run(cmd, cwd=cwd_dir, env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

def windows_to_wsl_path(win_path):
    win_path = os.path.abspath(win_path)
    drive, path = os.path.splitdrive(win_path)
    drive_letter = drive.lower().replace(":", "")
    path_forward = path.replace('\\', '/')
    wsl_path = f"/mnt/{drive_letter}{path_forward}"
    return wsl_path

def run_simulation_thread(job_id, run_dir, params: SimulationParams):
    jobs[job_id]["status"] = "generating"
    jobs[job_id]["logs"] += "Generating OpenMC input files...\n"
    
    try:
        # Create run directory first
        os.makedirs(run_dir, exist_ok=True)
        
        # Copy depletion chain if enabled
        if params.depletion_enabled:
            download_depletion_chain()
            shutil.copy(os.path.join(BACKEND_DIR, "chain_simple.xml"), os.path.join(run_dir, "chain_simple.xml"))

        # 1. Generate XMLs
        offset = generate_smr_model(
            run_dir=run_dir,
            lattice_type=params.lattice_type,
            active_height=params.active_height,
            pin_pitch=params.pin_pitch,
            fuel_radius=params.fuel_radius,
            gap_radius=params.gap_radius,
            clad_radius=params.clad_radius,
            gt_inner_radius=params.gt_inner_radius,
            gt_outer_radius=params.gt_outer_radius,
            enrichment=params.enrichment,
            soluble_boron=params.soluble_boron,
            clad_material=params.clad_material,
            poison_enabled=params.poison_enabled,
            poison_fraction=params.poison_fraction,
            control_rod_state=params.control_rod_state,
            control_rod_material=params.control_rod_material,
            particles=params.particles,
            batches=params.batches,
            inactive_batches=params.inactive_batches,
            temperature=params.temperature,
            boundary_type=params.boundary_type,
            kinetics_enabled=params.kinetics_enabled,
            safety_coefs_enabled=params.safety_coefs_enabled,
            depletion_enabled=params.depletion_enabled,
            shielding_enabled=params.shielding_enabled,
            economy_enabled=params.economy_enabled,
            flux_3d_enabled=params.flux_3d_enabled
        )
        
        jobs[job_id]["status"] = "running"
        jobs[job_id]["logs"] += "Starting OpenMC Monte Carlo Simulation in WSL...\n"
        
        import sys
        is_linux = sys.platform == 'linux'
        
        if params.depletion_enabled:
            # Write run_depletion.py to run_dir
            run_depletion_py = os.path.join(run_dir, "run_depletion.py")
            with open(run_depletion_py, "w") as f:
                f.write(f"""import openmc
import openmc.deplete

geometry = openmc.Geometry.from_xml('geometry.xml')
materials = openmc.Materials.from_xml('materials.xml')
settings = openmc.Settings.from_xml('settings.xml')
model = openmc.Model(geometry=geometry, materials=materials, settings=settings)

# 4 time steps of depletion (total 240 days)
time_steps = [30.0, 30.0, 60.0, 120.0]
power = 15.0e6

operator = openmc.deplete.CoupledOperator(model, "chain_simple.xml")
integrator = openmc.deplete.PredictorIntegrator(operator, time_steps, power, power_density=None)
integrator.integrate()
""")
            if is_linux:
                cmd = ["python3", "run_depletion.py"]
                cwd_dir = run_dir
            else:
                wsl_run_dir = windows_to_wsl_path(run_dir)
                cmd = [
                    "wsl", "bash", "-c",
                    f"source /home/busra/miniconda3/bin/activate openmc && "
                    f"export OPENMC_CROSS_SECTIONS=/home/busra/openmc_project/endfb-vii.1-hdf5/cross_sections.xml && "
                    f"cd \"{wsl_run_dir}\" && "
                    f"python3 run_depletion.py"
                ]
                cwd_dir = None
        else:
            if is_linux:
                cmd = ["openmc"]
                cwd_dir = run_dir
            else:
                wsl_run_dir = windows_to_wsl_path(run_dir)
                cmd = [
                    "wsl", "bash", "-c",
                    f"source /home/busra/miniconda3/bin/activate openmc && "
                    f"export OPENMC_CROSS_SECTIONS=/home/busra/openmc_project/endfb-vii.1-hdf5/cross_sections.xml && "
                    f"cd \"{wsl_run_dir}\" && "
                    f"openmc"
                ]
                cwd_dir = None
            
        env = os.environ.copy()
        if is_linux:
            env["OPENMC_CROSS_SECTIONS"] = "/home/busra/openmc_project/endfb-vii.1-hdf5/cross_sections.xml"
            
        # Run subprocess and stream stdout
        process = subprocess.Popen(
            cmd,
            cwd=cwd_dir,
            env=env,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1
        )
        
        # Read lines of execution logs
        for line in process.stdout:
            jobs[job_id]["logs"] += line
            
        process.wait()
        
        if process.returncode != 0:
            jobs[job_id]["status"] = "failed"
            jobs[job_id]["logs"] += f"\nError: OpenMC simulation exited with code {process.returncode}\n"
            return
            
        jobs[job_id]["status"] = "parsing"
        jobs[job_id]["logs"] += "\nSimulation finished! Parsing results...\n"
        
        # 2. Parse Statepoint
        results = parse_openmc_results(run_dir, params.lattice_type)
        results["offset"] = offset # Pass offset for visualization boundaries
        
        k_base = results["k_eff"]
        
        # 3. Control Rod Worth auxiliary run
        if params.kinetics_enabled:
            jobs[job_id]["logs"] += "\nRunning auxiliary simulation for Control Rod Worth...\n"
            inserted_dir = os.path.join(run_dir, "inserted")
            target_state = "Fully Inserted" if params.control_rod_state != "Fully Inserted" else "Fully Withdrawn"
            generate_smr_model(
                run_dir=inserted_dir,
                lattice_type=params.lattice_type,
                active_height=params.active_height,
                pin_pitch=params.pin_pitch,
                fuel_radius=params.fuel_radius,
                gap_radius=params.gap_radius,
                clad_radius=params.clad_radius,
                gt_inner_radius=params.gt_inner_radius,
                gt_outer_radius=params.gt_outer_radius,
                enrichment=params.enrichment,
                soluble_boron=params.soluble_boron,
                clad_material=params.clad_material,
                poison_enabled=params.poison_enabled,
                poison_fraction=params.poison_fraction,
                control_rod_state=target_state,
                control_rod_material=params.control_rod_material,
                particles=2000,
                batches=20,
                inactive_batches=5,
                temperature=params.temperature,
                boundary_type=params.boundary_type
            )
            run_openmc_sync(inserted_dir)
            try:
                res_alt = parse_openmc_results(inserted_dir, params.lattice_type)
                k_alt = res_alt["k_eff"]
                
                if params.control_rod_state != "Fully Inserted":
                    k_out, k_in = k_base, k_alt
                else:
                    k_out, k_in = k_alt, k_base
                    
                delta_rho = (k_out - k_in) / (k_out * k_in) if (k_out * k_in) > 0 else 0.0
                results["control_rod_worth_pcm"] = delta_rho * 1e5
                results["k_eff_inserted"] = k_in
                results["k_eff_withdrawn"] = k_out
            except Exception as e:
                print(f"Error calculating rod worth: {e}")
                results["control_rod_worth_pcm"] = 0.0
                
        # 4. Safety Coefficients auxiliary runs
        if params.safety_coefs_enabled:
            jobs[job_id]["logs"] += "\nRunning auxiliary simulations for Safety Coefficients (FTC, MTC, Void)...\n"
            
            # FTC
            ftc_dir = os.path.join(run_dir, "ftc")
            generate_smr_model(
                run_dir=ftc_dir,
                lattice_type=params.lattice_type,
                active_height=params.active_height,
                pin_pitch=params.pin_pitch,
                fuel_radius=params.fuel_radius,
                gap_radius=params.gap_radius,
                clad_radius=params.clad_radius,
                gt_inner_radius=params.gt_inner_radius,
                gt_outer_radius=params.gt_outer_radius,
                enrichment=params.enrichment,
                soluble_boron=params.soluble_boron,
                clad_material=params.clad_material,
                poison_enabled=params.poison_enabled,
                poison_fraction=params.poison_fraction,
                control_rod_state=params.control_rod_state,
                control_rod_material=params.control_rod_material,
                particles=2000,
                batches=20,
                inactive_batches=5,
                temperature=params.temperature,
                fuel_temperature=params.temperature + 300.0, # fuel temp increased by 300K
                boundary_type=params.boundary_type
            )
            run_openmc_sync(ftc_dir)
            k_ftc = 0.0
            try:
                res_ftc = parse_openmc_results(ftc_dir, params.lattice_type)
                k_ftc = res_ftc["k_eff"]
            except Exception as e:
                print(f"Error in FTC run: {e}")
                
            # MTC
            mtc_dir = os.path.join(run_dir, "mtc")
            generate_smr_model(
                run_dir=mtc_dir,
                lattice_type=params.lattice_type,
                active_height=params.active_height,
                pin_pitch=params.pin_pitch,
                fuel_radius=params.fuel_radius,
                gap_radius=params.gap_radius,
                clad_radius=params.clad_radius,
                gt_inner_radius=params.gt_inner_radius,
                gt_outer_radius=params.gt_outer_radius,
                enrichment=params.enrichment,
                soluble_boron=params.soluble_boron,
                clad_material=params.clad_material,
                poison_enabled=params.poison_enabled,
                poison_fraction=params.poison_fraction,
                control_rod_state=params.control_rod_state,
                control_rod_material=params.control_rod_material,
                particles=2000,
                batches=20,
                inactive_batches=5,
                temperature=params.temperature + 20.0, # coolant temp increased by 20K
                boundary_type=params.boundary_type
            )
            run_openmc_sync(mtc_dir)
            k_mtc = 0.0
            try:
                res_mtc = parse_openmc_results(mtc_dir, params.lattice_type)
                k_mtc = res_mtc["k_eff"]
            except Exception as e:
                print(f"Error in MTC run: {e}")
                
            # Void
            void_dir = os.path.join(run_dir, "void")
            generate_smr_model(
                run_dir=void_dir,
                lattice_type=params.lattice_type,
                active_height=params.active_height,
                pin_pitch=params.pin_pitch,
                fuel_radius=params.fuel_radius,
                gap_radius=params.gap_radius,
                clad_radius=params.clad_radius,
                gt_inner_radius=params.gt_inner_radius,
                gt_outer_radius=params.gt_outer_radius,
                enrichment=params.enrichment,
                soluble_boron=params.soluble_boron,
                clad_material=params.clad_material,
                poison_enabled=params.poison_enabled,
                poison_fraction=params.poison_fraction,
                control_rod_state=params.control_rod_state,
                control_rod_material=params.control_rod_material,
                particles=2000,
                batches=20,
                inactive_batches=5,
                temperature=params.temperature,
                boundary_type=params.boundary_type,
                void_fraction=0.10 # 10% void
            )
            run_openmc_sync(void_dir)
            k_void = 0.0
            try:
                res_void = parse_openmc_results(void_dir, params.lattice_type)
                k_void = res_void["k_eff"]
            except Exception as e:
                print(f"Error in Void run: {e}")
                
            # Calculate coefficients
            ftc_val = ((k_ftc - k_base) / (k_ftc * k_base * 300.0)) * 1e5 if (k_ftc * k_base) > 0 else 0.0
            mtc_val = ((k_mtc - k_base) / (k_mtc * k_base * 20.0)) * 1e5 if (k_mtc * k_base) > 0 else 0.0
            void_val = ((k_void - k_base) / (k_void * k_base * 10.0)) * 1e5 if (k_void * k_base) > 0 else 0.0
            
            results["safety_coefficients"] = {
                "ftc": ftc_val,
                "mtc": mtc_val,
                "void": void_val,
                "ftc_k": k_ftc,
                "mtc_k": k_mtc,
                "void_k": k_void
            }
        
        jobs[job_id]["results"] = results
        jobs[job_id]["status"] = "completed"
        jobs[job_id]["logs"] += "Job completed successfully!\n"
        
    except Exception as e:
        jobs[job_id]["status"] = "failed"
        jobs[job_id]["logs"] += f"\nException occurred during run: {str(e)}\n"
        print(f"Exception on job {job_id}: {e}")

def run_dataset_generation_thread(job_id, params: DatasetGenParams):
    global dataset_generator_state
    
    # Calculate parameter ranges
    import numpy as np
    
    enrichments = np.linspace(params.enrichment_min, params.enrichment_max, params.enrichment_steps)
    borons = np.linspace(params.boron_min, params.boron_max, params.boron_steps)
    pitches = np.linspace(params.pitch_min, params.pitch_max, params.pitch_steps)
    
    cases = []
    for e in enrichments:
        for b in borons:
            for p in pitches:
                cases.append((float(e), float(b), float(p)))
                
    dataset_generator_state["active"] = True
    dataset_generator_state["total_cases"] = len(cases)
    dataset_generator_state["completed_cases"] = 0
    dataset_generator_state["job_id"] = job_id
    
    # Prepare CSV file headers if not exists
    if not os.path.exists(DATASET_PATH):
        df_empty = pd.DataFrame(columns=[
            "lattice_type", "pin_pitch", "enrichment", "soluble_boron", 
            "clad_material", "poison_enabled", "poison_fraction", 
            "control_rod_state", "control_rod_material", "particles", "batches",
            "k_eff", "k_eff_std", "reactivity", "peak_power_factor"
        ])
        df_empty.to_csv(DATASET_PATH, index=False)
        
    # Execute sequential cases
    for idx, (e, b, p) in enumerate(cases):
        if not dataset_generator_state["active"]:
            # Stopped by user
            break
            
        case_dir = os.path.join(RUNS_DIR, f"dataset_case_{idx}")
        dataset_generator_state["completed_cases"] = idx
        dataset_generator_state["current_params"] = {
            "enrichment": e,
            "soluble_boron": b,
            "pin_pitch": p
        }
        
        # Copy base params and adjust variant values
        case_params = params.base_params.model_copy()
        case_params.enrichment = e
        case_params.soluble_boron = b
        case_params.pin_pitch = p
        
        # We can run dataset cases with lower particle counts to ensure high performance
        # e.g., override particles and batches for fast screening
        case_params.particles = min(case_params.particles, 2000)
        case_params.batches = min(case_params.batches, 25)
        case_params.inactive_batches = min(case_params.inactive_batches, 5)
        
        try:
            # 1. Generate XML
            generate_smr_model(
                run_dir=case_dir,
                lattice_type=case_params.lattice_type,
                active_height=case_params.active_height,
                pin_pitch=case_params.pin_pitch,
                fuel_radius=case_params.fuel_radius,
                gap_radius=case_params.gap_radius,
                clad_radius=case_params.clad_radius,
                gt_inner_radius=case_params.gt_inner_radius,
                gt_outer_radius=case_params.gt_outer_radius,
                enrichment=case_params.enrichment,
                soluble_boron=case_params.soluble_boron,
                clad_material=case_params.clad_material,
                poison_enabled=case_params.poison_enabled,
                poison_fraction=case_params.poison_fraction,
                control_rod_state=case_params.control_rod_state,
                control_rod_material=case_params.control_rod_material,
                particles=case_params.particles,
                batches=case_params.batches,
                inactive_batches=case_params.inactive_batches,
                temperature=case_params.temperature
            )
            
            # 2. Run OpenMC
            if is_linux:
                cmd = ["openmc"]
                cwd_dir = case_dir
            else:
                wsl_run_dir = windows_to_wsl_path(case_dir)
                cmd = [
                    "wsl", "bash", "-c",
                    f"source /home/busra/miniconda3/bin/activate openmc && "
                    f"export OPENMC_CROSS_SECTIONS=/home/busra/openmc_project/endfb-vii.1-hdf5/cross_sections.xml && "
                    f"cd \"{wsl_run_dir}\" && "
                    f"openmc"
                ]
                cwd_dir = None
            
            # Run simulation synchronously
            env_ds = os.environ.copy()
            if is_linux:
                env_ds["OPENMC_CROSS_SECTIONS"] = "/home/busra/openmc_project/endfb-vii.1-hdf5/cross_sections.xml"
            subprocess.run(cmd, cwd=cwd_dir, env=env_ds, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            
            # 3. Parse results
            res = parse_openmc_results(case_dir, case_params.lattice_type)
            
            # Append result row to dataset CSV
            new_row = {
                "lattice_type": case_params.lattice_type,
                "pin_pitch": case_params.pin_pitch,
                "enrichment": case_params.enrichment,
                "soluble_boron": case_params.soluble_boron,
                "clad_material": case_params.clad_material,
                "poison_enabled": case_params.poison_enabled,
                "poison_fraction": case_params.poison_fraction,
                "control_rod_state": case_params.control_rod_state,
                "control_rod_material": case_params.control_rod_material,
                "particles": case_params.particles,
                "batches": case_params.batches,
                "k_eff": res["k_eff"],
                "k_eff_std": res["k_eff_std"],
                "reactivity": res["reactivity"],
                "peak_power_factor": res["peak_power_factor"]
            }
            
            df = pd.DataFrame([new_row])
            df.to_csv(DATASET_PATH, mode='a', header=False, index=False)
            
            # Clean up simulation XMLs to save disk space
            for f in ["materials.xml", "geometry.xml", "settings.xml", "tallies.xml", "summary.h5"]:
                try:
                    os.remove(os.path.join(case_dir, f))
                except:
                    pass
            for f in glob.glob(os.path.join(case_dir, "statepoint.*.h5")):
                try:
                    os.remove(f)
                except:
                    pass
                    
        except Exception as e:
            print(f"Error on dataset case {idx}: {e}")
            
    dataset_generator_state["completed_cases"] = len(cases)
    dataset_generator_state["active"] = False

# API routes
@app.get("/api/presets")
def get_presets():
    return {
        "NuScale": {
            "lattice_type": "Square",
            "active_height": 200.0,
            "pin_pitch": 1.25984,
            "fuel_radius": 0.39218,
            "gap_radius": 0.40005,
            "clad_radius": 0.45720,
            "gt_inner_radius": 0.56134,
            "gt_outer_radius": 0.60198,
            "enrichment": 4.5,
            "soluble_boron": 975.0,
            "clad_material": "Zircaloy4",
            "poison_enabled": False,
            "poison_fraction": 2.0,
            "control_rod_state": "Fully Withdrawn",
            "control_rod_material": "Ag-In-Cd"
        },
        "CAREM-25": {
            "lattice_type": "Hexagonal",
            "active_height": 140.0,
            "pin_pitch": 1.38,
            "fuel_radius": 0.380,
            "gap_radius": 0.3875,
            "clad_radius": 0.450,
            "gt_inner_radius": 0.380,
            "gt_outer_radius": 0.450,
            "enrichment": 3.1,
            "soluble_boron": 0.0,
            "clad_material": "Zircaloy4",
            "poison_enabled": False,
            "poison_fraction": 2.0,
            "control_rod_state": "Fully Withdrawn",
            "control_rod_material": "Ag-In-Cd"
        },
        "SMR-160": {
            "lattice_type": "Square",
            "active_height": 365.0,
            "pin_pitch": 1.25984,
            "fuel_radius": 0.39218,
            "gap_radius": 0.40005,
            "clad_radius": 0.45720,
            "gt_inner_radius": 0.56134,
            "gt_outer_radius": 0.60198,
            "enrichment": 4.5,
            "soluble_boron": 600.0,
            "clad_material": "M5",
            "poison_enabled": False,
            "poison_fraction": 2.0,
            "control_rod_state": "Fully Withdrawn",
            "control_rod_material": "Ag-In-Cd"
        },
        "mPower": {
            "lattice_type": "Square",
            "active_height": 241.3,
            "pin_pitch": 1.25984,
            "fuel_radius": 0.39218,
            "gap_radius": 0.40005,
            "clad_radius": 0.45720,
            "gt_inner_radius": 0.56134,
            "gt_outer_radius": 0.60198,
            "enrichment": 4.95,
            "soluble_boron": 0.0,
            "clad_material": "M5",
            "poison_enabled": True,
            "poison_fraction": 3.0,
            "control_rod_state": "Fully Withdrawn",
            "control_rod_material": "B4C"
        }
    }

@app.post("/api/simulate")
def start_simulation(params: SimulationParams, background_tasks: BackgroundTasks):
    job_id = str(uuid.uuid4())
    run_dir = os.path.join(RUNS_DIR, f"run_{job_id}")
    
    jobs[job_id] = {
        "status": "pending",
        "logs": "",
        "results": None,
        "params": params.model_dump()
    }
    
    background_tasks.add_task(run_simulation_thread, job_id, run_dir, params)
    return {"job_id": job_id}

@app.get("/api/job/{job_id}/status")
def get_job_status(job_id: str):
    if job_id not in jobs:
        raise HTTPException(status_code=404, detail="Job not found")
    return {"status": jobs[job_id]["status"]}

@app.get("/api/job/{job_id}/logs")
def get_job_logs(job_id: str):
    if job_id not in jobs:
        raise HTTPException(status_code=404, detail="Job not found")
    return {"logs": jobs[job_id]["logs"]}

@app.get("/api/job/{job_id}/results")
def get_job_results(job_id: str):
    if job_id not in jobs:
        raise HTTPException(status_code=404, detail="Job not found")
    if jobs[job_id]["status"] != "completed":
        raise HTTPException(status_code=400, detail="Job is not completed yet")
    return jobs[job_id]["results"]

@app.post("/api/dataset/generate")
def generate_dataset(params: DatasetGenParams, background_tasks: BackgroundTasks):
    if dataset_generator_state["active"]:
        raise HTTPException(status_code=400, detail="A dataset generation job is already active")
        
    job_id = str(uuid.uuid4())
    background_tasks.add_task(run_dataset_generation_thread, job_id, params)
    return {"job_id": job_id, "status": "started"}

@app.get("/api/dataset/status")
def get_dataset_status():
    return dataset_generator_state

@app.post("/api/dataset/stop")
def stop_dataset_generation():
    if not dataset_generator_state["active"]:
        return {"status": "inactive"}
    dataset_generator_state["active"] = False
    return {"status": "stopping"}

@app.get("/api/dataset/download")
def download_dataset():
    if not os.path.exists(DATASET_PATH):
        raise HTTPException(status_code=404, detail="Dataset file not found. Generate one first.")
    return FileResponse(path=DATASET_PATH, media_type="text/csv", filename="smr_generated_dataset.csv")

# Mount frontend files (will serve the built React files from platform/frontend/dist)
FRONTEND_DIST = os.path.join(os.path.dirname(BACKEND_DIR), "frontend", "dist")

@app.get("/")
def serve_index():
    index_path = os.path.join(FRONTEND_DIST, "index.html")
    if os.path.exists(index_path):
        return FileResponse(
            index_path,
            headers={
                "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
                "Pragma": "no-cache",
                "Expires": "0"
            }
        )
    return {"message": "OpenMC SMR API is running. Frontend has not been built yet. Use development server."}

# Mount assets directory for JS/CSS chunks
ASSETS_DIR = os.path.join(FRONTEND_DIST, "assets")
if os.path.exists(ASSETS_DIR):
    app.mount("/assets", StaticFiles(directory=ASSETS_DIR), name="assets")

# Fallback route for React routing (serves index.html with no-cache)
@app.get("/{catchall:path}")
def serve_catchall(catchall: str):
    # Only redirect non-API routes to index.html
    if catchall.startswith("api/"):
        raise HTTPException(status_code=404, detail="API endpoint not found")
        
    index_path = os.path.join(FRONTEND_DIST, "index.html")
    if os.path.exists(index_path):
        return FileResponse(
            index_path,
            headers={
                "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
                "Pragma": "no-cache",
                "Expires": "0"
            }
        )
    raise HTTPException(status_code=404, detail="Page not found")

if __name__ == "__main__":
    import uvicorn
    # Bind to 0.0.0.0 to make it accessible outside WSL
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=False)
