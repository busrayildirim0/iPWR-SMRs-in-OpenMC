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
        
        # Batch-by-batch k-effective values (all batches)
        inactive = int(sp.n_inactive)
        results['batch_keff'] = [float(k) for k in sp.k_generation]
        results['inactive_batches'] = inactive
        
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
                
            # Compute relative power map (P / P_avg, normalized around 1.0)
            if len(non_zero_powers) > 0:
                rel_power = np.zeros_like(power_grid)
                rel_power[power_grid > 0] = power_grid[power_grid > 0] / avg_power
                results['relative_power_map'] = [[float(v) for v in row] for row in rel_power]
                results['pin_power_map'] = results['relative_power_map']
            else:
                results['relative_power_map'] = [[0.0] * grid_res] * grid_res
                results['pin_power_map'] = results['relative_power_map']
                
        except Exception as e:
            print(f"Error parsing radial_pin_power Tally: {e}")
            results['pin_power_map'] = [[0.0] * grid_res] * grid_res
            results['relative_power_map'] = [[0.0] * grid_res] * grid_res
            results['peak_power_factor'] = 1.0
            results['hot_channel_factor'] = 1.0
            
        # Parse Axial Power Profile (axial_power)
        try:
            axial_tally = sp.get_tally(name='axial_power')
            # get_slice yerine doğrudan mean verisini alıp düzleştiriyoruz:
            raw_axial = axial_tally.mean.ravel()
            
            # Eğer 200 dilim geldiyse 100 dilime düşür (Re-binning):
            if len(raw_axial) == 200:
                raw_axial = raw_axial.reshape(-1, 2).mean(axis=1)
            elif len(raw_axial) > 0 and len(raw_axial) != 100:
                x_old = np.linspace(0, 1, len(raw_axial))
                x_new = np.linspace(0, 1, 100)
                raw_axial = np.interp(x_new, x_old, raw_axial)

            # Relative Power Normalizasyonu
            active_mask = raw_axial > 0
            average_power = float(np.mean(raw_axial[active_mask])) if np.any(active_mask) else 1.0
            
            if average_power > 0:
                norm_axial = (raw_axial / average_power).tolist()
            else:
                norm_axial = raw_axial.tolist()

            results['axial_power_profile'] = norm_axial
            active_height_cm = 200.0
            try:
                geom_path = os.path.join(run_dir, "geometry.xml")
                if os.path.exists(geom_path):
                    old_cwd = os.getcwd()
                    try:
                        os.chdir(run_dir)
                        geom = openmc.Geometry.from_xml("geometry.xml")
                        bbox = geom.bounding_box
                        if bbox and bbox[0] is not None and bbox[1] is not None:
                            active_height_cm = float(bbox[1][2] - bbox[0][2])
                    finally:
                        os.chdir(old_cwd)
            except Exception as geom_err:
                print(f"Warning: could not parse active height from geometry: {geom_err}")

            results['axial_z_heights'] = np.linspace(0, active_height_cm, len(norm_axial)).tolist()

        except Exception as e:
            print(f"Error parsing axial_power Tally: {e}")
            # FALLBACK DÜMDÜZ 1.0 OLMASIN, HATAYI GÖRELİM:
            results['axial_power_profile'] = []
            results['axial_z_heights'] = []

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
            total_flux_sum = float(np.sum(spec_data)) if np.sum(spec_data) > 0 else 1.0

            for i in range(len(e_bins) - 1):
                low = e_bins[i][0]
                high = e_bins[i][1]
                centers.append(float(np.sqrt(low * high))) # geometric mean for log plots (eV)
                
                # Letarji hesabı (Kutu Genişliği): delta_ln_E = ln(high/low)
                delta_ln_E = np.log(high / low)
                if delta_ln_E > 0:
                    flux_val = float((spec_data[i] / total_flux_sum) / delta_ln_E)
                else:
                    flux_val = float(spec_data[i])
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

def parse_geant4_results(run_dir, prefix="geant4_run", lattice_type="Square"):
    import os
    import numpy as np
    
    print(f"Parsing Geant4 results in {run_dir} with prefix {prefix}...")
    
    results = {}
    grid_res = 17 if lattice_type == "Square" else 15
    
    # 1. Parse Summary File: <prefix>_summary.txt
    summary_path = os.path.join(run_dir, f"{prefix}_summary.txt")
    if not os.path.exists(summary_path):
        raise FileNotFoundError(f"Geant4 summary file not found: {summary_path}")
        
    summary_data = {}
    with open(summary_path, 'r') as f:
        for line in f:
            if '=' in line:
                key, val = line.strip().split('=', 1)
                try:
                    summary_data[key] = float(val)
                except ValueError:
                    summary_data[key] = val
                    
    k_val = float(summary_data.get("k_production_over_source", summary_data.get("k_batch_mean", 0.0)))
    k_std = float(summary_data.get("k_uncertainty_1sigma", summary_data.get("k_batch_standard_error", 0.0)))
    
    results['k_eff'] = k_val
    results['k_eff_std'] = k_std
    results['reactivity'] = (k_val - 1.0) / k_val if k_val > 0 else 0.0
    results['k_combined'] = [k_val, k_std]
    
    # Parse beavrs_eigen_summary.txt for convergence history
    eigen_path = os.path.join(run_dir, "beavrs_eigen_summary.txt")
    shannon_entropy = []
    batch_keff = []
    inactive = 0
    if os.path.exists(eigen_path):
        try:
            with open(eigen_path, 'r') as f:
                for line in f:
                    trimmed = line.strip()
                    if not trimmed or trimmed.startswith('#'):
                        continue
                    if '=' in trimmed:
                        if trimmed.startswith("inactive_cycles="):
                            try:
                                inactive = int(trimmed.split('=')[1])
                            except ValueError:
                                pass
                        continue
                    parts = trimmed.split()
                    if len(parts) >= 3:
                        try:
                            k_gen = float(parts[1])
                            entropy_bits = float(parts[2])
                            batch_keff.append(k_gen)
                            shannon_entropy.append(entropy_bits)
                        except ValueError:
                            pass
        except Exception as e:
            print(f"Error parsing beavrs_eigen_summary.txt: {e}")

    # Fill in placeholders for OpenMC-like compatibility
    results['k_collision'] = [k_val, k_std]
    results['k_absorption'] = [k_val, k_std]
    results['k_tracklength'] = [k_val, k_std]
    results['shannon_entropy'] = shannon_entropy
    results['batch_keff'] = batch_keff
    results['inactive_batches'] = inactive
    results['beta_eff'] = None   # Not computed by Geant4 (delayed neutron tracking not enabled)
    results['gen_time'] = None   # Not computed by Geant4
    
    # Global Reaction rates
    results['global_fission_rate'] = float(summary_data.get("fissions_induced", 0.0))
    results['global_absorption_rate'] = float(summary_data.get("absorptions", 0.0))
    results['global_n2n_rate'] = 0.0  # (n,2n) not tracked separately in Geant4
    
    elastic = float(summary_data.get("elastic_scatters", 0.0))
    inelastic = float(summary_data.get("inelastic_scatters", 0.0))
    results['global_scatter_rate'] = elastic + inelastic
    results['global_neutron_production_rate'] = float(summary_data.get("fission_neutrons_produced", 0.0))
    results['leakage_rate'] = float(summary_data.get("leakage", 0.0))
    
    # DPA proxy: use integral flux in Zircaloy cladding (proportional to fast neutron damage)
    # Units: track_length_zircaloy / (volume_zircaloy * source_neutrons) [1/mm^2 per source n]
    tl_zirc = float(summary_data.get("track_length_zircaloy_mm", 0.0))
    vol_zirc = float(summary_data.get("volume_zircaloy_mm3", 1.0))
    n_source = float(summary_data.get("source_neutrons", 1.0))
    # Approximate DPA = fast_flux × σ_displacement; use flux proxy in relative units
    results['clad_dpa_rate'] = (tl_zirc / (vol_zirc * n_source)) if (vol_zirc > 0 and n_source > 0) else 0.0
    
    # Thermal fission fraction & spectral index
    results['thermal_fission_fraction'] = float(summary_data.get("thermal_fission_fraction", 0.0))
    tfiss = float(summary_data.get("fissions_thermal", 0.0))
    ffiss = float(summary_data.get("fissions_fast", 0.0))
    results['spectral_index'] = ffiss / tfiss if tfiss > 0 else 0.0
    
    # 2. Parse 2D Pin Power Map: <prefix>_h2_edep_fuel_pin_map.csv
    pin_map_path = os.path.join(run_dir, f"{prefix}_h2_edep_fuel_pin_map.csv")
    if os.path.exists(pin_map_path):
        try:
            rows = []
            with open(pin_map_path, 'r') as f:
                for line in f:
                    if line.startswith('#') or not line.strip():
                        continue
                    parts = line.strip().split(',')
                    if len(parts) >= 2 and parts[0] != 'entries':
                        rows.append(float(parts[1])) # Sw is energy edep in MeV
            
            # Active grid_res x grid_res map within (N x N) boundaries
            total_len = len(rows)
            N = int(np.round(np.sqrt(total_len))) if total_len > 0 else 0
            if N * N == total_len and N >= 3:
                actual_res = N - 2
                power_grid = np.zeros((actual_res, actual_res))
                for y in range(1, actual_res + 1):
                    for x in range(1, actual_res + 1):
                        power_grid[y-1, x-1] = rows[y * N + x]
                
                power_grid = np.flipud(power_grid)
                power_grid = np.transpose(power_grid)
                
                non_zero = power_grid[power_grid > 0]
                if len(non_zero) > 0:
                    avg_p = float(np.mean(non_zero))
                    max_p = float(np.max(power_grid))
                    results['peak_power_factor'] = max_p / avg_p
                    results['hot_channel_factor'] = max_p / avg_p
                    
                    rel_grid = np.zeros_like(power_grid)
                    rel_grid[power_grid > 0] = power_grid[power_grid > 0] / avg_p
                    results['relative_power_map'] = [[float(v) for v in row] for row in rel_grid]
                    results['pin_power_map'] = results['relative_power_map']
                else:
                    results['peak_power_factor'] = 1.0
                    results['hot_channel_factor'] = 1.0
                    results['relative_power_map'] = [[0.0] * grid_res] * grid_res
                    results['pin_power_map'] = results['relative_power_map']
                
                # Generate upscaled detailed maps for visual consistency
                upscaled = np.repeat(np.repeat(results['relative_power_map'], 10, axis=0), 10, axis=1)
                results['flux_map'] = [[float(v) for v in row] for row in upscaled]
                results['absorption_map'] = [[float(v * 1.1) for v in row] for row in upscaled]
            else:
                results['pin_power_map'] = [[0.0] * grid_res] * grid_res
                results['relative_power_map'] = [[0.0] * grid_res] * grid_res
                results['relative_power_map'] = [[0.0] * grid_res] * grid_res
                results['flux_map'] = [[0.0] * (grid_res * 10)] * (grid_res * 10)
                results['absorption_map'] = [[0.0] * (grid_res * 10)] * (grid_res * 10)
                results['peak_power_factor'] = 1.0
                results['hot_channel_factor'] = 1.0
        except Exception as e:
            print(f"Error parsing Geant4 pin map: {e}")
            results['pin_power_map'] = [[0.0] * grid_res] * grid_res
            results['relative_power_map'] = [[0.0] * grid_res] * grid_res
            results['flux_map'] = [[0.0] * (grid_res * 10)] * (grid_res * 10)
            results['absorption_map'] = [[0.0] * (grid_res * 10)] * (grid_res * 10)
            results['peak_power_factor'] = 1.0
            results['hot_channel_factor'] = 1.0
    else:
        results['pin_power_map'] = [[0.0] * grid_res] * grid_res
        results['relative_power_map'] = [[0.0] * grid_res] * grid_res
        results['flux_map'] = [[0.0] * (grid_res * 10)] * (grid_res * 10)
        results['absorption_map'] = [[0.0] * (grid_res * 10)] * (grid_res * 10)
        results['peak_power_factor'] = 1.0
        results['hot_channel_factor'] = 1.0

    # 3. Parse Axial Power Profile: <prefix>_h1_edep_fuel_z.csv
    axial_path = os.path.join(run_dir, f"{prefix}_h1_edep_fuel_z.csv")
    if os.path.exists(axial_path):
        try:
            axial_vals = []
            with open(axial_path, 'r') as f:
                for line in f:
                    if line.startswith('#') or not line.strip():
                        continue
                    parts = line.strip().split(',')
                    if len(parts) >= 2 and parts[0] != 'entries':
                        axial_vals.append(float(parts[1]))
            
            if len(axial_vals) == 102:
                active_axial = np.array(axial_vals[1:101], dtype=float)
                avg_ax = float(np.mean(active_axial[active_axial > 0])) if np.any(active_axial > 0) else 1.0
                norm_axial = active_axial / avg_ax if avg_ax > 0 else active_axial
                # Apply 5-point moving average to reduce Monte Carlo statistical noise
                kernel = np.ones(5) / 5.0
                smoothed = np.convolve(norm_axial, kernel, mode='same')
                # Fix edge effects: restore first/last 2 bins using narrower windows
                smoothed[0] = np.mean(norm_axial[0:3])
                smoothed[1] = np.mean(norm_axial[0:4])
                smoothed[-2] = np.mean(norm_axial[-4:])
                smoothed[-1] = np.mean(norm_axial[-3:])
                results['axial_power_profile'] = [float(v) for v in smoothed]
                active_height_cm = float(summary_data.get("active_height_cm", 200.0))
                results['axial_z_heights'] = np.linspace(0, active_height_cm, len(smoothed)).tolist()
            else:
                results['axial_power_profile'] = []
                results['axial_z_heights'] = []
        except Exception as e:
            print(f"Error parsing Geant4 axial power: {e}")
            results['axial_power_profile'] = []
            results['axial_z_heights'] = []
    else:
        results['axial_power_profile'] = []
        results['axial_z_heights'] = []

    # 4. Parse Energy Spectrum: <prefix>_h1_flux_E.csv
    spec_path = os.path.join(run_dir, f"{prefix}_h1_flux_E.csv")
    if os.path.exists(spec_path):
        try:
            edges = []
            values = []
            with open(spec_path, 'r') as f:
                for line in f:
                    if line.startswith('#axis edges '):
                        parts = line.strip().split()[2:]
                        edges = [float(x) for x in parts]
                    elif line.startswith('#') or not line.strip():
                        continue
                    else:
                        parts = line.strip().split(',')
                        if len(parts) >= 2 and parts[0] != 'entries':
                            values.append(float(parts[1]))
            
            if len(edges) == 201 and len(values) == 202:
                active_values = np.array(values[1:201])
                total_flux_sum = float(np.sum(active_values)) if np.sum(active_values) > 0 else 1.0
                
                centers = []
                flux_normalized = []
                for i in range(200):
                    # MeV -> eV Dönüşümü (x1e6)
                    low_eV = edges[i] * 1.0e6
                    high_eV = edges[i+1] * 1.0e6
                    centers.append(float(np.sqrt(low_eV * high_eV)))
                    
                    delta_ln_E = np.log(high_eV / low_eV)
                    if delta_ln_E > 0:
                        flux_val = float((active_values[i] / total_flux_sum) / delta_ln_E)
                    else:
                        flux_val = float(active_values[i])
                    flux_normalized.append(flux_val)
                    
                results['energy_spectrum_centers'] = centers
                results['energy_spectrum_flux'] = flux_normalized
            else:
                results['energy_spectrum_centers'] = []
                results['energy_spectrum_flux'] = []
        except Exception as e:
            print(f"Error parsing Geant4 flux spectrum: {e}")
            results['energy_spectrum_centers'] = []
            results['energy_spectrum_flux'] = []
    else:
        results['energy_spectrum_centers'] = []
        results['energy_spectrum_flux'] = []

    # 5. Interpolate (grid_res*10)x(grid_res*10) Fine Mesh Maps from grid_res x grid_res grid for consistency
    try:
        power_grid = np.array(results.get('pin_power_map', [[0.0]*grid_res]*grid_res))
        upscaled = np.repeat(np.repeat(power_grid, 10, axis=0), 10, axis=1)
        results['flux_map'] = [[float(v) for v in row] for row in upscaled]
        results['fission_map'] = [[float(v * 0.8) for v in row] for row in upscaled]
        results['absorption_map'] = [[float(v * 0.9) for v in row] for row in upscaled]
        results['scattering_map'] = [[float(v * 4.0) for v in row] for row in upscaled]
        results['n2n_map'] = [[float(v * 0.01) for v in row] for row in upscaled]
        # Approximate group flux maps from spectral index
        # thermal_fission_fraction from summary gives rough thermal/fast split
        th_frac = results.get('thermal_fission_fraction', 0.65)
        fast_frac = max(0.0, 1.0 - th_frac)
        results['thermal_flux_map'] = [[float(v * th_frac) for v in row] for row in upscaled]
        results['epithermal_flux_map'] = [[float(v * (1.0 - th_frac - fast_frac * 0.5)) for v in row] for row in upscaled]
        results['fast_flux_map'] = [[float(v * fast_frac * 0.5) for v in row] for row in upscaled]
        # Biological dose map: ICRP-style weighted sum of flux groups (relative, not absolute Sv/h)
        dose_map_arr = np.array([[v * (1e-10 * th_frac + 1e-9 * (1.0 - th_frac - fast_frac * 0.5) + 1e-8 * fast_frac * 0.5)
                                   for v in row] for row in upscaled])
        results['dose_rate_map'] = [[float(v) for v in row] for row in dose_map_arr]
    except Exception as e:
        print(f"Error generating fine maps: {e}")
        results['flux_map'] = [[0.0] * (grid_res * 10)] * (grid_res * 10)
        results['fission_map'] = [[0.0] * (grid_res * 10)] * (grid_res * 10)
        results['absorption_map'] = [[0.0] * (grid_res * 10)] * (grid_res * 10)
        results['scattering_map'] = [[0.0] * (grid_res * 10)] * (grid_res * 10)
        results['n2n_map'] = [[0.0] * (grid_res * 10)] * (grid_res * 10)
        results['thermal_flux_map'] = [[0.0] * (grid_res * 10)] * (grid_res * 10)
        results['epithermal_flux_map'] = [[0.0] * (grid_res * 10)] * (grid_res * 10)
        results['fast_flux_map'] = [[0.0] * (grid_res * 10)] * (grid_res * 10)
        results['dose_rate_map'] = [[0.0] * (grid_res * 10)] * (grid_res * 10)
        
    results['flux_3d'] = None
    results['power_3d'] = None
    results['depletion'] = None
    
    print("Geant4 parsing completed successfully!")
    return results
