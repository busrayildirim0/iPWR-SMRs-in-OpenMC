import openmc
import openmc.model
import math
import os
import numpy as np
import warnings

# Suppress OpenMC auto ID warnings to prevent log clutter
warnings.filterwarnings("ignore", message="Another .* instance already exists")


def generate_smr_model(
    run_dir,
    lattice_type="Square",         # "Square" or "Hexagonal"
    active_height=200.0,           # Z-axis active fuel height (cm)
    pin_pitch=1.25984,             # Pitch center-to-center (cm)
    fuel_radius=0.39218,           # Fuel pellet outer radius (cm)
    gap_radius=0.40005,            # Gap outer radius (cm)
    clad_radius=0.45720,           # Clad outer radius (cm)
    gt_inner_radius=0.56134,       # Guide tube inner radius (cm)
    gt_outer_radius=0.60198,       # Guide tube outer radius (cm)
    enrichment=4.5,                # U-235 enrichment (2.0 to 5.0) -> represented in percentage
    soluble_boron=975.0,           # Soluble boron concentration in coolant (ppm)
    clad_material="Zircaloy4",     # "Zircaloy4", "M5", "SS304", "FeCrAl" or "Q12"
    poison_enabled=False,          # Enable Burnable Poison
    poison_fraction=2.0,           # Gd2O3 concentration weight % (e.g. 2%)
    control_rod_state="Fully Withdrawn", # "Fully Withdrawn", "Fully Inserted", "Partially Inserted"
    control_rod_material="Ag-In-Cd",     # "Ag-In-Cd", "B4C", "Hafnium"
    particles=10000,               # Number of simulation particles
    batches=50,                    # Number of batches
    inactive_batches=10,           # Number of inactive batches
    temperature=566.5,             # Coolant temperature in K
    boundary_type="Reflective",    # "Reflective" or "Vacuum"
    fuel_temperature=900.0,        # Fuel temperature in K (for FTC/Doppler feedback)
    kinetics_enabled=False,        # Calculate Beta_eff / kinetics
    safety_coefs_enabled=False,    # Safety coefficients calculation (MTC, FTC, Void)
    depletion_enabled=False,       # Depletion/Burnup run flag
    shielding_enabled=False,       # Dose mapping & Vessel/Clad damage DPA
    economy_enabled=False,         # Detailed neutron economy & reaction rates
    flux_3d_enabled=False,         # Enable 3D mesh tallies
    void_fraction=0.0,             # Void fraction mult (e.g. 0.1 for 10% void)
    fuel_material="UO2",           # "UO2" or "MOX"
    fuel_density=10.42             # Fuel density (g/cm3)
):
    print(f"Generating SMR Model in {run_dir} (Boundary: {boundary_type}, Kinetics: {kinetics_enabled}, Depletion: {depletion_enabled})...")
    os.makedirs(run_dir, exist_ok=True)
    
    # Reset auto IDs to avoid conflicts across runs
    openmc.reset_auto_ids()
    
    # 1. Define Materials
    materials_list = []
    enrichment_fraction = enrichment / 100.0
    
    # Standard Fuel Material
    fuel = openmc.Material(name='Standard_Fuel')
    fuel.set_density('g/cm3', fuel_density)
    fuel.temperature = fuel_temperature
    
    m_u = enrichment_fraction * 235.043 + (1.0 - enrichment_fraction) * 238.0507
    m_o2 = 2.0 * 15.999
    m_uo2 = m_u + m_o2
    
    if fuel_material == "UO2":
        fuel.add_nuclide('U235', enrichment_fraction * (m_u / m_uo2), 'wo')
        fuel.add_nuclide('U238', (1.0 - enrichment_fraction) * (m_u / m_uo2), 'wo')
        fuel.add_nuclide('O16', m_o2 / m_uo2, 'wo')
    else:  # MOX (Mixed Oxide Fuel)
        pu_frac = enrichment_fraction
        u_frac = 1.0 - pu_frac
        fuel.add_nuclide('U235', u_frac * 0.002 * (238.0 / 270.0), 'wo')
        fuel.add_nuclide('U238', u_frac * 0.998 * (238.0 / 270.0), 'wo')
        fuel.add_nuclide('Pu239', pu_frac * (239.0 / 271.0), 'wo')
        fuel.add_nuclide('O16', 2.0 * 16.0 / 270.0, 'wo')
        
    materials_list.append(fuel)
    
    # Poisoned Fuel Material if enabled
    if poison_enabled:
        gd2o3_frac = poison_fraction / 100.0
        fuel_frac = 1.0 - gd2o3_frac
        
        poison_fuel = openmc.Material(name='Poisoned_Fuel_Gd2O3')
        poison_fuel.set_density('g/cm3', fuel_density * 0.97) # Gd mixed is slightly lower density
        poison_fuel.temperature = fuel_temperature
        
        if fuel_material == "UO2":
            poison_fuel.add_nuclide('U235', enrichment_fraction * (m_u / m_uo2) * fuel_frac, 'wo')
            poison_fuel.add_nuclide('U238', (1.0 - enrichment_fraction) * (m_u / m_uo2) * fuel_frac, 'wo')
            poison_fuel.add_nuclide('O16', (m_o2 / m_uo2) * fuel_frac, 'wo')
        else: # MOX
            pu_frac = enrichment_fraction
            u_frac = 1.0 - pu_frac
            poison_fuel.add_nuclide('U235', u_frac * 0.002 * (238.0 / 270.0) * fuel_frac, 'wo')
            poison_fuel.add_nuclide('U238', u_frac * 0.998 * (238.0 / 270.0) * fuel_frac, 'wo')
            poison_fuel.add_nuclide('Pu239', pu_frac * (239.0 / 271.0) * fuel_frac, 'wo')
            poison_fuel.add_nuclide('O16', (2.0 * 16.0 / 270.0) * fuel_frac, 'wo')
            
        m_gd2 = 2 * 157.25
        m_o3 = 3 * 15.999
        m_gd2o3 = m_gd2 + m_o3
        poison_fuel.add_element('Gd', (m_gd2 / m_gd2o3) * gd2o3_frac, 'wo')
        o_poison_fraction = (m_o3 / m_gd2o3) * gd2o3_frac
        poison_fuel.add_nuclide('O16', o_poison_fraction, 'wo')
        materials_list.append(poison_fuel)
    else:
        poison_fuel = fuel
        
    # Cladding Material Selection
    clad = openmc.Material(name=f'Clad_{clad_material}')
    if clad_material == "Zircaloy4":
        clad.set_density('g/cm3', 6.56)
        clad.add_element('Zr', 0.9823, 'wo')
        clad.add_element('Sn', 0.0145, 'wo')
        clad.add_element('Fe', 0.0021, 'wo')
        clad.add_element('Cr', 0.0011, 'wo')
    elif clad_material == "SS304":
        clad.set_density('g/cm3', 8.00)
        clad.add_element('Fe', 0.68, 'wo')
        clad.add_element('Cr', 0.19, 'wo')
        clad.add_element('Ni', 0.10, 'wo')
    elif clad_material == "FeCrAl":
        clad.set_density('g/cm3', 7.25)
        clad.add_element('Fe', 0.73, 'wo')
        clad.add_element('Cr', 0.22, 'wo')
        clad.add_element('Al', 0.05, 'wo')
    else: # M5 or Q12
        clad.set_density('g/cm3', 6.55)
        clad.add_element('Zr', 0.9885, 'wo')
        clad.add_element('Nb', 0.0100, 'wo')
        clad.add_nuclide('O16', 0.0015, 'wo')
    materials_list.append(clad)
    
    # Helium Gap Gas
    helium = openmc.Material(name='Gap_Helium')
    helium.set_density('g/cm3', 0.001598)
    helium.add_element('He', 1.0)
    materials_list.append(helium)
    
    # Control Rod Absorber Material
    absorber = openmc.Material(name='Control_Rod_Absorber')
    if control_rod_material == "Ag-In-Cd":
        absorber.set_density('g/cm3', 10.17)
        absorber.add_element('Ag', 0.80, 'wo')
        absorber.add_element('In', 0.15, 'wo')
        absorber.add_element('Cd', 0.05, 'wo')
    elif control_rod_material == "B4C":
        absorber.set_density('g/cm3', 2.52)
        absorber.add_element('B', 0.782, 'wo')
        absorber.add_element('C', 0.218, 'wo')
    else: # Hafnium
        absorber.set_density('g/cm3', 13.31)
        absorber.add_element('Hf', 1.0)
    materials_list.append(absorber)
    
    # Control Rod Cladding (Stainless Steel SS304)
    ss304 = openmc.Material(name='SS304_Clad')
    ss304.set_density('g/cm3', 8.00)
    ss304.add_element('Fe', 0.68, 'wo')
    ss304.add_element('Cr', 0.19, 'wo')
    ss304.add_element('Ni', 0.10, 'wo')
    materials_list.append(ss304)
    
    # Borated Water Coolant
    water = openmc.Material(name='Coolant_Water')
    # density variation by temperature (approximate formula)
    # T_avg = 566.5 K -> density is ~0.740 g/cm3. We scale density based on T in Kelvin
    # typical values: 300K -> 1.0, 566.5K -> 0.740, 600K -> 0.65
    t_ref = 566.5
    d_ref = 0.740582
    if temperature != t_ref:
        # Linear approximation for density based on temperature around operating range
        density = max(0.1, d_ref - 0.0015 * (temperature - t_ref))
    else:
        density = d_ref
    density = density * (1.0 - void_fraction)
    water.set_density('g/cm3', density)
    water.temperature = temperature
    
    # Enable S(alpha, beta) thermal scattering
    water.add_s_alpha_beta('c_H_in_H2O')
    
    boron_wt = (soluble_boron * 1e-6)
    water_wt = 1.0 - boron_wt
    m_H2O = 2 * 1.00794 + 15.9994
    water.add_element('H', water_wt * (2.0 * 1.00794) / m_H2O, 'wo')
    water.add_nuclide('O16', water_wt * 15.9994 / m_H2O, 'wo')
    water.add_element('B', boron_wt, 'wo')
    materials_list.append(water)
    
    # Determine the number of standard and poisoned fuel pins to compute volumes for depletion
    if lattice_type == "Square":
        if poison_enabled:
            n_fuel = 244
            n_poison = 20
        else:
            n_fuel = 264
            n_poison = 0
    else: # Hexagonal
        n_fuel = 108
        n_poison = 0

    # Calculate and assign fuel volumes
    pin_volume = math.pi * (fuel_radius ** 2) * active_height
    fuel.volume = n_fuel * pin_volume
    if poison_enabled and n_poison > 0:
        poison_fuel.volume = n_poison * pin_volume

    # Export materials to XML in target directory
    materials = openmc.Materials(materials_list)
    materials.export_to_xml(os.path.join(run_dir, 'materials.xml'))
    
    # 2. Define Geometrical Cylinders
    r_fuel = openmc.ZCylinder(r=fuel_radius)
    r_gap  = openmc.ZCylinder(r=gap_radius)
    r_clad = openmc.ZCylinder(r=clad_radius)
    
    r_gt_in = openmc.ZCylinder(r=gt_inner_radius)
    r_gt_out = openmc.ZCylinder(r=gt_outer_radius)
    
    # Control rod dimensions
    r_abs = openmc.ZCylinder(r=gt_inner_radius * 0.78)
    r_abs_gap = openmc.ZCylinder(r=gt_inner_radius * 0.80)
    r_abs_clad = openmc.ZCylinder(r=gt_inner_radius * 0.88)
    
    # Standard Fuel Rod Universe (F)
    f_c1 = openmc.Cell(fill=fuel, region=-r_fuel)
    f_c2 = openmc.Cell(fill=helium, region=+r_fuel & -r_gap)
    f_c3 = openmc.Cell(fill=clad, region=+r_gap & -r_clad)
    f_c4 = openmc.Cell(fill=water, region=+r_clad)
    F = openmc.Universe(cells=[f_c1, f_c2, f_c3, f_c4])
    
    # Poisoned Fuel Rod Universe (P)
    if poison_enabled:
        p_c1 = openmc.Cell(fill=poison_fuel, region=-r_fuel)
        p_c2 = openmc.Cell(fill=helium, region=+r_fuel & -r_gap)
        p_c3 = openmc.Cell(fill=clad, region=+r_gap & -r_clad)
        p_c4 = openmc.Cell(fill=water, region=+r_clad)
        P = openmc.Universe(cells=[p_c1, p_c2, p_c3, p_c4])
    else:
        P = F
        
    # Empty Guide Tube Universe (G)
    g_c1 = openmc.Cell(fill=water, region=-r_gt_in)
    g_c2 = openmc.Cell(fill=clad, region=+r_gt_in & -r_gt_out)
    g_c3 = openmc.Cell(fill=water, region=+r_gt_out)
    G = openmc.Universe(cells=[g_c1, g_c2, g_c3])
    
    # Guide Tube with Control Rod Inserted Universe (C)
    c_c1 = openmc.Cell(fill=absorber, region=-r_abs)
    c_c2 = openmc.Cell(fill=helium, region=+r_abs & -r_abs_gap)
    c_c3 = openmc.Cell(fill=ss304, region=+r_abs_gap & -r_abs_clad)
    c_c4 = openmc.Cell(fill=water, region=+r_abs_clad & -r_gt_in)
    c_c5 = openmc.Cell(fill=clad, region=+r_gt_in & -r_gt_out)
    c_c6 = openmc.Cell(fill=water, region=+r_gt_out)
    C = openmc.Universe(cells=[c_c1, c_c2, c_c3, c_c4, c_c5, c_c6])
    
    # Determine what goes inside guide tubes depending on Control Rod State
    if control_rod_state == "Fully Inserted":
        X = C
    elif control_rod_state == "Partially Inserted":
        X = G  # Base 2D lattice defaults to withdrawn (G); axial splitting handles insertion in 3D geometry
    else: # Fully Withdrawn
        X = G
        
    # 3. Lattice Engine
    z_half = active_height / 2.0
    
    if lattice_type == "Square":
        # NuScale/SMR-160 layout (17x17)
        offset = (17 * pin_pitch) / 2.0
        lattice = openmc.RectLattice()
        lattice.pitch = (pin_pitch, pin_pitch)
        lattice.lower_left = (-offset, -offset)
        
        lattice.universes = [
            [F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F],
            [F, P, F, P, F, F, P, F, F, F, P, F, F, P, F, P, F],
            [F, F, F, F, F, X, F, F, X, F, F, X, F, F, F, F, F],
            [F, P, F, X, F, F, F, F, F, F, F, F, F, X, F, P, F],
            [F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F],
            [F, F, X, F, F, X, F, F, X, F, F, X, F, F, X, F, F],
            [F, P, F, F, F, F, F, F, F, F, F, F, F, F, F, P, F],
            [F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F],
            [F, F, X, F, F, X, F, F, G, F, F, X, F, F, X, F, F],
            [F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F],
            [F, P, F, F, F, F, F, F, F, F, F, F, F, F, F, P, F],
            [F, F, X, F, F, X, F, F, X, F, F, X, F, F, X, F, F],
            [F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F],
            [F, P, F, X, F, F, F, F, F, F, F, F, F, X, F, P, F],
            [F, F, F, F, F, X, F, F, X, F, F, X, F, F, F, F, F],
            [F, P, F, P, F, F, P, F, F, F, P, F, F, P, F, P, F],
            [F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F]
        ]
        lattice.outer = openmc.Universe(cells=[openmc.Cell(fill=water)])
        
        boundary_cond = "vacuum" if boundary_type.lower() == "vacuum" else "reflective"
        min_x = openmc.XPlane(x0=-offset, boundary_type=boundary_cond)
        max_x = openmc.XPlane(x0=offset, boundary_type=boundary_cond)
        min_y = openmc.YPlane(y0=-offset, boundary_type=boundary_cond)
        max_y = openmc.YPlane(y0=offset, boundary_type=boundary_cond)
        region_box = +min_x & -max_x & +min_y & -max_y
        
    else: # Hexagonal
        # CAREM-25 layout (127-pin)
        offset = 6.5 * pin_pitch
        edge_len = (offset * 2) / math.sqrt(3)
        boundary_cond = "vacuum" if boundary_type.lower() == "vacuum" else "reflective"
        hex_prism = openmc.model.HexagonalPrism(orientation='y', edge_length=edge_len, boundary_type=boundary_cond)
        region_box = -hex_prism
        
        # rings from outside-in (ring7 to ring1)
        ring7 = [F] * 36
        ring6 = [X, F, F, F, F] * 6
        ring5 = [X, F, F, F] * 6
        ring4 = [X, F, F] * 6
        ring3 = [F] * 12
        ring2 = [F] * 6
        ring1 = [G]
        
        lattice = openmc.HexLattice()
        lattice.center = (0.0, 0.0)
        lattice.pitch = [pin_pitch]
        lattice.universes = [ring7, ring6, ring5, ring4, ring3, ring2, ring1]
        lattice.outer = openmc.Universe(cells=[openmc.Cell(fill=water)])
        
    # Axial boundaries and control rod insertion representation (3D geometry)
    min_z = openmc.ZPlane(z0=-z_half, boundary_type='reflective')
    max_z = openmc.ZPlane(z0=z_half, boundary_type='reflective')
    
    # If control rods are partially inserted, we define two axial cells:
    # Top half has control rods (C), bottom half has empty guide tubes (G).
    if control_rod_state == "Partially Inserted":
        # We split the lattice axially by defining an axial plane in the middle
        mid_z = openmc.ZPlane(z0=0.0)
        
        # Build two lattices: top lattice (with C) and bottom lattice (with G)
        top_X = C
        bottom_X = G
        
        # Top Lattice definition
        if lattice_type == "Square":
            top_lattice = openmc.RectLattice()
            top_lattice.pitch = (pin_pitch, pin_pitch)
            top_lattice.lower_left = (-offset, -offset)
            top_lattice.universes = [
                [F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F],
                [F, P, F, P, F, F, P, F, F, F, P, F, F, P, F, P, F],
                [F, F, F, F, F, top_X, F, F, top_X, F, F, top_X, F, F, F, F, F],
                [F, P, F, top_X, F, F, F, F, F, F, F, F, F, top_X, F, P, F],
                [F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F],
                [F, F, top_X, F, F, top_X, F, F, top_X, F, F, top_X, F, F, top_X, F, F],
                [F, P, F, F, F, F, F, F, F, F, F, F, F, F, F, P, F],
                [F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F],
                [F, F, top_X, F, F, top_X, F, F, G, F, F, top_X, F, F, top_X, F, F],
                [F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F],
                [F, P, F, F, F, F, F, F, F, F, F, F, F, F, F, P, F],
                [F, F, top_X, F, F, top_X, F, F, top_X, F, F, top_X, F, F, top_X, F, F],
                [F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F],
                [F, P, F, top_X, F, F, F, F, F, F, F, F, F, top_X, F, P, F],
                [F, F, F, F, F, top_X, F, F, top_X, F, F, top_X, F, F, F, F, F],
                [F, P, F, P, F, F, P, F, F, F, P, F, F, P, F, P, F],
                [F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F]
            ]
            top_lattice.outer = openmc.Universe(cells=[openmc.Cell(fill=water)])
            
            bottom_lattice = openmc.RectLattice()
            bottom_lattice.pitch = (pin_pitch, pin_pitch)
            bottom_lattice.lower_left = (-offset, -offset)
            bottom_lattice.universes = [
                [F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F],
                [F, P, F, P, F, F, P, F, F, F, P, F, F, P, F, P, F],
                [F, F, F, F, F, bottom_X, F, F, bottom_X, F, F, bottom_X, F, F, F, F, F],
                [F, P, F, bottom_X, F, F, F, F, F, F, F, F, F, bottom_X, F, P, F],
                [F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F],
                [F, F, bottom_X, F, F, bottom_X, F, F, bottom_X, F, F, bottom_X, F, F, bottom_X, F, F],
                [F, P, F, F, F, F, F, F, F, F, F, F, F, F, F, P, F],
                [F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F],
                [F, F, bottom_X, F, F, bottom_X, F, F, G, F, F, bottom_X, F, F, bottom_X, F, F],
                [F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F],
                [F, P, F, F, F, F, F, F, F, F, F, F, F, F, F, P, F],
                [F, F, bottom_X, F, F, bottom_X, F, F, bottom_X, F, F, bottom_X, F, F, bottom_X, F, F],
                [F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F],
                [F, P, F, bottom_X, F, F, F, F, F, F, F, F, F, bottom_X, F, P, F],
                [F, F, F, F, F, bottom_X, F, F, bottom_X, F, F, bottom_X, F, F, F, F, F],
                [F, P, F, P, F, F, P, F, F, F, P, F, F, P, F, P, F],
                [F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F]
            ]
            bottom_lattice.outer = openmc.Universe(cells=[openmc.Cell(fill=water)])
        else:
            top_lattice = openmc.HexLattice()
            top_lattice.center = (0.0, 0.0)
            top_lattice.pitch = [pin_pitch]
            top_lattice.universes = [ring7, [top_X, F, F, F, F] * 6, [top_X, F, F, F] * 6, [top_X, F, F] * 6, ring3, ring2, ring1]
            top_lattice.outer = openmc.Universe(cells=[openmc.Cell(fill=water)])
            
            bottom_lattice = openmc.HexLattice()
            bottom_lattice.center = (0.0, 0.0)
            bottom_lattice.pitch = [pin_pitch]
            bottom_lattice.universes = [ring7, [bottom_X, F, F, F, F] * 6, [bottom_X, F, F, F] * 6, [bottom_X, F, F] * 6, ring3, ring2, ring1]
            bottom_lattice.outer = openmc.Universe(cells=[openmc.Cell(fill=water)])
            
        top_cell = openmc.Cell(fill=top_lattice, region=region_box & +mid_z & -max_z)
        bottom_cell = openmc.Cell(fill=bottom_lattice, region=region_box & +min_z & -mid_z)
        geometry = openmc.Geometry([top_cell, bottom_cell])
    else:
        # Fully inserted or withdrawn uses single lattice
        final_region = region_box & +min_z & -max_z
        main_cell = openmc.Cell(fill=lattice, region=final_region)
        geometry = openmc.Geometry([main_cell])
        
    geometry.export_to_xml(os.path.join(run_dir, 'geometry.xml'))
    
    # 4. Settings configuration
    settings = openmc.Settings()
    settings.batches = batches
    settings.inactive = inactive_batches
    settings.particles = particles
    settings.temperature = {'method': 'interpolation'}
    
    if kinetics_enabled:
        settings.ifp_n_generation = min(10, inactive_batches)
    
    # Shannon entropy mesh for source convergence checks
    entropy_mesh = openmc.RegularMesh()
    if lattice_type == "Square":
        entropy_mesh.dimension = [17, 17, 1]
        entropy_mesh.lower_left = [-offset, -offset, -z_half]
        entropy_mesh.upper_right = [offset, offset, z_half]
    else:
        # hex layout
        entropy_mesh.dimension = [15, 15, 1]
        entropy_mesh.lower_left = [-offset, -offset, -z_half]
        entropy_mesh.upper_right = [offset, offset, z_half]
    settings.entropy_mesh = entropy_mesh
    
    # Spatial source distribution
    spatial_dist = openmc.stats.Box((-offset, -offset, -z_half), (offset, offset, z_half))
    settings.source = openmc.IndependentSource(space=spatial_dist, constraints={'fissionable': True})
    
    settings.run_mode = 'eigenvalue'
    settings.export_to_xml(os.path.join(run_dir, 'settings.xml'))
    
    # 5. Tallies Configuration
    tallies_list = []
    
    # Global Reaction Rates Tally
    rx_tally = openmc.Tally(name='Global_Reactions')
    # Filter by materials to capture global reactions
    rx_tally.scores = ['fission', 'absorption', '(n,2n)', 'scatter']
    tallies_list.append(rx_tally)
    
    # Fuel cells list for filtering
    fuel_cells = [f_c1]
    if poison_enabled:
        fuel_cells.append(p_c1)

    # 3. Radial Pin Power Tally (Mesh + Cell Filter)
    grid_res = 17 if lattice_type == "Square" else 15
    pin_mesh = openmc.RegularMesh()
    pin_mesh.dimension = [grid_res, grid_res]
    pin_mesh.lower_left = [-offset, -offset]
    pin_mesh.upper_right = [offset, offset]
    
    tally_pin = openmc.Tally(name="radial_pin_power")
    tally_pin.filters = [
        openmc.MeshFilter(pin_mesh),
        openmc.CellFilter(fuel_cells)
    ]
    tally_pin.scores = ["fission"]
    tallies_list.append(tally_pin)
    
    # 4. Axial Power Distribution Tally (Mesh Filter)
    axial_mesh = openmc.RegularMesh()
    axial_mesh.dimension = [1, 1, 200]
    axial_mesh.lower_left = [-offset, -offset, -z_half]
    axial_mesh.upper_right = [offset, offset, z_half]
    
    tally_axial = openmc.Tally(name="axial_power")
    tally_axial.filters = [
        openmc.MeshFilter(axial_mesh)
    ]
    tally_axial.scores = ["fission"]
    tallies_list.append(tally_axial)
    
    # 5. Neutron Flux Spectrum Tally (Logspace Energy Filter + Cell Filter)
    energy_bins = np.logspace(-5, 7.3, 501)
    tally_spec = openmc.Tally(name="flux_spectrum")
    tally_spec.filters = [
        openmc.CellFilter(fuel_cells),
        openmc.EnergyFilter(energy_bins)
    ]
    tally_spec.scores = ["flux"]
    tallies_list.append(tally_spec)
    
    # Fine Spatial Analysis Tally (Flux/Fission/Absorption detailed heatmaps)
    fine_mesh = openmc.RegularMesh()
    fine_mesh.dimension = [170, 170]
    fine_mesh.lower_left = [-offset * 1.05, -offset * 1.05]
    fine_mesh.upper_right = [offset * 1.05, offset * 1.05]
    
    fine_tally = openmc.Tally(name='Fine_Mesh_Tally')
    fine_tally.filters = [openmc.MeshFilter(fine_mesh)]
    fine_tally.scores = ['flux', 'fission', 'absorption']
    tallies_list.append(fine_tally)
    
    # Group-wise Flux Mesh Tallies (Thermal, Epithermal, Fast)
    energy_filter = openmc.EnergyFilter([0.0, 0.625, 1.0e5, 2.0e7])
    
    group_tally = openmc.Tally(name='Group_Flux_Tally')
    group_tally.filters = [openmc.MeshFilter(fine_mesh), energy_filter]
    group_tally.scores = ['flux']
    tallies_list.append(group_tally)
    
    # Spectral Index Fission rates tally
    spec_fission_tally = openmc.Tally(name='Fission_Energy_Tally')
    spec_fission_tally.filters = [energy_filter]
    spec_fission_tally.scores = ['fission']
    tallies_list.append(spec_fission_tally)
    
    # Cladding DPA Tally if shielding enabled
    if shielding_enabled:
        dpa_tally = openmc.Tally(name='Clad_DPA')
        dpa_tally.filters = [openmc.MaterialFilter(clad)]
        dpa_tally.scores = ['damage-energy']
        tallies_list.append(dpa_tally)
        
    # 3D Power & Flux Tally if enabled
    if flux_3d_enabled:
        mesh_3d = openmc.RegularMesh()
        mesh_3d.dimension = [grid_res, grid_res, 10]
        mesh_3d.lower_left = [-offset, -offset, -z_half]
        mesh_3d.upper_right = [offset, offset, z_half]
        
        tally_3d = openmc.Tally(name='3D_Flux_Power')
        tally_3d.filters = [openmc.MeshFilter(mesh_3d)]
        tally_3d.scores = ['flux', 'kappa-fission']
        tallies_list.append(tally_3d)
        
    # Leakage tally if vacuum boundaries
    if boundary_type.lower() == "vacuum":
        leakage_tally = openmc.Tally(name='External_Leakage')
        leakage_tally.filters = [openmc.SurfaceFilter([min_x, max_x, min_y, max_y])]
        leakage_tally.scores = ['current']
        tallies_list.append(leakage_tally)
        

    
    # Export tallies
    tallies = openmc.Tallies(tallies_list)
    tallies.export_to_xml(os.path.join(run_dir, 'tallies.xml'))
    
    print("XML inputs generated successfully.")
    return offset
