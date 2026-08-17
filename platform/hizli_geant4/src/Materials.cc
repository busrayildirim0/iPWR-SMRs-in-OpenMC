//===== File: src/Materials.cc =====
// Multi-reactor material builder (reads ReactorConfig).
//----------------------------------------------------------------------------
#include "Materials.hh"
#include "ReactorConfig.hh"

#include "G4NistManager.hh"
#include "G4SystemOfUnits.hh"

namespace {
G4double U235AtomFractionFromWeightFraction(G4double w235) {
    const G4double m235 = 235.044, m238 = 238.051;
    const G4double n235 = w235 / m235;
    const G4double n238 = (1.0 - w235) / m238;
    return n235 / (n235 + n238);
}
}

Materials* Materials::fInstance = nullptr;

Materials* Materials::GetInstance() {
    if (!fInstance) fInstance = new Materials();
    return fInstance;
}

G4double Materials::GetBoronPPM()             const { return ReactorConfig::Get().BoronPPM(); }
G4double Materials::GetEnrichment()           const { return ReactorConfig::Get().Enrichment(); }
G4double Materials::GetFuelDensity()          const { return ReactorConfig::Get().FuelDensity(); }
G4double Materials::GetFuelTemperature()      const { return ReactorConfig::Get().FuelTemperature(); }
G4double Materials::GetModeratorTemperature() const { return ReactorConfig::Get().ModeratorTemperature(); }
G4double Materials::GetModeratorDensity()     const { return ReactorConfig::Get().ModeratorDensity(); }

void Materials::Construct() {
    if (fBuilt) return;
    DefineMaterials();
    fBuilt = true;
}

void Materials::DefineMaterials() {
    const ReactorConfig& cfg = ReactorConfig::Get();
    G4NistManager* nist = G4NistManager::Instance();

    G4Element* elH_TS = new G4Element("TS_H_of_Water", "H", 1.0, 1.0079 * g/mole);
    G4Element* elO    = nist->FindOrBuildElement("O");
    G4Element* elB    = nist->FindOrBuildElement("B");


    const G4double ppm = cfg.BoronPPM(); 
    const G4double wB = ppm * 1.0e-6;    
    const G4double wH2O = 1.0 - wB;     
    
    // Suyu oluşturan H ve O'nun saf su içindeki kütle fraksiyonları
    const G4double mH2O = 2.0 * 1.0079 + 15.999;
    const G4double wH_in_water = (2.0 * 1.0079) / mH2O;
    const G4double wO_in_water = 15.999 / mH2O;

    const G4int nWaterComp = (wB > 0.0) ? 3 : 2;
    fWater = new G4Material("BoratedWater", cfg.ModeratorDensity(), nWaterComp,
                            kStateLiquid, cfg.ModeratorTemperature(), 150.0*atmosphere);
                            
    // Kütle fraksiyonları ekleniyor (Geant4 AddElement ile kütle oranı alır)
    fWater->AddElement(elH_TS, wH_in_water * wH2O);
    fWater->AddElement(elO,    wO_in_water * wH2O);
    if (wB > 0.0) {
        fWater->AddElement(elB, wB);
    }

    if (cfg.HeDensity() > 0.0) {
        fHelium = new G4Material("GapHelium", cfg.HeDensity(), 1);
        fHelium->AddElement(nist->FindOrBuildElement("He"), 1.0);
    } else {
        fHelium = nist->FindOrBuildMaterial("G4_He");
    }

    fAir = nist->FindOrBuildMaterial("G4_AIR");

    G4Isotope* isoU235 = new G4Isotope("U235", 92, 235, 235.044*g/mole);
    G4Isotope* isoU238 = new G4Isotope("U238", 92, 238, 238.051*g/mole);
    G4Isotope* isoPu239 = new G4Isotope("Pu239", 94, 239, 239.052*g/mole);

    G4Element* elU = new G4Element("EnrichedUranium", "U", 2);
    fU235AtomFraction = U235AtomFractionFromWeightFraction(cfg.Enrichment());
    elU->AddIsotope(isoU235, fU235AtomFraction);
    elU->AddIsotope(isoU238, 1.0 - fU235AtomFraction);

    if (cfg.FuelMaterial() == "MOX") {
        fUO2 = new G4Material("UO2_Enriched", cfg.FuelDensity(), 4,
                              kStateSolid, cfg.FuelTemperature(), 150.0*atmosphere);
        
        G4Element* elU235 = new G4Element("U235_element", "U", 1);
        elU235->AddIsotope(isoU235, 1.0);
        
        G4Element* elU238 = new G4Element("U238_element", "U", 1);
        elU238->AddIsotope(isoU238, 1.0);
        
        G4Element* elPu239 = new G4Element("Pu239_element", "Pu", 1);
        elPu239->AddIsotope(isoPu239, 1.0);

        const G4double pu_frac = cfg.Enrichment();
        const G4double u_frac = 1.0 - pu_frac;
        
        const G4double wPu239 = pu_frac * (239.052 / 271.054);
        const G4double wU235 = u_frac * 0.002 * (235.044 / 270.051);
        const G4double wU238 = u_frac * 0.998 * (238.051 / 270.051);
        const G4double wO = 1.0 - wPu239 - wU235 - wU238;

        fUO2->AddElement(elPu239, wPu239);
        fUO2->AddElement(elU235,  wU235);
        fUO2->AddElement(elU238,  wU238);
        fUO2->AddElement(elO,     wO);
    } else {
        fUO2 = new G4Material("UO2_Enriched", cfg.FuelDensity(), 2,
                              kStateSolid, cfg.FuelTemperature(), 150.0*atmosphere);
        fUO2->AddElement(elU, 1);
        fUO2->AddElement(elO, 2);
    }

    if (cfg.PoisonEnabled()) {
        const G4double gd = cfg.PoisonFraction();
        const G4double fuel_frac = 1.0 - gd;

        G4Element* elGd = nist->FindOrBuildElement("Gd");

        if (cfg.FuelMaterial() == "MOX") {
            fPoisonFuel = new G4Material("UO2_Gd2O3", cfg.PoisonFuelDensity(), 5,
                                         kStateSolid, cfg.FuelTemperature(), 150.0*atmosphere);
            
            G4Element* elU235 = new G4Element("U235_element_P", "U", 1);
            elU235->AddIsotope(isoU235, 1.0);
            
            G4Element* elU238 = new G4Element("U238_element_P", "U", 1);
            elU238->AddIsotope(isoU238, 1.0);
            
            G4Element* elPu239 = new G4Element("Pu239_element_P", "Pu", 1);
            elPu239->AddIsotope(isoPu239, 1.0);

            const G4double pu_frac = cfg.Enrichment();
            const G4double u_frac = 1.0 - pu_frac;
            
            const G4double wPu239 = pu_frac * (239.052 / 271.054);
            const G4double wU235 = u_frac * 0.002 * (235.044 / 270.051);
            const G4double wU238 = u_frac * 0.998 * (238.051 / 270.051);
            const G4double wO = 1.0 - wPu239 - wU235 - wU238;

            fPoisonFuel->AddElement(elPu239, wPu239 * fuel_frac);
            fPoisonFuel->AddElement(elU235,  wU235 * fuel_frac);
            fPoisonFuel->AddElement(elU238,  wU238 * fuel_frac);
            fPoisonFuel->AddElement(elO,     wO * fuel_frac);
            fPoisonFuel->AddElement(elGd,    gd);
        } else {
            const G4double mU   = cfg.Enrichment()*235.044 + (1.0-cfg.Enrichment())*238.051;
            const G4double mUO2 = mU + 2.0*15.999;
            const G4double wU_uo2 = mU / mUO2;
            const G4double wO_uo2 = (2.0*15.999) / mUO2;

            G4Element* elU2 = new G4Element("EnrichedUranium_P", "U", 2);
            elU2->AddIsotope(new G4Isotope("U235p", 92, 235, 235.044*g/mole), fU235AtomFraction);
            elU2->AddIsotope(new G4Isotope("U238p", 92, 238, 238.051*g/mole), 1.0 - fU235AtomFraction);

            fPoisonFuel = new G4Material("UO2_Gd2O3", cfg.PoisonFuelDensity(), 3,
                                         kStateSolid, cfg.FuelTemperature(), 150.0*atmosphere);
            fPoisonFuel->AddElement(elU2, wU_uo2 * fuel_frac);
            fPoisonFuel->AddElement(elO,  wO_uo2 * fuel_frac);
            fPoisonFuel->AddElement(elGd, gd);
        }
    }

    G4Element* elZr = nist->FindOrBuildElement("Zr");
    G4Element* elSn = nist->FindOrBuildElement("Sn");
    G4Element* elFe = nist->FindOrBuildElement("Fe");
    G4Element* elCr = nist->FindOrBuildElement("Cr");
    G4Element* elNb = nist->FindOrBuildElement("Nb");
    const G4String cm = cfg.CladMaterial();
    if (cm == "M5") {
        fClad = new G4Material("CladTube", 6.55*g/cm3, 3, kStateSolid,
                               cfg.ModeratorTemperature());
        fClad->AddElement(elZr, 0.9885);
        fClad->AddElement(elNb, 0.0100);
        fClad->AddElement(elO,  0.0015);
    } else if (cm == "Q12") {
        fClad = new G4Material("CladTube", 6.56*g/cm3, 4, kStateSolid,
                               cfg.ModeratorTemperature());
        fClad->AddElement(elZr, 0.9850);
        fClad->AddElement(elNb, 0.0100);
        fClad->AddElement(elSn, 0.0030);
        fClad->AddElement(elFe, 0.0020);
    } else {
        fClad = new G4Material("CladTube", 6.56*g/cm3, 4, kStateSolid,
                               cfg.ModeratorTemperature());
        fClad->AddElement(elZr, 0.9823);
        fClad->AddElement(elSn, 0.0145);
        fClad->AddElement(elFe, 0.0021);
        fClad->AddElement(elCr, 0.0011);
    }

    const G4String rm = cfg.ControlRodMaterial();
    if (rm == "B4C") {
        fAbsorber = new G4Material("ControlAbsorber", 2.52*g/cm3, 2);
        fAbsorber->AddElement(elB, 0.782);
        fAbsorber->AddElement(nist->FindOrBuildElement("C"), 0.218);
    } else if (rm == "Hf") {
        fAbsorber = new G4Material("ControlAbsorber", 13.31*g/cm3, 1);
        fAbsorber->AddElement(nist->FindOrBuildElement("Hf"), 1.0);
    } else {
        fAbsorber = new G4Material("ControlAbsorber", 9.00*g/cm3, 3,
                                   kStateSolid, cfg.ModeratorTemperature());
        fAbsorber->AddElement(nist->FindOrBuildElement("Ag"), 0.80);
        fAbsorber->AddElement(nist->FindOrBuildElement("In"), 0.15);
        fAbsorber->AddElement(nist->FindOrBuildElement("Cd"), 0.05);
    }

    fSS304 = new G4Material("SS304", 8.00*g/cm3, 4);
    fSS304->AddElement(elFe, 0.69);
    fSS304->AddElement(elCr, 0.19);
    fSS304->AddElement(nist->FindOrBuildElement("Ni"), 0.10);
    fSS304->AddElement(nist->FindOrBuildElement("Mn"), 0.02);
}