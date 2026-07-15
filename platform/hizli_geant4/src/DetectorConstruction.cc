//===== File: src/DetectorConstruction.cc =====
// Multi-reactor fuel-assembly geometry (reads ReactorConfig).
//----------------------------------------------------------------------------
#include "DetectorConstruction.hh"
#include "Materials.hh"
#include "ReactorConfig.hh"

#include "G4Box.hh"
#include "G4Colour.hh"
#include "G4GenericMessenger.hh"
#include "G4LogicalVolume.hh"
#include "G4PVPlacement.hh"
#include "G4SystemOfUnits.hh"
#include "G4Tubs.hh"
#include "G4Polyhedra.hh"
#include "G4VisAttributes.hh"

#include <cmath>
#include <string>

G4bool DetectorConstruction::fReflectRadial = true;
G4bool DetectorConstruction::fReflectAxial  = true;

namespace {
G4Tubs* MakeTube(const G4String& name, G4double rIn, G4double rOut,
                 G4double halfZ) {
    return new G4Tubs(name, rIn, rOut, halfZ, 0.0, 360.0 * deg);
}
}

DetectorConstruction::DetectorConstruction() {
    fMaterials = Materials::GetInstance();
    DefineCommands();
}

DetectorConstruction::~DetectorConstruction() { delete fMessenger; }

void DetectorConstruction::DefineCommands() {
    fMessenger = new G4GenericMessenger(this, "/beavrs/geom/",
                                        "Geometry / boundary control");
    fMessenger
        ->DeclareProperty("reflectRadial", fReflectRadial,
                          "Mirror (reflective) boundary on the radial x,y faces")
        .SetDefaultValue("true");
    fMessenger
        ->DeclareProperty("reflectAxial", fReflectAxial,
                          "Mirror (reflective) boundary on the axial z faces")
        .SetDefaultValue("true");
}

G4VPhysicalVolume* DetectorConstruction::Construct() {
    const ReactorConfig& cfg = ReactorConfig::Get();
    fMaterials->Construct();

    G4Material* water = fMaterials->GetWater();

    const G4double halfZ = cfg.ActiveHeight() / 2.0;

    G4double motherHalfXY;
    if (cfg.IsHex()) {
        motherHalfXY = cfg.HexApothem() + cfg.PinPitch();
    } else {
        motherHalfXY = cfg.AssemblyHalfXY();
    }

    const G4double worldHalfXY = motherHalfXY + 1.0 * cm;
    const G4double worldHalfZ  = halfZ + 1.0 * cm;

    auto worldSolid = new G4Box("World", worldHalfXY, worldHalfXY, worldHalfZ);
    G4Material* air = fMaterials->GetAir();
    auto worldLV    = new G4LogicalVolume(worldSolid, air, "WorldLV");
    worldLV->SetVisAttributes(G4VisAttributes::GetInvisible());
    auto worldPV = new G4PVPlacement(nullptr, G4ThreeVector(), worldLV, "WorldPV",
                                     nullptr, false, 0, fCheckOverlaps);

    G4LogicalVolume* assemblyLV = nullptr;
    if (cfg.IsHex()) {
        G4double zPlanes[2] = { -halfZ, halfZ };
        G4double rInner[2]  = { 0.0, 0.0 };
        G4double rOuter[2]  = { cfg.HexApothem() / std::cos(30.0 * deg), cfg.HexApothem() / std::cos(30.0 * deg) };
        auto assemblySolid = new G4Polyhedra("Assembly", 0.0 * deg, 360.0 * deg, 6, 2, zPlanes, rInner, rOuter);
        assemblyLV = new G4LogicalVolume(assemblySolid, water, "AssemblyLV");
    } else {
        auto assemblySolid = new G4Box("Assembly", motherHalfXY, motherHalfXY, halfZ);
        assemblyLV = new G4LogicalVolume(assemblySolid, water, "AssemblyLV");
    }
    
    auto waterVis = new G4VisAttributes(G4Colour(0.0, 0.4, 0.8, 0.1));
    waterVis->SetForceSolid(false);
    assemblyLV->SetVisAttributes(waterVis);
    new G4PVPlacement(nullptr, G4ThreeVector(), assemblyLV, "AssemblyPV",
                      worldLV, false, 0, fCheckOverlaps);

    BuildLattice(assemblyLV);

    G4cout << "[DetectorConstruction] built " << cfg.Name() << " ("
           << (cfg.IsHex() ? "hex" : "square") << ")" << G4endl;
    return worldPV;
}

void DetectorConstruction::BuildLattice(G4LogicalVolume* assemblyLV) {
    const ReactorConfig& cfg = ReactorConfig::Get();
    const G4bool rods = cfg.RodsInserted();
    const std::vector<ReactorConfig::Cell> cells = cfg.BuildCells();

    G4int copyNo = 0;
    for (const auto& c : cells) {
        switch (c.type) {
            case 'F': PlaceFuelPin(assemblyLV, c.x, c.y, copyNo, false); break;
            case 'P': PlaceFuelPin(assemblyLV, c.x, c.y, copyNo, true);  break;
            case 'G': PlaceGuideTube(assemblyLV, c.x, c.y, copyNo, false); break;
            case 'X': PlaceGuideTube(assemblyLV, c.x, c.y, copyNo, rods);  break;
            case 'I': PlaceInstrumentTube(assemblyLV, c.x, c.y, copyNo);   break;
            default:  PlaceFuelPin(assemblyLV, c.x, c.y, copyNo, false);  break;
        }
        ++copyNo;
    }
}

void DetectorConstruction::PlaceFuelPin(G4LogicalVolume* mother, G4double x,
                                        G4double y, G4int copyNo,
                                        G4bool poison) {
    const ReactorConfig& cfg = ReactorConfig::Get();
    const G4double halfZ = cfg.ActiveHeight() / 2.0;
    const G4ThreeVector p(x, y, 0);
    const std::string s = std::to_string(copyNo);

    G4Material* fuelMat =
        poison ? fMaterials->GetPoisonFuel() : fMaterials->GetUO2();
    G4Material* he   = fMaterials->GetHelium();
    G4Material* clad = fMaterials->GetClad();

    auto fuelLV = new G4LogicalVolume(
        MakeTube("Fuel_" + s, 0, cfg.FuelRadius(), halfZ), fuelMat,
        "FuelLV_" + s);
    auto fuelVis = new G4VisAttributes(
        poison ? G4Colour(1.0, 0.5, 0.0, 1.0) : G4Colour(1.0, 0.0, 0.0, 1.0));
    fuelVis->SetForceSolid(true);
    fuelLV->SetVisAttributes(fuelVis);
    new G4PVPlacement(nullptr, p, fuelLV, "FuelPV", mother, false, copyNo,
                      fCheckOverlaps);

    auto gapLV = new G4LogicalVolume(
        MakeTube("Gap_" + s, cfg.FuelRadius(), cfg.GapOuterR(), halfZ), he,
        "GapLV_" + s);
    gapLV->SetVisAttributes(new G4VisAttributes(G4Colour(0.0, 1.0, 1.0, 0.3)));
    new G4PVPlacement(nullptr, p, gapLV, "GapPV", mother, false, copyNo,
                      fCheckOverlaps);

    auto cladLV = new G4LogicalVolume(
        MakeTube("Clad_" + s, cfg.GapOuterR(), cfg.CladOuterR(), halfZ), clad,
        "CladLV_" + s);
    auto cladVis = new G4VisAttributes(G4Colour(0.6, 0.6, 0.6, 1.0));
    cladVis->SetForceSolid(true);
    cladLV->SetVisAttributes(cladVis);
    new G4PVPlacement(nullptr, p, cladLV, "CladPV", mother, false, copyNo,
                      fCheckOverlaps);
}

void DetectorConstruction::PlaceGuideTube(G4LogicalVolume* mother, G4double x,
                                          G4double y, G4int copyNo,
                                          G4bool withRod) {
    const ReactorConfig& cfg = ReactorConfig::Get();
    const G4double halfZ = cfg.ActiveHeight() / 2.0;
    const G4ThreeVector p(x, y, 0);
    const std::string s = std::to_string(copyNo);

    G4Material* water = fMaterials->GetWater();
    G4Material* clad  = fMaterials->GetClad();

    if (withRod) {

        G4Material* absMat = fMaterials->GetAbsorber();
        G4Material* he     = fMaterials->GetHelium();
        G4Material* ss304  = fMaterials->GetSS304();

        auto absLV = new G4LogicalVolume(
            MakeTube("Abs_" + s, 0, cfg.AbsR(), halfZ), absMat, "AbsLV_" + s);
        auto absVis = new G4VisAttributes(G4Colour(0.2, 0.2, 0.2, 1.0));
        absVis->SetForceSolid(true);
        absLV->SetVisAttributes(absVis);
        new G4PVPlacement(nullptr, p, absLV, "AbsPV", mother, false, copyNo,
                          fCheckOverlaps);

        auto rgapLV = new G4LogicalVolume(
            MakeTube("AbsGap_" + s, cfg.AbsR(), cfg.AbsGapR(), halfZ), he,
            "AbsGapLV_" + s);
        new G4PVPlacement(nullptr, p, rgapLV, "AbsGapPV", mother, false, copyNo,
                          fCheckOverlaps);

        auto rcladLV = new G4LogicalVolume(
            MakeTube("AbsClad_" + s, cfg.AbsGapR(), cfg.AbsCladR(), halfZ),
            ss304, "AbsCladLV_" + s);
        auto rcladVis = new G4VisAttributes(G4Colour(0.5, 0.5, 0.55, 1.0));
        rcladVis->SetForceSolid(true);
        rcladLV->SetVisAttributes(rcladVis);
        new G4PVPlacement(nullptr, p, rcladLV, "AbsCladPV", mother, false,
                          copyNo, fCheckOverlaps);

        auto annLV = new G4LogicalVolume(
            MakeTube("GTAnn_" + s, cfg.AbsCladR(), cfg.GTInnerR(), halfZ), water,
            "GTAnnLV_" + s);
        new G4PVPlacement(nullptr, p, annLV, "GTAnnPV", mother, false, copyNo,
                          fCheckOverlaps);
    } else {
        auto innerLV = new G4LogicalVolume(
            MakeTube("GTWater_" + s, 0, cfg.GTInnerR(), halfZ), water,
            "GTWaterLV_" + s);
        innerLV->SetVisAttributes(
            new G4VisAttributes(G4Colour(0.0, 0.4, 0.9, 0.4)));
        new G4PVPlacement(nullptr, p, innerLV, "GTWaterPV", mother, false,
                          copyNo, fCheckOverlaps);
    }

    auto wallLV = new G4LogicalVolume(
        MakeTube("GTWall_" + s, cfg.GTInnerR(), cfg.GTOuterR(), halfZ), clad,
        "GTWallLV_" + s);
    auto wallVis = new G4VisAttributes(G4Colour(0.4, 0.4, 0.5, 1.0));
    wallVis->SetForceSolid(true);
    wallLV->SetVisAttributes(wallVis);
    new G4PVPlacement(nullptr, p, wallLV, "GTWallPV", mother, false, copyNo,
                      fCheckOverlaps);
}

void DetectorConstruction::PlaceInstrumentTube(G4LogicalVolume* mother,
                                               G4double x, G4double y,
                                               G4int copyNo) {
    const ReactorConfig& cfg = ReactorConfig::Get();
    const G4double halfZ = cfg.ActiveHeight() / 2.0;
    const G4ThreeVector p(x, y, 0);
    const std::string s = std::to_string(copyNo);

    G4Material* air   = fMaterials->GetAir();
    G4Material* clad  = fMaterials->GetClad();
    G4Material* water = fMaterials->GetWater();

    const G4double rAir     = cfg.GTInnerR() * 0.778;
    const G4double rThimble = cfg.GTInnerR() * 0.862;
    const G4double rWater   = cfg.GTInnerR();

    auto airLV = new G4LogicalVolume(MakeTube("ITAir_" + s, 0, rAir, halfZ),
                                     air, "ITAirLV_" + s);
    airLV->SetVisAttributes(new G4VisAttributes(G4Colour(0.9, 0.9, 0.9, 0.5)));
    new G4PVPlacement(nullptr, p, airLV, "ITAirPV", mother, false, copyNo,
                      fCheckOverlaps);

    auto thimbleLV = new G4LogicalVolume(
        MakeTube("ITThimble_" + s, rAir, rThimble, halfZ), clad,
        "ITThimbleLV_" + s);
    auto thVis = new G4VisAttributes(G4Colour(0.7, 0.7, 0.8, 1.0));
    thVis->SetForceSolid(true);
    thimbleLV->SetVisAttributes(thVis);
    new G4PVPlacement(nullptr, p, thimbleLV, "ITThimblePV", mother, false,
                      copyNo, fCheckOverlaps);

    auto annLV = new G4LogicalVolume(
        MakeTube("ITWater_" + s, rThimble, rWater, halfZ), water,
        "ITWaterLV_" + s);
    new G4PVPlacement(nullptr, p, annLV, "ITWaterPV", mother, false, copyNo,
                      fCheckOverlaps);

    auto wallLV = new G4LogicalVolume(
        MakeTube("ITWall_" + s, cfg.GTInnerR(), cfg.GTOuterR(), halfZ), clad,
        "ITWallLV_" + s);
    auto wallVis = new G4VisAttributes(G4Colour(0.4, 0.4, 0.5, 1.0));
    wallVis->SetForceSolid(true);
    wallLV->SetVisAttributes(wallVis);
    new G4PVPlacement(nullptr, p, wallLV, "ITWallPV", mother, false, copyNo,
                      fCheckOverlaps);
}
