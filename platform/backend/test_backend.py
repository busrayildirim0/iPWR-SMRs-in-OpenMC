import os
import shutil
import time
from model_generator import generate_smr_model
from results_parser import parse_openmc_results

def run_test():
    print("=== STARTING BACKEND INTEGRATION TEST ===")
    
    # Define job ID and test path
    job_id = "test_run_123"
    test_run_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "runs", f"run_{job_id}")
    
    # Clean up test run folder if exists
    if os.path.exists(test_run_dir):
        shutil.rmtree(test_run_dir)
        
    print(f"Test Run Directory: {test_run_dir}")
    
    # Generate model parameters (use small particle and batch size for rapid run)
    offset = generate_smr_model(
        run_dir=test_run_dir,
        lattice_type="Square",
        active_height=100.0,
        pin_pitch=1.26,
        fuel_radius=0.39,
        gap_radius=0.40,
        clad_radius=0.45,
        gt_inner_radius=0.56,
        gt_outer_radius=0.60,
        enrichment=4.5,
        soluble_boron=900.0,
        clad_material="Zircaloy4",
        poison_enabled=False,
        poison_fraction=2.0,
        control_rod_state="Fully Withdrawn",
        control_rod_material="Ag-In-Cd",
        particles=500,
        batches=10,
        inactive_batches=5,
        temperature=560.0,
        boundary_type="Vacuum",
        kinetics_enabled=True,
        shielding_enabled=True,
        economy_enabled=True,
        flux_3d_enabled=True
    )
    
    print(f"Geometry Offset: {offset}")
    
    # Verify XMLs were created
    for f in ["materials.xml", "geometry.xml", "settings.xml", "tallies.xml"]:
        f_path = os.path.join(test_run_dir, f)
        assert os.path.exists(f_path), f"File {f} was not generated!"
    print("Verification: XML files exist.")
    
    # Determine if running in Linux (native WSL execution)
    import sys
    is_linux = sys.platform == 'linux'
    
    if is_linux:
        # Run directly in Linux
        cmd = ["openmc"]
        wsl_run_dir = test_run_dir
    else:
        # Run from Windows via WSL prefix
        win_path = os.path.abspath(test_run_dir)
        drive, path = os.path.splitdrive(win_path)
        drive_letter = drive.lower().replace(":", "")
        path_forward = path.replace('\\', '/')
        wsl_run_dir = f"/mnt/{drive_letter}{path_forward}"
        cmd = [
            "wsl", "bash", "-c",
            f"source /home/busra/miniconda3/bin/activate openmc && "
            f"export OPENMC_CROSS_SECTIONS=/home/busra/openmc_project/endfb-vii.1-hdf5/cross_sections.xml && "
            f"cd \"{wsl_run_dir}\" && "
            f"openmc"
        ]
        
    print(f"Run Directory: {wsl_run_dir}")
    print(f"Command: {cmd}")
    
    print("Executing OpenMC...")
    import subprocess
    start_time = time.time()
    env = os.environ.copy()
    env["OPENMC_CROSS_SECTIONS"] = "/home/busra/openmc_project/endfb-vii.1-hdf5/cross_sections.xml"
    result = subprocess.run(cmd, cwd=wsl_run_dir, env=env, capture_output=True, text=True)
    end_time = time.time()
    
    print(f"Execution took {end_time - start_time:.2f} seconds.")
    print(f"Exit code: {result.returncode}")
    
    if result.returncode != 0:
        print("Stdout:")
        print(result.stdout)
        print("Stderr:")
        print(result.stderr)
        assert False, f"OpenMC run failed in WSL with code {result.returncode}!"
        
    print("OpenMC simulation ran successfully in WSL!")
    
    # Parse results
    results = parse_openmc_results(test_run_dir, "Square")
    
    print("\n--- SIMULATION RESULTS ---")
    print(f"k_eff: {results['k_eff']:.5f} +/- {results['k_eff_std']:.5f}")
    print(f"reactivity (rho): {results['reactivity']:.5f}")
    print(f"fission rate: {results['global_fission_rate']:.3e}")
    print(f"absorption rate: {results['global_absorption_rate']:.3e}")
    print(f"peak power factor: {results['peak_power_factor']:.3f}")
    
    # Asserts
    assert results['k_eff'] > 0.0, "Invalid k_eff calculated!"
    assert len(results['shannon_entropy']) > 0, "No entropy data parsed!"
    assert len(results['pin_power_map']) == 17, "Invalid pin power matrix size!"
    assert len(results['pin_power_map'][0]) == 17, "Invalid pin power matrix columns!"
    assert len(results['flux_map']) == 170, "Invalid flux heatmap size!"
    assert len(results['energy_spectrum_flux']) > 0, "No spectrum data parsed!"
    
    # Advanced Analyses Asserts
    assert results['beta_eff'] is not None, "Beta_eff should be parsed!"
    assert results['gen_time'] is not None, "Gen_time should be parsed!"
    assert results['leakage_rate'] > 0.0, "Vacuum boundary should produce leakage!"
    assert results['clad_dpa_rate'] > 0.0, "Shielding DPA should be calculated!"
    assert results['spectral_index'] > 0.0, "Spectral index should be calculated!"
    assert results['flux_3d'] is not None, "3D flux mesh should be calculated!"
    assert len(results['flux_3d']) == 10, "3D flux should have 10 layers!"
    assert len(results['flux_3d'][0]) == 17, "3D layers should be 17x17!"
    assert results['dose_rate_map'] is not None, "Dose rate map should be parsed!"
    
    print("\n=== TEST COMPLETED SUCCESSFULLY ===")
    
if __name__ == "__main__":
    run_test()
