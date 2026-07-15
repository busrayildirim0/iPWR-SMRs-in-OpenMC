//===== File: include/Materials.hh =====
// Multi-reactor material builder. All parameters come from ReactorConfig (the
// single source of truth); a preset/override must be applied BEFORE
// /run/initialize. Material objects are built lazily in Construct(), called from
// DetectorConstruction::Construct(). Built variants: UO2 fuel, optional
// UO2-Gd2O3 poison fuel, clad (Zircaloy-4/M5/Q12), gap helium, borated water,
// control-rod absorber (Ag-In-Cd/B4C/Hf), SS304 rod clad, air.
//----------------------------------------------------------------------------
#ifndef MATERIALS_HH
#define MATERIALS_HH

#include "G4Material.hh"
#include "globals.hh"

class Materials {
public:
    static Materials* GetInstance();

    Materials(const Materials&) = delete;
    Materials& operator=(const Materials&) = delete;

    void Construct();

    G4Material* GetUO2()        const { return fUO2; }
    G4Material* GetPoisonFuel() const { return fPoisonFuel ? fPoisonFuel : fUO2; }
    G4Material* GetHelium()     const { return fHelium; }
    G4Material* GetClad()       const { return fClad; }
    G4Material* GetZircaloy4()  const { return fClad; }
    G4Material* GetWater()      const { return fWater; }
    G4Material* GetAir()        const { return fAir; }
    G4Material* GetAbsorber()   const { return fAbsorber; }
    G4Material* GetSS304()      const { return fSS304; }

    G4double GetBoronPPM()             const;
    G4double GetEnrichment()           const;
    G4double GetU235AtomFraction()     const { return fU235AtomFraction; }
    G4double GetFuelDensity()          const;
    G4double GetFuelTemperature()      const;
    G4double GetModeratorTemperature() const;
    G4double GetModeratorDensity()     const;

private:
    Materials() = default;
    ~Materials() = default;

    void DefineMaterials();

    G4Material* fUO2        = nullptr;
    G4Material* fPoisonFuel = nullptr;
    G4Material* fHelium     = nullptr;
    G4Material* fClad       = nullptr;
    G4Material* fWater      = nullptr;
    G4Material* fAir        = nullptr;
    G4Material* fAbsorber   = nullptr;
    G4Material* fSS304      = nullptr;

    G4double fU235AtomFraction = 0.0;
    G4bool   fBuilt = false;

    static Materials* fInstance;
};

#endif
