#  OpenMC SMR (Small Modular Reactor) Assembly Modeling and Analysis

This repository contains high-fidelity digital twins and neutronics simulation models for four prominent Small Modular Reactor (SMR) fuel assembly designs developed using the **OpenMC** Monte Carlo particle transport code.

---

##   Overview 
The core objective of this project is to analyze and map different industrial SMR architectures (including varied lattice geometries, active lengths, and burnable absorber configurations). 

By reverse-engineering these specific reactor vendor designs, our ultimate goal is to engineer an **Evrensel (Generic) iPWR Model Framework**. This framework will serve as a parametric data-generation engine to train Machine Learning models (such as XGBoost, LightGBM, and Deep Neural Networks). Once trained, the ML surrogate models will be integrated into a web-based user interface, enabling users to input custom reactor features and predict complex safety and criticality outputs in milliseconds.

---

## Modelled Reactor Typologies & Geometries

To encompass diverse engineering solutions across the nuclear industry, the following four reactor cores were developed from scratch:

### 1. NuScale (NuFuel HTP2™)
A simplified, shortened iteration of traditional commercial PWR assemblies.
* **Lattice Configuration:** $17 \times 17$ Square Lattice.
* **Pin Array:** 264 Fuel Rods, 24 Guide Thimbles, 1 Central Instrumentation Tube.
* **Dimensions:** Rod Pitch = 0.496 inches (1.25984 cm). Active fuel length = 78.74 inches (200.0 cm), roughly half the size of a standard full-scale PWR.
* **Spacer Grids:** Supported by 5 grids (1 bottom HMP™ Alloy 718 and 4 upper HTP™ Zircaloy-4 grids).

### 2. CAREM-25 (Argentine Design)
An innovative, non-traditional architecture that breaks the square matrix paradigm in favor of a tight hexagonal pattern.
* **Lattice Configuration:** Hexagonal Lattice (7 concentric rings).
* **Pin Array:** 127 total positions (108 Fuel Rods, 18 Guide Thimbles, 1 Central Instrumentation Tube).
* **Dimensions:** Pin Pitch = 1.38 cm, Cladding Outer Diameter = 9 mm, Active fuel length = 1.4 meters.
* **Implementation:** Programmed dynamically utilizing OpenMC's `HexLattice` abstractions.

### 3. B&W mPower
A state-of-the-art **Soluble Boron Free (SBF)** design that eliminates chemical boron from the coolant loop to suppress corrosion.
* **Lattice Configuration:** $17 \times 17$ Square Lattice.
* **Dimensions:** Half-height variant with an active fuel stack length of 241.3 cm.
* **Core Control:** Since the coolant is pure water, excessive early-cycle reactivity is mitigated by injecting **Burnable Poison (Gadolinia - $Gd_2O_3$)** directly into 24 designated fuel pellets.

### 4. SMR-160 (Holtec / Framatome GAIA)
A robust SMR design that chooses not to shorten its fuel stack, utilizing full-scale commercial utility dimensions.
* **Lattice Configuration:** $17 \times 17$ Square Lattice (GAIA Grid platform).
* **Dimensions:** Full-height configuration with an active length of 144 inches (~3.65 meters).
* **Core Control:** Built with advanced $Q12^{™}$ structural alloy guides housing **HARMONI (Silver-Indium-Cadmium / AIC)** physical control rod clusters.

---

##  Parametric Interface Features (ML Input Variables)
In our generic iPWR framework, these design aspects are extracted into independent, dynamic input parameters (features) for simulation loops and ML training datasets:

* **Macro Geometry:**
  * `lattice_type`: Square ($17 \times 17$) vs. Hexagonal ($127\text{-pin}$).
  * `active_fuel_length`: Shortened (~200 cm) vs. Full-length (~365 cm).
  * `pin_pitch`: Center-to-center pitch distance between neighboring fuel pins.
* **Micro Geometry:**
  * `pellet_radius`, `clad_inner_radius`, and `clad_outer_radius` (Cladding thickness).
  * `guide_tube_radius`: Variable guide tube dimensions matching advanced alloys.
* **Materials & Chemistry:**
  * `u235_enrichment`: Uranium enrichment fractions (typically varying from $2\%$ to $5\%$).
  * `boron_ppm`: Dissolved chemical boron concentration in the coolant loop ($0$ to $2000\text{ ppm}$).
  * `cladding_alloy`: Zircaloy-4, Alloy M5®, or $Q12^{™}$ options.
  * `burnable_poison_fraction`: Concentration of $Gd_2O_3$ integrated into the fuel matrix.
* **Control States:**
  * `control_rods`: Binary state reflecting whether absorber clusters are **Inserted** or **Withdrawn**.

---

##  Neutronics Analysis & Outputs (ML Target Variables)
Executing these OpenMC simulation notebooks yields a rich dataset of statistical and spatial outputs, which act as labels/targets for our predictive regression models:

* **Criticality ($k_{inf}$):** Infinite neutron multiplication factor. Determines if the core is subcritical ($<1$), critical ($=1$), or supercritical ($>1$).
* **Hot Channel Factor (Power Peaking):** The ratio of peak pin power to average pin power. Crucial for thermal-hydraulic margin monitoring (Industry standard limit is typically $<1.5$).
* **High-Resolution Spatial Maps ($170 \times 170$ Mesh):**
  * `Neutron Flux Distribution` (Spatial neutron density profiles).
  * `Fission Density Map` (Visualizing heat production channels and burnable poison "black holes").
  * `Absorption Boundary Map` (Capturing parasitic captures in guide tubes and boron shields).
* **Pin-by-Pin Power Matrix:** Discrete $17 \times 17$ array tracking the localized thermal output of every individual rod.
* **Energy Spectrum Distribution:** A 500-group log-log spectrum mapping neutrons from birth energy (Fast/MeV region) down to moderation energy (Thermal/eV region).
* **Shannon Entropy Convergence:** Statistical quality assurance assessing spatial source distribution stability across generations.

---

##  Neutronics Simulation Results Summary

The table below summarizes the key neutronics performance metrics and reaction rates extracted from the simulation notebooks of each independent SMR assembly:

| Reactor Model | K-Infinite ($k_{inf}$) | Hot Channel Factor | $(n, 2n)$ Multiplication Rate | $(n, \gamma)$ Radiative Capture Rate | Control Rod State |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **NuScale** | *Analyzed* | 1.097 | $1.49038 \times 10^{-3}$ | $3.91158 \times 10^{-1}$ | Withdrawn |
| **CAREM-25** | $1.39212 \pm 0.00142$ | 1.997  | $9.86037 \times 10^{-4}$ | $4.29779 \times 10^{-1}$ | Withdrawn |
| **B&W mPower** | $1.29472 \pm 0.00150$ | 1.244 | $1.41355 \times 10^{-3}$ | $4.71251 \times 10^{-1}$ | SBF (No Boron) |
| **SMR-160** | $0.96871 \pm 0.00130$  | 1.264 | $1.42811 \times 10^{-3}$ | $5.76840 \times 10^{-1}$ | **Inserted** |

### Technical Insights from the Simulation Data:
1. **Criticality Suppression:** The SMR-160 model drops significantly below critical limits ($k_{inf} = 0.96871$) because it was tested with **HARMONI Control Rods Fully Inserted**. This high absorption rate is also reflected in its elevated $(n, \gamma)$ capture rate ($0.57684$).
2. **Power Peaking Anomaly:** The CAREM-25 design exhibits an unusually high Hot Channel Factor ($1.997$), crossing the conservative $1.5$ safety limit. This highlights an aggressive power gradient in the un-optimized hexagonal assembly layout, showcasing the diagnostic power of our OpenMC setup.
3. **Poison Signatures:** In the B&W mPower model, the spatial fission density map clearly captures the structural presence of the $Gd_2O_3$ poison pins as localized flux depressions, verifying the accuracy of our material mapping.

---
