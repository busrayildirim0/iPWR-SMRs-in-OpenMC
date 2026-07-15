//===== File: include/DetectorConstruction.hh =====
// Multi-reactor fuel-assembly geometry. The lattice (square 17x17 or hexagonal
// 127-pin), all pin radii, materials and the active map are taken at build time
// from ReactorConfig::Get(). Supported pin types: F fuel, P Gd2O3 poison,
// G guide tube, X control-rod-capable (rod if inserted, else guide tube),
// I central instrument tube. The reflective assembly boundary is enforced
// virtually in SteppingAction; here the mother is a water-filled box.
//----------------------------------------------------------------------------
#ifndef DETECTOR_CONSTRUCTION_HH
#define DETECTOR_CONSTRUCTION_HH

#include "G4VUserDetectorConstruction.hh"
#include "G4LogicalVolume.hh"
#include "G4VPhysicalVolume.hh"
#include "globals.hh"

class Materials;
class G4GenericMessenger;

class DetectorConstruction : public G4VUserDetectorConstruction {
public:
    DetectorConstruction();
    ~DetectorConstruction() override;

    G4VPhysicalVolume* Construct() override;

    static G4bool ReflectRadial() { return fReflectRadial; }
    static G4bool ReflectAxial()  { return fReflectAxial; }

private:

    void PlaceFuelPin(G4LogicalVolume* mother, G4double x, G4double y,
                      G4int copyNo, G4bool poison);
    void PlaceGuideTube(G4LogicalVolume* mother, G4double x, G4double y,
                        G4int copyNo, G4bool withRod);
    void PlaceInstrumentTube(G4LogicalVolume* mother, G4double x, G4double y,
                             G4int copyNo);

    void BuildLattice(G4LogicalVolume* assemblyLV);

    void DefineCommands();

    Materials* fMaterials = nullptr;
    G4GenericMessenger* fMessenger = nullptr;

    static G4bool fReflectRadial;
    static G4bool fReflectAxial;

#ifdef ENABLE_OVERLAP_CHECK
    G4bool fCheckOverlaps = true;
#else
    G4bool fCheckOverlaps = false;
#endif
};

#endif
