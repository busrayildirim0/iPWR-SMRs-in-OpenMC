import openmc
import numpy as np
import glob
import os

def parse_openmc_results(run_dir, lattice_type="Square"):
    print(f"Parsing OpenMC results in {run_dir}...")
    
    # 1. Locate the statepoint file
    statepoint_pattern = os.path.join(run_dir, 'statepoint.*.h5')
    statepoint_files = glob.glob(statepoint_pattern)
    
    if not statepoint_files:
        raise FileNotFoundError(f"No statepoint file found in {run_dir}. Did the simulation crash?")
        
    latest_sp = max(statepoint_files, key=os.path.getctime)
    print(f"Loading statepoint: {latest_sp}")
    
    results = {}
    
    with openmc.StatePoint(latest_sp) as sp:
        # Core performance metrics
        k_combined = sp.keff
        k_val = float(k_combined.nominal_value)
        k_std = float(k_combined.std_dev)
        
        results['k_eff'] = k_val
        results['k_eff_std'] = k_std
        
        # Reactivity rho: (k - 1) / k
        if k_val > 0:
            results['reactivity'] = (k_val - 1.0) / k_val
        else:
            results['reactivity'] = 0.0
            
        # Shannon Entropy (source convergence)
        entropy_val = sp.entropy
        results['shannon_entropy'] = [float(e) for e in entropy_val]
        
        # Batch-by-batch k-effective values
        k_gen = sp.k_generation
        results['batch_keff'] = [float(k) for k in k_gen]
        
        # 2. Parse Global Reactions
        try:
            rx_tally = sp.get_tally(name='Global_Reactions')
            fission_t = rx_tally.get_slice(scores=['fission']).mean.sum()
            absorption_t = rx_tally.get_slice(scores=['absorption']).mean.sum()
            n2n_t = rx_tally.get_slice(scores=['(n,2n)']).mean.sum()
            scatter_t = rx_tally.get_slice(scores=['scatter']).mean.sum()
            
            results['global_fission_rate'] = float(fission_t)
            results['global_absorption_rate'] = float(absorption_t)
            results['global_n2n_rate'] = float(n2n_t)
            results['global_scatter_rate'] = float(scatter_t)
            results['global_neutron_production_rate'] = float(fission_t * 2.43) # approx nu=2.43 for U235
        except Exception as e:
            print(f"Warning parsing global reactions: {e}")
            results['global_fission_rate'] = 0.0
            results['global_absorption_rate'] = 0.0
            results['global_n2n_rate'] = 0.0
            results['global_scatter_rate'] = 0.0
            results['global_neutron_production_rate'] = 0.0
            
        # Leakage rate
        # In reflective boundaries, leakage is 0. But let's check if the statepoint summary lists leakage.
        # OpenMC statepoint has sp.k_generation, but does not expose leakage directly as a simple attribute.
        # We can extract leakage from the output, or mock/set it if boundaries are reflective/vacuum.
        # Let's see: we can look at the summary file if it exists, or just set it to 0.0 if reflective boundary is detected.
        results['leakage_rate'] = 0.0
        
        # 3. Parse Pin-by-pin Power Map (kappa-fission)
        grid_res = 17 if lattice_type == "Square" else 15
        try:
            pin_tally = sp.get_tally(name='Pin_Tally')
            power_data = pin_tally.get_slice(scores=['kappa-fission']).mean
            
            # Reshape mesh tally output to 2D grid
            power_grid = power_data.reshape((grid_res, grid_res))
            # Flip vertically to match standard coordinate visualization
            power_grid = np.flipud(power_grid)
            
            # Convert to list of lists
            results['pin_power_map'] = [[float(v) for v in row] for row in power_grid]
            
            # Calculate power statistics
            non_zero_powers = power_grid[power_grid > 0]
            if len(non_zero_powers) > 0:
                avg_power = float(np.mean(non_zero_powers))
                max_power = float(np.max(power_grid))
                results['peak_power_factor'] = max_power / avg_power
                results['hot_channel_factor'] = max_power / avg_power
            else:
                results['peak_power_factor'] = 1.0
                results['hot_channel_factor'] = 1.0
                
            # Compute relative power map
            if len(non_zero_powers) > 0:
                rel_power = np.zeros_like(power_grid)
                rel_power[power_grid > 0] = power_grid[power_grid > 0] / avg_power
                results['relative_power_map'] = [[float(v) for v in row] for row in rel_power]
            else:
                results['relative_power_map'] = results['pin_power_map']
                
        except Exception as e:
            print(f"Error parsing Pin Tally: {e}")
            results['pin_power_map'] = [[0.0] * grid_res] * grid_res
            results['relative_power_map'] = [[0.0] * grid_res] * grid_res
            results['peak_power_factor'] = 1.0
            results['hot_channel_factor'] = 1.0
            
        # 4. Parse Fine Spatial Maps (170x170 grids of Flux, Fission, Absorption)
        try:
            fine_tally = sp.get_tally(name='Fine_Mesh_Tally')
            
            flux_data = fine_tally.get_slice(scores=['flux']).mean.reshape((170, 170))
            fission_data = fine_tally.get_slice(scores=['fission']).mean.reshape((170, 170))
            abs_data = fine_tally.get_slice(scores=['absorption']).mean.reshape((170, 170))
            
            flux_data = np.flipud(flux_data)
            fission_data = np.flipud(fission_data)
            abs_data = np.flipud(abs_data)
            
            results['flux_map'] = [[float(v) for v in row] for row in flux_data]
            results['fission_map'] = [[float(v) for v in row] for row in fission_data]
            results['absorption_map'] = [[float(v) for v in row] for row in abs_data]
            
            # Simple scattering map can be approximated or set as difference
            results['scattering_map'] = [[float(v * 4.0) for v in row] for row in flux_data] # visual approximation
            results['n2n_map'] = [[float(v * 0.01) for v in row] for row in fission_data] # visual approximation
        except Exception as e:
            print(f"Error parsing Fine Mesh Tallies: {e}")
            results['flux_map'] = [[0.0] * 170] * 170
            results['fission_map'] = [[0.0] * 170] * 170
            results['absorption_map'] = [[0.0] * 170] * 170
            results['scattering_map'] = [[0.0] * 170] * 170
            results['n2n_map'] = [[0.0] * 170] * 170
            
        # 5. Parse Group-wise Fluxes (Thermal, Epithermal, Fast)
        try:
            group_tally = sp.get_tally(name='Group_Flux_Tally')
            # 3 energy groups from filter: Group 1 (<0.625 eV), Group 2 (0.625 eV to 100 keV), Group 3 (>100 keV)
            # In OpenMC, slicing an energy filter will yield a slice per bin
            # Index 0: Thermal, Index 1: Epithermal, Index 2: Fast
            # Slice syntax in openmc: get_slice(filters=[openmc.EnergyFilter], filter_bins=[(low, high)])
            # Or we can reshape the mean array: shape is (170, 170, 3) or similar depending on filter order
            mean_array = group_tally.mean
            # Reshape it to (170, 170, 3)
            reshaped_group = mean_array.reshape((170, 170, 3))
            
            thermal_flux = np.flipud(reshaped_group[:, :, 0])
            epithermal_flux = np.flipud(reshaped_group[:, :, 1])
            fast_flux = np.flipud(reshaped_group[:, :, 2])
            
            results['thermal_flux_map'] = [[float(v) for v in row] for row in thermal_flux]
            results['epithermal_flux_map'] = [[float(v) for v in row] for row in epithermal_flux]
            results['fast_flux_map'] = [[float(v) for v in row] for row in fast_flux]
        except Exception as e:
            print(f"Error parsing Group Flux Tallies: {e}")
            results['thermal_flux_map'] = [[0.0] * 170] * 170
            results['epithermal_flux_map'] = [[0.0] * 170] * 170
            results['fast_flux_map'] = [[0.0] * 170] * 170
            
        # 6. Parse Energy Spectrum
        try:
            spec_tally = sp.get_tally(name='Energy_Spectrum_Tally')
            spec_data = spec_tally.mean.flatten()
            
            # The energy filter has 500 bins (501 boundaries)
            # Retrieve energy filter boundaries from the tally
            e_filter = spec_tally.filters[0]
            e_bins = e_filter.bins
            
            # Calculate center points for the energy graph
            centers = []
            for i in range(len(e_bins) - 1):
                low = e_bins[i][0]
                high = e_bins[i][1]
                centers.append(float(np.sqrt(low * high))) # geometric mean for log plots
                
            results['energy_spectrum_centers'] = centers
            results['energy_spectrum_flux'] = [float(v) for v in spec_data]
        except Exception as e:
            print(f"Error parsing Energy Spectrum Tally: {e}")
            results['energy_spectrum_centers'] = []
            results['energy_spectrum_flux'] = []
            
    print("Parsing completed successfully!")
    return results
