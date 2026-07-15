//===== File: main.cc =====
// BEAVRS PWR 17x17 Fuel Assembly - Fission Neutron Simulation
// Geant4 application with fission neutron source from fuel rods
//----------------------------------------------------------------------------
#include "DetectorConstruction.hh"
#include "ActionInitialization.hh"
#include "EigenvalueRunner.hh"
#include "ReactorConfig.hh"

#include "G4RunManagerFactory.hh"
#include "G4SystemOfUnits.hh"
#include "G4Threading.hh"
#include "G4UImanager.hh"

#include <cstdlib>
#ifdef WITH_GEANT4_UIVIS
#include "G4UIExecutive.hh"
#include "G4VisExecutive.hh"
#endif
#include "FTFP_BERT_HP.hh"
#include "G4ParticleHPManager.hh"
#include "G4ThermalNeutrons.hh"

void PrintUsage() {
    G4cerr << "\nUsage: beavrs_assembly [-m macro] [-i]\n"
           << "  -m macro    : Run in batch mode with specified macro\n"
           << "  -i          : Interactive mode (run with UI)\n"
           << G4endl;
}

int main(int argc, char** argv) {
    G4String macro;
    G4bool interactive = false;

    for (G4int i = 1; i < argc; ++i) {
        G4String arg = argv[i];
        if (arg == "-m" && i + 1 < argc) {
            macro = argv[++i];

        } else if (arg == "-i") {
            interactive = true;
        } else if (arg == "-h" || arg == "--help") {
            PrintUsage();
            return 0;
        }
    }

#ifdef WITH_GEANT4_UIVIS
    G4UIExecutive* ui = nullptr;
    if (interactive || macro.empty()) {
        ui = new G4UIExecutive(argc, argv);
    }
#else
    if (interactive || macro.empty()) {
        G4cerr << "Interactive visualization was disabled at build time. "
               << "Reconfigure with -DWITH_GEANT4_UIVIS=ON or run with -m <macro>."
               << G4endl;
        return 1;
    }
#endif

    auto runManager = G4RunManagerFactory::CreateRunManager(
        G4RunManagerType::Default);

#ifdef WITH_GEANT4_UIVIS
    const G4bool wantVis = (interactive || macro.empty());
#else
    const G4bool wantVis = false;
#endif
    G4int nThreads = 1;
    if (!wantVis) {
        nThreads = G4Threading::G4GetNumberOfCores();
        if (const char* env = std::getenv("SMR_THREADS")) {
            const G4int req = std::atoi(env);
            if (req > 0) nThreads = req;
        }
        if (nThreads < 1) nThreads = 1;
    }
    runManager->SetNumberOfThreads(nThreads);
    G4cout << "[SMR-G4] CPU thread sayisi = " << nThreads << " / "
           << G4Threading::G4GetNumberOfCores() << " cekirdek" << G4endl;

    ReactorConfig::Get();

    runManager->SetUserInitialization(new DetectorConstruction());

    G4ParticleHPManager::GetInstance()->SetNeglectDoppler(true);
    G4VModularPhysicsList* physicsList = new FTFP_BERT_HP();
    physicsList->SetVerboseLevel(0);
    physicsList->RegisterPhysics(new G4ThermalNeutrons());
    G4double emCut = 5.0 * mm;
    if (const char* envCut = std::getenv("SMR_EMCUT_MM")) {
        const G4double v = std::atof(envCut);
        if (v > 0.0) emCut = v * mm;
    }
    physicsList->SetDefaultCutValue(emCut);
    runManager->SetUserInitialization(physicsList);

    runManager->SetUserInitialization(new ActionInitialization());

    auto eigenRunner = new EigenvalueRunner();

#ifdef WITH_GEANT4_UIVIS
    G4VisManager* visManager = new G4VisExecutive("Quiet");
    visManager->Initialize();
#endif

    G4UImanager* UImanager = G4UImanager::GetUIpointer();

    if (!macro.empty()) {
        G4String command = "/control/execute ";
        UImanager->ApplyCommand(command + macro);
    }

#ifdef WITH_GEANT4_UIVIS
    if (ui) {
        UImanager->ApplyCommand("/control/execute macros/vis.mac");
        ui->SessionStart();
        delete ui;
    }
#endif

#ifdef WITH_GEANT4_UIVIS
    delete visManager;
#endif
    delete eigenRunner;
    delete runManager;

    return 0;
}
