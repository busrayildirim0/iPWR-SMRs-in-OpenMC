//===== File: include/EigenvalueRunner.hh =====
// BEAVRS PWR Assembly - k-eigenvalue power-iteration driver
//
// Installs the /beavrs/eigen/ UI commands and, on /beavrs/eigen/run, executes a
// Monte Carlo power iteration: it loops generations, calling BeamOn() once per
// generation. The FissionBank carries the converging fission source from one
// generation to the next (see FissionBank.hh); RunAction prints a compact
// per-generation line. After the loop, the active-cycle k_eff +/- standard
// error and the source Shannon entropy are reported and written to file.
//
// This is a master-thread helper created once in main(); it owns no per-event
// state and is independent of the (per-thread) Geant4 user actions.
//----------------------------------------------------------------------------
#ifndef EIGENVALUE_RUNNER_HH
#define EIGENVALUE_RUNNER_HH

#include "globals.hh"

class G4GenericMessenger;

class EigenvalueRunner {
public:
    EigenvalueRunner();
    ~EigenvalueRunner();

private:
    void Run();

    G4GenericMessenger* fMessenger = nullptr;

    G4int fInactive  = 20;
    G4int fActive    = 80;
    G4int fHistories = 2000;
};

#endif
