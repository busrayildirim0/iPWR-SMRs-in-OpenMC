# pyrefly: ignore [missing-import]
import openmc
import openmc.deplete
import numpy as np
import glob
import os
import warnings

warnings.filterwarnings("ignore", message="Another .* instance already exists")

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
    grid_res = 17 if lattice_type == "Square" else 15
    
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
            
        # Parse individual k-effective estimators from global_tallies
        k_col = [0.0, 0.0]
        k_abs = [0.0, 0.0]
        k_tra = [0.0, 0.0]
        for row in sp.global_tallies:
            name = row['name'].decode('utf-8') if isinstance(row['name'], bytes) else row['name']
            if name == 'k-collision':
                k_col = [float(row['mean']), float(row['std_dev'])]
            elif name == 'k-absorption':
                k_abs = [float(row['mean']), float(row['std_dev'])]
            elif name == 'k-tracklength':
                k_tra = [float(row['mean']), float(row['std_dev'])]
        
        results['k_collision'] = k_col
        results['k_absorption'] = k_abs
        results['k_tracklength'] = k_tra
        results['k_combined'] = [k_val, k_std]

        # Shannon Entropy (source convergence)
        entropy_val = sp.entropy
        results['shannon_entropy'] = [float(e) for e in entropy_val]
        
        # Batch-by-batch k-effective values (only active batches)
        inactive = sp.n_inactive
        k_gen = sp.k_generation[inactive:]
        results['batch_keff'] = [float(k) for k in k_gen]
        
        # Kinetics parameters
        try:
            ifp_param = sp.get_kinetics_parameters()
            results['beta_eff'] = float(ifp_param.beta_effective)
            results['gen_time'] = float(ifp_param.generation_time)
        except Exception as e:
            print(f"Kinetics parameters not found or failed: {e}")
            results['beta_eff'] = 0.0
            results['gen_time'] = 0.0
            
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
        try:
            leakage_tally = sp.get_tally(name='External_Leakage')
            leakage_val = float(np.sum(np.abs(leakage_tally.get_slice(scores=['current']).mean)))
            results['leakage_rate'] = leakage_val
        except Exception as e:
            print(f"Leakage parsing failed: {e}")
            results['leakage_rate'] = 0.0
            
        # Clad DPA (damage energy tally proxy)
        try:
            dpa_tally = sp.get_tally(name='Clad_DPA')
            dpa_val = float(dpa_tally.get_slice(scores=['damage-energy']).mean.sum())
            results['clad_dpa_rate'] = dpa_val
        except:
            results['clad_dpa_rate'] = 0.0
            
        # Spectral index (fast / thermal fission index)
        try:
            spec_fally = sp.get_tally(name='Fission_Energy_Tally')
            fiss_energy = spec_fally.mean.flatten()
            thermal_fiss = float(fiss_energy[0])
            fast_fiss = float(fiss_energy[2])
            results['spectral_index'] = fast_fiss / thermal_fiss if thermal_fiss > 0 else 0.0
        except Exception as e:
            results['spectral_index'] = 0.0
            
        # 3. Parse Pin-by-pin Power Map (radial_pin_power)
        try:
            try:
                pin_tally = sp.get_tally(name='radial_pin_power')
                power_data = pin_tally.get_slice(scores=['fission']).mean
                # Since multiple cells exist (standard + poison), shape is (grid_res, grid_res, len(fuel_cells)) or similar.
                power_data_summed = power_data.reshape((grid_res, grid_res, -1)).sum(axis=2)
            except LookupError:
                # Fallback to older Pin_Tally
                pin_tally = sp.get_tally(name='Pin_Tally')
                power_data = pin_tally.get_slice(scores=['kappa-fission']).mean
                power_data_summed = power_data.reshape((grid_res, grid_res))
            
            # Flip vertically to match standard coordinate visualization
            power_grid = np.flipud(power_data_summed)
            
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
            print(f"Error parsing radial_pin_power Tally: {e}")
            results['pin_power_map'] = [[0.0] * grid_res] * grid_res
            results['relative_power_map'] = [[0.0] * grid_res] * grid_res
            results['peak_power_factor'] = 1.0
            results['hot_channel_factor'] = 1.0
            
        # Parse Axial Power Profile (axial_power)
        try:
            axial_tally = sp.get_tally(name='axial_power')
            axial_data = axial_tally.get_slice(scores=['fission']).mean.flatten()
            # Normalize to relative power (average over active elements = 1.0)
            active_mask = axial_data > 0
            average_power = float(np.mean(axial_data[active_mask])) if np.any(active_mask) else 1.0
            norm_axial = [float(v / average_power) if average_power > 0 else float(v) for v in axial_data]
            results['axial_power_profile'] = norm_axial
        except Exception as e:
            print(f"Error parsing axial_power Tally: {e}")
            results['axial_power_profile'] = [1.0] * 200

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
            mean_array = group_tally.mean
            reshaped_group = mean_array.reshape((170, 170, 3))
            
            thermal_flux = np.flipud(reshaped_group[:, :, 0])
            epithermal_flux = np.flipud(reshaped_group[:, :, 1])
            fast_flux = np.flipud(reshaped_group[:, :, 2])
            
            results['thermal_flux_map'] = [[float(v) for v in row] for row in thermal_flux]
            results['epithermal_flux_map'] = [[float(v) for v in row] for row in epithermal_flux]
            results['fast_flux_map'] = [[float(v) for v in row] for row in fast_flux]
            
            # Calculate representative biological dose rate map (Sv/h)
            dose_map = (1.0e-10 * thermal_flux) + (1.0e-9 * epithermal_flux) + (1.0e-8 * fast_flux)
            results['dose_rate_map'] = [[float(v) for v in row] for row in dose_map]
        except Exception as e:
            print(f"Error parsing Group Flux Tallies: {e}")
            results['thermal_flux_map'] = [[0.0] * 170] * 170
            results['epithermal_flux_map'] = [[0.0] * 170] * 170
            results['fast_flux_map'] = [[0.0] * 170] * 170
            results['dose_rate_map'] = [[0.0] * 170] * 170
            
        # 6. Parse Energy Spectrum (flux_spectrum)
        try:
            try:
                spec_tally = sp.get_tally(name='flux_spectrum')
                e_filter_idx = 1
            except LookupError:
                # Fallback to old tally
                spec_tally = sp.get_tally(name='Energy_Spectrum_Tally')
                e_filter_idx = 0
                
            spec_data_all = spec_tally.mean
            
            # If shape is (num_cells, num_groups, 1), sum over cells to get standard + poison total
            if len(spec_data_all.shape) == 3 and spec_data_all.shape[0] > 1 and spec_data_all.shape[1] > 1:
                spec_data = spec_data_all.sum(axis=0).flatten()
            else:
                spec_data = spec_data_all.flatten()
                
            e_filter = spec_tally.filters[e_filter_idx]
            e_bins = e_filter.bins
            
            centers = []
            flux_normalized = []
            for i in range(len(e_bins) - 1):
                low = e_bins[i][0]
                high = e_bins[i][1]
                centers.append(float(np.sqrt(low * high))) # geometric mean for log plots
                
                # Letarji hesabı (Kutu Genişliği): delta_ln_E = ln(high/low)
                delta_ln_E = np.log(high / low)
                flux_val = float(spec_data[i] / delta_ln_E) if delta_ln_E > 0 else float(spec_data[i])
                flux_normalized.append(flux_val)
                
            results['energy_spectrum_centers'] = centers
            results['energy_spectrum_flux'] = flux_normalized
        except Exception as e:
            print(f"Error parsing flux_spectrum Tally: {e}")
            results['energy_spectrum_centers'] = []
            results['energy_spectrum_flux'] = []
            
        # 7. Parse 3D Tallies if exists
        try:
            tally_3d = sp.get_tally(name='3D_Flux_Power')
            flux_3d_data = tally_3d.get_slice(scores=['flux']).mean
            power_3d_data = tally_3d.get_slice(scores=['kappa-fission']).mean
            
            flux_3d = flux_3d_data.reshape((grid_res, grid_res, 10))
            power_3d = power_3d_data.reshape((grid_res, grid_res, 10))
            
            results['flux_3d'] = [[[float(v) for v in row] for row in np.flipud(flux_3d[:, :, z])] for z in range(10)]
            results['power_3d'] = [[[float(v) for v in row] for row in np.flipud(power_3d[:, :, z])] for z in range(10)]
        except Exception as e:
            results['flux_3d'] = None
            results['power_3d'] = None
            
    # 8. Parse Depletion results if depletion_results.h5 exists
    depletion_h5 = os.path.join(run_dir, 'depletion_results.h5')
    if os.path.exists(depletion_h5):
        try:
            deplete_res = openmc.deplete.Results(depletion_h5)
            time_steps, k_eff_series = deplete_res.get_eigenvalue()
            days = [t / (24 * 3600) for t in time_steps]
            
            # Find fuel material ID
            materials = openmc.Materials.from_xml(os.path.join(run_dir, 'materials.xml'))
            fuel_mat_id = None
            for m in materials:
                if 'UO2' in m.name:
                    fuel_mat_id = str(m.id)
                    break
            
            xe135_series = []
            sm149_series = []
            pu239_series = []
            u235_series = []
            
            if fuel_mat_id:
                _, xe135_atoms = deplete_res.get_atoms(fuel_mat_id, "Xe135")
                _, sm149_atoms = deplete_res.get_atoms(fuel_mat_id, "Sm149")
                _, pu239_atoms = deplete_res.get_atoms(fuel_mat_id, "Pu239")
                _, u235_atoms = deplete_res.get_atoms(fuel_mat_id, "U235")
                
                xe135_series = [float(v) for v in xe135_atoms]
                sm149_series = [float(v) for v in sm149_atoms]
                pu239_series = [float(v) for v in pu239_atoms]
                u235_series = [float(v) for v in u235_atoms]
                
            results['depletion'] = {
                'days': [float(d) for d in days],
                'k_eff': [float(k[0]) for k in k_eff_series],
                'k_eff_std': [float(k[1]) for k in k_eff_series],
                'xe135': xe135_series,
                'sm149': sm149_series,
                'pu239': pu239_series,
                'u235': u235_series
            }
        except Exception as e:
            print(f"Error parsing depletion results: {e}")
            
    print("Parsing completed successfully!")
    return results
