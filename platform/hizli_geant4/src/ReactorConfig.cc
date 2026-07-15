//===== File: src/ReactorConfig.cc =====
// Reactor presets + /smr/reactor/ messenger.
//----------------------------------------------------------------------------
#include "ReactorConfig.hh"

#include "G4GenericMessenger.hh"
#include "G4SystemOfUnits.hh"
#include "G4Threading.hh"
#include "G4ApplicationState.hh"

#include <cmath>

ReactorConfig* ReactorConfig::fInstance = nullptr;

ReactorConfig& ReactorConfig::Get() {
    if (!fInstance) fInstance = new ReactorConfig();
    return *fInstance;
}

ReactorConfig::ReactorConfig() {
    SelectPreset("BEAVRS");
    DefineCommands();
}

namespace {

const std::vector<std::string> kMapBEAVRS = {
    "FFFFFFFFFFFFFFFFF","FFFFFFFFFFFFFFFFF","FFFFFGFFGFFGFFFFF",
    "FFFGFFFFFFFFFGFFF","FFFFFFFFFFFFFFFFF","FFGFFGFFGFFGFFGFF",
    "FFFFFFFFFFFFFFFFF","FFFFFFFFFFFFFFFFF","FFGFFGFFIFFGFFGFF",
    "FFFFFFFFFFFFFFFFF","FFFFFFFFFFFFFFFFF","FFGFFGFFGFFGFFGFF",
    "FFFFFFFFFFFFFFFFF","FFFGFFFFFFFFFGFFF","FFFFFGFFGFFGFFFFF",
    "FFFFFFFFFFFFFFFFF","FFFFFFFFFFFFFFFFF"};

const std::vector<std::string> kMapNuScale = {
    "FFFFFFFFFFFFFFFFF","FFFFFFFFFFFFFFFFF","FFFFFGFFGFFGFFFFF",
    "FFFGFFFFFFFFFGFFF","FFFFFFFFFFFFFFFFF","FFGFFGFFGFFGFFGFF",
    "FFFFFFFFFFFFFFFFF","FFFFFFFFFFFFFFFFF","FFGFFGFFGFFGFFGFF",
    "FFFFFFFFFFFFFFFFF","FFFFFFFFFFFFFFFFF","FFGFFGFFGFFGFFGFF",
    "FFFFFFFFFFFFFFFFF","FFFGFFFFFFFFFGFFF","FFFFFGFFGFFGFFFFF",
    "FFFFFFFFFFFFFFFFF","FFFFFFFFFFFFFFFFF"};

const std::vector<std::string> kMapMPower = {
    "FFFFFFFFFFFFFFFFF","FPFPFFPFFFPFFPFPF","FFFFFGFFGFFGFFFFF",
    "FPFGFFFFFFFFFGFPF","FFFFFFFFFFFFFFFFF","FFGFFGFFGFFGFFGFF",
    "FPFFFFFFFFFFFFFPF","FFFFFFFFFFFFFFFFF","FFGFFGFFGFFGFFGFF",
    "FFFFFFFFFFFFFFFFF","FPFFFFFFFFFFFFFPF","FFGFFGFFGFFGFFGFF",
    "FFFFFFFFFFFFFFFFF","FPFGFFFFFFFFFGFPF","FFFFFGFFGFFGFFFFF",
    "FPFPFFPFFFPFFPFPF","FFFFFFFFFFFFFFFFF"};

const std::vector<std::string> kMapSMR160 = {
    "FFFFFFFFFFFFFFFFF","FFFFFFFFFFFFFFFFF","FFFFFXFFXFFXFFFFF",
    "FFFXFFFFFFFFFXFFF","FFFFFFFFFFFFFFFFF","FFXFFXFFXFFXFFXFF",
    "FFFFFFFFFFFFFFFFF","FFFFFFFFFFFFFFFFF","FFXFFXFFXFFXFFXFF",
    "FFFFFFFFFFFFFFFFF","FFFFFFFFFFFFFFFFF","FFXFFXFFXFFXFFXFF",
    "FFFFFFFFFFFFFFFFF","FFFXFFFFFFFFFXFFF","FFFFFXFFXFFXFFFFF",
    "FFFFFFFFFFFFFFFFF","FFFFFFFFFFFFFFFFF"};
}

void ReactorConfig::SelectPreset(const G4String& name) {
    fName = name;
    fNPins = 17;
    fLattice = Lattice::Square;

    fHeDensity         = 0.001598 * g/cm3;
    fCladMat           = "Zircaloy4";
    fPoisonEnabled     = false;
    fPoisonFraction    = 0.0;
    fPoisonFuelDensity = 10.25 * g/cm3;
    fRodsInserted      = false;
    fRodMat            = "AIC";
    fFuelMat           = "UO2";
    fAbsR = fAbsGapR = fAbsCladR = 0.0;
    fModDensity = 0.740582 * g/cm3;
    fModTemp    = 580.0 * kelvin;
    fFuelDensity = 10.42 * g/cm3;
    fFuelTemp    = 900.0 * kelvin;
    fFuelR = 0.39218 * cm; fGapR = 0.40005 * cm; fCladR = 0.45720 * cm;

    if (name == "BEAVRS") {
        fPinPitch = 1.25984 * cm;
        fFuelR = 0.39218*cm; fGapR = 0.40005*cm; fCladR = 0.45720*cm;
        fGTInnerR = 0.56134*cm; fGTOuterR = 0.60198*cm;
        fActiveHeight = 365.76 * cm;
        fAssemblyHalfXY = 21.50364 * cm / 2.0;
        fEnrichment = 0.031; fBoronPPM = 378.0;
        fFuelDensity = 10.30 * g/cm3;
        fModTemp = 580.0 * kelvin; fFuelTemp = 900.0 * kelvin;
        fHeDensity = 1.66322e-4 * g/cm3;
        fSquareMap = kMapBEAVRS;

    } else if (name == "NuScale") {
        fPinPitch = 1.25984 * cm;
        fFuelR = 0.4057*cm; fGapR = 0.4140*cm; fCladR = 0.4750*cm;
        fGTInnerR = 0.5715*cm; fGTOuterR = 0.6121*cm;
        fActiveHeight = 200.0 * cm;
        fAssemblyHalfXY = fNPins * fPinPitch / 2.0;
        fEnrichment = 0.0455; fBoronPPM = 1000.0;
        fFuelDensity = 10.52 * g/cm3;
        fModTemp = 600.0 * kelvin; fFuelTemp = 900.0 * kelvin;
        fCladMat = "M5";
        fSquareMap = kMapNuScale;

    } else if (name == "mPower") {

        fPinPitch = 1.20 * cm;
        fFuelR = 0.4465*cm; fGapR = 0.4550*cm; fCladR = 0.4750*cm;
        fGTInnerR = 0.520*cm; fGTOuterR = 0.560*cm;
        fActiveHeight = 200.0 * cm;
        fAssemblyHalfXY = fNPins * fPinPitch / 2.0;
        fEnrichment = 0.048; fBoronPPM = 0.0;
        fFuelDensity = 10.97 * g/cm3;
        fModTemp = 600.0 * kelvin; fFuelTemp = 1200.0 * kelvin;
        fSquareMap = kMapMPower;

    } else if (name == "SMR160") {
        fPinPitch = 1.25984 * cm;
        fFuelR = 0.3922*cm; fGapR = 0.40005*cm; fCladR = 0.4572*cm;
        fGTInnerR = 0.56134*cm; fGTOuterR = 0.60198*cm;
        fActiveHeight = 365.76 * cm;
        fAssemblyHalfXY = fNPins * fPinPitch / 2.0;
        fEnrichment = 0.045; fBoronPPM = 1000.0;
        fFuelDensity = 10.42 * g/cm3;
        fModTemp = 580.0 * kelvin; fFuelTemp = 900.0 * kelvin;
        fCladMat = "M5";
        fSquareMap = kMapSMR160;

    } else if (name == "CAREM25") {
        fLattice = Lattice::Hex;
        fPinPitch = 1.38 * cm;
        fFuelR = 0.380*cm; fGapR = 0.3875*cm; fCladR = 0.450*cm;
        fGTInnerR = 0.350*cm; fGTOuterR = 0.425*cm;
        fActiveHeight = 140.0 * cm;
        fHexApothem = 6.5 * fPinPitch;
        fEnrichment = 0.031; fBoronPPM = 0.0;
        fFuelDensity = 10.412 * g/cm3;
        fModTemp = 573.15 * kelvin; fFuelTemp = 573.15 * kelvin;
        fSquareMap.clear();

    } else {
        G4cerr << "[ReactorConfig] Unknown preset '" << name
               << "', keeping BEAVRS." << G4endl;
        SelectPreset("BEAVRS");
        return;
    }
    SetDerived();
    G4cout << "[ReactorConfig] preset = " << fName
           << " (" << (IsHex() ? "Hexagonal" : "Square") << ")" << G4endl;
}

std::vector<ReactorConfig::Cell> ReactorConfig::BuildCells() const {
    std::vector<Cell> cells;
    if (fLattice == Lattice::Hex) {
        const G4double pitch = fPinPitch;
        const G4int nRings = 6;
        const int dir[6][3] = {{+1,-1,0},{+1,0,-1},{0,+1,-1},
                               {-1,+1,0},{-1,0,+1},{0,-1,+1}};

        cells.push_back({0.0, 0.0, 'G'});
        for (G4int d = 1; d <= nRings; ++d) {
            int cx = dir[4][0]*d, cy = dir[4][1]*d, cz = dir[4][2]*d;
            const bool ringHasTubes = (d == 3 || d == 4 || d == 5);
            G4int idx = 0;
            for (G4int side = 0; side < 6; ++side) {
                for (G4int step = 0; step < d; ++step) {
                    const G4double q = cx, r = cz;
                    const G4double x = pitch * (q + r/2.0);
                    const G4double y = pitch * (std::sqrt(3.0)/2.0) * r;
                    const bool isCorner = (idx % d == 0);
                    cells.push_back({x, y, (ringHasTubes && isCorner) ? 'G' : 'F'});
                    ++idx;
                    cx += dir[side][0]; cy += dir[side][1]; cz += dir[side][2];
                }
            }
        }
        return cells;
    }

    const G4int n = fNPins;
    const G4double offset = (n - 1) * fPinPitch / 2.0;
    for (G4int j = 0; j < n; ++j) {
        const std::string& row = fSquareMap[j];
        for (G4int i = 0; i < n; ++i) {
            const G4double x = i * fPinPitch - offset;
            const G4double y = j * fPinPitch - offset;
            const char c = (i < (G4int)row.size()) ? row[i] : 'F';
            cells.push_back({x, y, c});
        }
    }
    return cells;
}

void ReactorConfig::SetDerived() {

    if (fAbsR <= 0.0) {
        fAbsR     = fGTInnerR * 0.78;
        fAbsGapR  = fGTInnerR * 0.80;
        fAbsCladR = fGTInnerR * 0.88;
    }
}

void ReactorConfig::DefineCommands() {
    if (!G4Threading::IsMasterThread()) return;

    fMessenger = new G4GenericMessenger(this, "/smr/reactor/",
        "Reactor selection and parameter overrides (apply before /run/initialize)");

    fMessenger->DeclareMethod("preset", &ReactorConfig::SelectPreset,
        "Select a reactor preset: BEAVRS, NuScale, mPower, SMR160, CAREM25")
        .SetStates(G4State_PreInit);

    fMessenger->DeclareProperty("enrichment", fEnrichment,
        "U-235 enrichment [weight fraction 0-1]")
        .SetStates(G4State_PreInit);
    fMessenger->DeclareProperty("boronPPM", fBoronPPM,
        "Soluble boron [wt-ppm]")
        .SetStates(G4State_PreInit);
    fMessenger->DeclareProperty("rodsInserted", fRodsInserted,
        "Insert control rods into X positions (SMR160-style)")
        .SetStates(G4State_PreInit);
    fMessenger->DeclareProperty("controlRodMaterial", fRodMat,
        "Control rod absorber: AIC, B4C, Hf")
        .SetStates(G4State_PreInit);
    fMessenger->DeclareProperty("poisonEnabled", fPoisonEnabled,
        "Enable Gd2O3 burnable poison in P positions")
        .SetStates(G4State_PreInit);
    fMessenger->DeclareProperty("poisonFraction", fPoisonFraction,
        "Gd2O3 weight fraction in poisoned pins")
        .SetStates(G4State_PreInit);
    fMessenger->DeclarePropertyWithUnit("fuelTemperature", "kelvin", fFuelTemp,
        "Fuel temperature (Doppler)")
        .SetStates(G4State_PreInit);
    fMessenger->DeclarePropertyWithUnit("moderatorTemperature", "kelvin", fModTemp,
        "Moderator temperature")
        .SetStates(G4State_PreInit);
    fMessenger->DeclarePropertyWithUnit("moderatorDensity", "g/cm3", fModDensity,
        "Moderator density")
        .SetStates(G4State_PreInit);

    // Dynamic Geometry Overrides
    fMessenger->DeclarePropertyWithUnit("pinPitch", "cm", fPinPitch, "Pin pitch center-to-center")
        .SetStates(G4State_PreInit);
    fMessenger->DeclarePropertyWithUnit("fuelRadius", "cm", fFuelR, "Fuel pellet outer radius")
        .SetStates(G4State_PreInit);
    fMessenger->DeclarePropertyWithUnit("gapRadius", "cm", fGapR, "Gap outer radius")
        .SetStates(G4State_PreInit);
    fMessenger->DeclarePropertyWithUnit("cladRadius", "cm", fCladR, "Clad outer radius")
        .SetStates(G4State_PreInit);
    fMessenger->DeclarePropertyWithUnit("gtInnerRadius", "cm", fGTInnerR, "GT inner radius")
        .SetStates(G4State_PreInit);
    fMessenger->DeclarePropertyWithUnit("gtOuterRadius", "cm", fGTOuterR, "GT outer radius")
        .SetStates(G4State_PreInit);
    fMessenger->DeclarePropertyWithUnit("activeHeight", "cm", fActiveHeight, "Active fuel height")
        .SetStates(G4State_PreInit);
    fMessenger->DeclarePropertyWithUnit("fuelDensity", "g/cm3", fFuelDensity, "Fuel density")
        .SetStates(G4State_PreInit);
    fMessenger->DeclareProperty("claddingMaterial", fCladMat, "Cladding material type: Zircaloy4, M5, SS304, FeCrAl")
        .SetStates(G4State_PreInit);
    fMessenger->DeclareProperty("fuelMaterial", fFuelMat, "Fuel material type: UO2, MOX")
        .SetStates(G4State_PreInit);
}
