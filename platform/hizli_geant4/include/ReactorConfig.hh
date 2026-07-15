//===== File: include/ReactorConfig.hh =====
// Central, runtime-selectable reactor configuration for the multi-reactor
// SMR study (Geant4 counterpart of the OpenMC iPWR-SMRs parametric model).
//
// One process-wide singleton holds every geometry / material / option needed to
// build any of the supported reactors. A preset fills all fields for a named
// reactor; a /smr/reactor/ messenger lets a macro pick the preset and override
// individual parameters. Materials and DetectorConstruction read from here.
//
// Supported presets: BEAVRS (default), NuScale, mPower, SMR160, CAREM25.
// CAREM25 is a hexagonal 127-pin lattice; the others are square 17x17.
//----------------------------------------------------------------------------
#ifndef REACTOR_CONFIG_HH
#define REACTOR_CONFIG_HH

#include "globals.hh"

#include <array>
#include <string>
#include <vector>

class G4GenericMessenger;

class ReactorConfig {
public:
    enum class Lattice { Square, Hex };

    static ReactorConfig& Get();

    void SelectPreset(const G4String& name);

    const G4String& Name()    const { return fName; }
    Lattice LatticeType()     const { return fLattice; }
    G4bool  IsHex()           const { return fLattice == Lattice::Hex; }
    G4int   NPins()           const { return fNPins; }

    G4double PinPitch()       const { return fPinPitch; }
    G4double FuelRadius()     const { return fFuelR; }
    G4double GapOuterR()      const { return fGapR; }
    G4double CladOuterR()     const { return fCladR; }
    G4double GTInnerR()       const { return fGTInnerR; }
    G4double GTOuterR()       const { return fGTOuterR; }
    G4double ActiveHeight()   const { return fActiveHeight; }
    G4double AssemblyHalfXY() const { 
        if (fLattice == Lattice::Hex) return 6.5 * fPinPitch;
        return fNPins * fPinPitch / 2.0; 
    }
    G4double HexApothem()     const { return fHexApothem; }

    G4double AbsR()           const { return fGTInnerR * 0.78; }
    G4double AbsGapR()        const { return fGTInnerR * 0.80; }
    G4double AbsCladR()       const { return fGTInnerR * 0.88; }

    G4double Enrichment()        const { return fEnrichment; }
    G4double BoronPPM()          const { return fBoronPPM; }
    G4double FuelDensity()       const { return fFuelDensity; }
    G4double FuelTemperature()   const { return fFuelTemp; }
    G4double ModeratorDensity()  const { return fModDensity; }
    G4double ModeratorTemperature() const { return fModTemp; }
    G4double HeDensity()         const { return fHeDensity; }
    const G4String& CladMaterial() const { return fCladMat; }

    G4bool   PoisonEnabled()     const { return fPoisonEnabled; }
    G4double PoisonFraction()    const { return fPoisonFraction; }
    G4double PoisonFuelDensity() const { return fPoisonFuelDensity; }

    G4bool   RodsInserted()      const { return fRodsInserted; }
    const G4String& ControlRodMaterial() const { return fRodMat; }
    const G4String& FuelMaterial() const { return fFuelMat; }

    const std::vector<std::string>& SquareMap() const { return fSquareMap; }

    struct Cell {
        G4double x;
        G4double y;
        char     type;
    };

    std::vector<Cell> BuildCells() const;

private:
    ReactorConfig();
    void DefineCommands();
    void SetDerived();

    G4GenericMessenger* fMessenger = nullptr;

    G4String fName    = "BEAVRS";
    Lattice  fLattice = Lattice::Square;
    G4int    fNPins   = 17;

    G4double fPinPitch, fFuelR, fGapR, fCladR, fGTInnerR, fGTOuterR;
    G4double fActiveHeight, fAssemblyHalfXY = 0.0, fHexApothem = 0.0;
    G4double fAbsR = 0.0, fAbsGapR = 0.0, fAbsCladR = 0.0;

    G4double fEnrichment, fBoronPPM, fFuelDensity, fFuelTemp, fModDensity, fModTemp;
    G4double fHeDensity = 0.0;
    G4String fCladMat = "Zircaloy4";

    G4bool   fPoisonEnabled = false;
    G4double fPoisonFraction = 0.0;
    G4double fPoisonFuelDensity = 0.0;

    G4bool   fRodsInserted = false;
    G4String fRodMat = "AIC";
    G4String fFuelMat = "UO2";

    std::vector<std::string> fSquareMap;

    static ReactorConfig* fInstance;
};

#endif
