//===== File: src/EigenvalueRunner.cc =====
// BEAVRS PWR Assembly - k-eigenvalue power-iteration driver implementation
//----------------------------------------------------------------------------
#include "EigenvalueRunner.hh"
#include "Constants.hh"
#include "FissionBank.hh"

#include "G4GenericMessenger.hh"
#include "G4RunManager.hh"

#include <cmath>
#include <iomanip>

EigenvalueRunner::EigenvalueRunner() {
    fMessenger = new G4GenericMessenger(this, "/beavrs/eigen/",
                                        "k-eigenvalue power iteration control");

    fMessenger->DeclareProperty("inactive", fInactive,
        "Number of inactive (discarded) generations for source convergence")
        .SetParameterName("n", false).SetRange("n >= 0");

    fMessenger->DeclareProperty("active", fActive,
        "Number of active generations averaged into k_eff")
        .SetParameterName("n", false).SetRange("n >= 1");

    fMessenger->DeclareProperty("histories", fHistories,
        "Events per generation (source neutrons/gen = histories * neutronsPerEvent)")
        .SetParameterName("n", false).SetRange("n >= 1");

    fMessenger->DeclareMethod("run", &EigenvalueRunner::Run,
        "Run the k-eigenvalue power iteration (inactive + active generations)");
}

EigenvalueRunner::~EigenvalueRunner() {
    delete fMessenger;
}

void EigenvalueRunner::Run() {
    auto* runManager = G4RunManager::GetRunManager();
    if (!runManager) return;

    FissionBank& bank = FissionBank::GetInstance();
    const G4int total = fInactive + fActive;
    const G4double maxH =
        std::log2(static_cast<double>(BEAVRS::kNPins) * BEAVRS::kNPins);

    G4cout << "\n=================== k-eigenvalue power iteration ==================\n"
           << "  inactive generations : " << fInactive
           << "   (source settling, discarded)\n"
           << "  active generations   : " << fActive
           << "   (averaged into k_eff)\n"
           << "  histories/generation : " << fHistories
           << "   (events; x neutronsPerEvent = source neutrons/gen)\n"
           << "  generation 1 source  : uniform-in-fuel; thereafter sampled from\n"
           << "                         the previous generation's fission bank\n"
           << "  max Shannon entropy  : " << std::setprecision(4) << maxH
           << " bits (17x17 pins)\n"
           << "===================================================================\n"
           << G4endl;

    bank.Enable(fInactive, fActive);
    for (G4int gen = 0; gen < total; ++gen) {
        runManager->BeamOn(fHistories);
    }

    G4cout << "\n========================= k-eigenvalue result =====================\n"
           << "  k_eff = " << std::fixed << std::setprecision(5)
           << bank.ActiveMeanK() << " +/- " << bank.ActiveSemK()
           << "   (averaged over " << bank.ActiveCount()
           << " active generations; " << fInactive << " discarded)\n"
           << "  final source Shannon entropy : " << std::setprecision(4)
           << bank.LastShannonEntropy() << " / " << maxH << " bits\n"
           << "  convergence history written to : beavrs_eigen_summary.txt\n"
           << "===================================================================\n"
           << std::defaultfloat << G4endl;

    bank.WriteEigenSummary("beavrs_eigen_summary.txt");
    bank.Disable();
}
