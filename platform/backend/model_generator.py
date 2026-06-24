import openmc
import openmc.model
import math
import os

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
    clad_material="Zircaloy4",     # "Zircaloy4", "M5", or "Q12"
    poison_enabled=False,          # Enable Burnable Poison
    poison_fraction=2.0,           # Gd2O3 concentration weight % (e.g. 2%)
    control_rod_state="Fully Withdrawn", # "Fully Withdrawn", "Fully Inserted", "Partially Inserted"
    control_rod_material="Ag-In-Cd",     # "Ag-In-Cd", "B4C", "Hafnium"
    particles=10000,               # Number of simulation particles
    batches=50,                    # Number of batches
    inactive_batches=10,           # Number of inactive batches
    temperature=566.5              # Coolant temperature in K
):
    print(f"Generating SMR Model in {run_dir}...")
    os.makedirs(run_dir, exist_ok=True)
    
    # Reset auto IDs to avoid conflicts across runs
    openmc.reset_auto_ids()
    
    # 1. Define Materials
    materials_list = []
    enrichment_fraction = enrichment / 100.0
    
    # Standard UO2 Fuel Material
    fuel = openmc.Material(name='Standard_UO2')
    fuel.set_density('g/cm3', 10.42)
    m_u = enrichment_fraction * 235.043 + (1.0 - enrichment_fraction) * 238.0507
    m_o2 = 2.0 * 15.999
    m_uo2 = m_u + m_o2
    fuel.add_nuclide('U235', enrichment_fraction * (m_u / m_uo2), 'wo')
    fuel.add_nuclide('U238', (1.0 - enrichment_fraction) * (m_u / m_uo2), 'wo')
    fuel.add_nuclide('O16', m_o2 / m_uo2, 'wo')
    materials_list.append(fuel)
    
    # Poisoned UO2-Gd2O3 Fuel Material if enabled
    if poison_enabled:
        gd2o3_frac = poison_fraction / 100.0
        uo2_frac = 1.0 - gd2o3_frac
        
        poison_fuel = openmc.Material(name='Poisoned_UO2_Gd2O3')
        poison_fuel.set_density('g/cm3', 10.1) # typical mixed density
        # Add UO2 components scaled by uo2_frac
        poison_fuel.add_nuclide('U235', enrichment_fraction * (m_u / m_uo2) * uo2_frac, 'wo')
        poison_fuel.add_nuclide('U238', (1.0 - enrichment_fraction) * (m_u / m_uo2) * uo2_frac, 'wo')
        poison_fuel.add_nuclide('O16', (m_o2 / m_uo2) * uo2_frac, 'wo')
        # Add Gd2O3 components
        # Molar mass of Gd2O3: Gd is ~157.25, O is ~16.0 -> 157.25*2 + 16.0*3 = 362.5
        m_gd2 = 2 * 157.25
        m_o3 = 3 * 15.999
        m_gd2o3 = m_gd2 + m_o3
        poison_fuel.add_element('Gd', (m_gd2 / m_gd2o3) * gd2o3_frac, 'wo')
        # Combined oxygen fraction
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
    water.set_density('g/cm3', density)
    water.temperature = temperature
    
    boron_wt = (soluble_boron * 1e-6)
    water_wt = 1.0 - boron_wt
    m_H2O = 2 * 1.00794 + 15.9994
    water.add_element('H', water_wt * (2.0 * 1.00794) / m_H2O, 'wo')
    water.add_nuclide('O16', water_wt * 15.9994 / m_H2O, 'wo')
    water.add_element('B', boron_wt, 'wo')
    materials_list.append(water)
    
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
    # For a fully withdrawn state, guide tubes are empty (water filled).
    # For a fully inserted state, guide tubes are filled with control rod.
    # For partially inserted, we can model it via Z axial coordinates.
    # But since we support 2D assembly/reflective geometry, we can set the lattice universe.
    if control_rod_state == "Fully Inserted":
        X = C
    elif control_rod_state == "Partially Inserted":
        # In 2D, partially inserted can be approximated by inserting control rods in half the tubes,
        # or we will build a 3D geometry where Z is split into two regions:
        # bottom region is water-filled guide tubes, top region has control rods inserted.
        X = C
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
        
        # Symmetrical distribution of guide tubes and instrumentation tubes
        # X: Control Rod or Empty Guide Tube (based on rod state)
        # P: Burnable poison rods
        # G: Always empty guide tube / central instrument
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
        
        min_x = openmc.XPlane(x0=-offset, boundary_type='reflective')
        max_x = openmc.XPlane(x0=offset, boundary_type='reflective')
        min_y = openmc.YPlane(y0=-offset, boundary_type='reflective')
        max_y = openmc.YPlane(y0=offset, boundary_type='reflective')
        region_box = +min_x & -max_x & +min_y & -max_y
        
    else: # Hexagonal
        # CAREM-25 layout (127-pin)
        offset = 6.5 * pin_pitch
        edge_len = (offset * 2) / math.sqrt(3)
        hex_prism = openmc.model.HexagonalPrism(orientation='y', edge_length=edge_len, boundary_type='reflective')
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
        # Top Lattice: Control Rods (C) inserted in X
        top_X = C
        # Bottom Lattice: Control Rods withdrawn (G) in X
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
    
    # Pin-by-pin Power & Reactions Mesh Tally
    # In square lattice, we tally on 17x17 pin mesh
    # In hexagonal lattice, we can also map on a regular mesh or use a mesh filter
    grid_res = 17 if lattice_type == "Square" else 15
    pin_mesh = openmc.RegularMesh()
    pin_mesh.dimension = [grid_res, grid_res]
    pin_mesh.lower_left = [-offset, -offset]
    pin_mesh.upper_right = [offset, offset]
    
    pin_tally = openmc.Tally(name='Pin_Tally')
    pin_tally.filters = [openmc.MeshFilter(pin_mesh)]
    pin_tally.scores = ['kappa-fission'] # actual power heat deposition
    tallies_list.append(pin_tally)
    
    # Fine Spatial Analysis Tally (Flux/Fission/Absorption detailed heatmaps)
    fine_mesh = openmc.RegularMesh()
    fine_mesh.dimension = [170, 170]
    fine_mesh.lower_left = [-offset * 1.05, -offset * 1.05]
    fine_mesh.upper_right = [offset * 1.05, offset * 1.05]
    
    fine_tally = openmc.Tally(name='Fine_Mesh_Tally')
    fine_tally.filters = [openmc.MeshFilter(fine_mesh)]
    fine_tally.scores = ['flux', 'fission', 'absorption']
    tallies_list.append(fine_tally)
    
    # Group-wise Flux Mesh Tallies (Thermal, Fast, Group-wise)
    # Energy bins: Thermal (<0.625 eV), Epithermal (0.625 eV to 100 keV), Fast (>100 keV)
    energy_filter = openmc.EnergyFilter([0.0, 0.625, 1.0e5, 2.0e7]) # in eV
    
    group_tally = openmc.Tally(name='Group_Flux_Tally')
    group_tally.filters = [openmc.MeshFilter(fine_mesh), energy_filter]
    group_tally.scores = ['flux']
    tallies_list.append(group_tally)
    
    # Fine Energy Spectrum Tally (500 logarithmic bins)
    import numpy as np
    energy_bins = np.logspace(-5, 7.3, 500)
    # OpenMC expects custom list for energy bins
    e_filter = openmc.EnergyFilter(energy_bins)
    
    spec_tally = openmc.Tally(name='Energy_Spectrum_Tally')
    spec_tally.filters = [e_filter]
    spec_tally.scores = ['flux']
    tallies_list.append(spec_tally)
    
    # Export tallies
    tallies = openmc.Tallies(tallies_list)
    tallies.export_to_xml(os.path.join(run_dir, 'tallies.xml'))
    
    print("XML inputs generated successfully.")
    return offset
