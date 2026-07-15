//===== File: include/FissionBank.hh =====
// BEAVRS PWR Assembly - Fission source bank for k-eigenvalue power iteration
//
// In fixed-source mode the simulation follows each source neutron for exactly
// one generation (fission neutrons are counted then killed). That gives a
// single-generation k, but the SPATIAL source is whatever the user injected
// (uniform-in-fuel), not the fundamental-mode fission distribution.
//
// The FissionBank turns that single-generation engine into a true Monte Carlo
// power iteration (criticality / k-eigenvalue calculation):
//
//   * During a generation, every induced fission deposits its site (once per
//     emitted neutron) into the bank.                       -> Deposit()
//   * Between generations the deposited sites become the SOURCE for the next
//     generation; the bank's Shannon entropy over the pin lattice is computed
//     to monitor spatial convergence.                       -> Advance()
//   * The next generation's PrimaryGeneratorAction samples its birth positions
//     from that source bank instead of uniform-in-fuel.     -> SampleSource()
//   * The population is renormalised automatically because each generation
//     always fires the same fixed number of source neutrons (sampling the
//     ~k*N banked sites with replacement).
//
// k_gen = (fission neutrons produced) / (source neutrons) per generation, the
// same estimator as before; it converges to k_eff once the spatial source has
// converged. A configurable number of leading "inactive" generations are
// discarded before the active-cycle average and its standard error are formed.
//
// This is a process-wide singleton (one instance shared by all worker threads,
// unlike the per-thread Geant4 user actions). Deposits are mutex-protected;
// source sampling during a generation is lock-free because the source vector is
// only mutated by Advance() on the master thread between generations.
//----------------------------------------------------------------------------
#ifndef FISSION_BANK_HH
#define FISSION_BANK_HH

#include "G4ThreeVector.hh"
#include "globals.hh"

#include <mutex>
#include <vector>

class FissionBank {
public:
    static FissionBank& GetInstance();

    void Enable(G4int inactiveCycles, G4int activeCycles);
    void Disable() { fEnabled = false; }
    G4bool Enabled() const { return fEnabled; }

    void Deposit(const G4ThreeVector& pos, G4int nNeutrons);

    G4bool SampleSource(G4ThreeVector& pos) const;
    G4bool HasSource() const { return !fSource.empty(); }

    void EndOfGeneration(G4double kGeneration);

    G4double LastShannonEntropy() const { return fEntropy; }
    G4int    CurrentCycle()       const { return fCycle; }
    G4int    InactiveCycles()     const { return fInactive; }
    G4int    ActiveCycles()       const { return fActive; }
    G4bool   CurrentCycleActive() const { return fCycle >= fInactive; }
    G4bool   LastCycleActive()    const { return fLastActive; }
    G4int    ActiveCount()        const { return fActiveN; }
    G4double ActiveMeanK()        const;
    G4double ActiveSemK()         const;
    std::size_t SourceSize()      const { return fSource.size(); }

    void WriteEigenSummary(const G4String& path) const;

private:
    FissionBank() = default;

    G4double ComputeEntropy(const std::vector<G4ThreeVector>& sites) const;

    struct CycleRecord {
        G4int    cycle;
        G4double k;
        G4double entropy;
        G4bool   active;
        std::size_t sourceSize;
    };

    mutable std::mutex fMutex;
    std::vector<G4ThreeVector> fDeposited;
    std::vector<G4ThreeVector> fSource;

    G4bool fEnabled = false;
    G4int  fInactive = 0;
    G4int  fActive   = 0;
    G4int  fCycle    = 0;
    G4bool fLastActive = false;
    G4double fEntropy = 0.0;

    G4int    fActiveN    = 0;
    G4double fActiveSumK  = 0.0;
    G4double fActiveSumK2 = 0.0;

    std::vector<CycleRecord> fHistory;
};

#endif
