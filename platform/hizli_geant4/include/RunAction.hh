//===== File: include/RunAction.hh =====
// BEAVRS PWR Assembly - Run-level scoring and ROOT/CSV output
//
// Owns the G4AnalysisManager: books histograms, opens/closes the output file,
// and prints a run summary. In multithreaded mode every worker thread holds
// its own RunAction; the (thread-local) analysis manager merges all histograms
// into a single output file at the end of the run automatically.
//----------------------------------------------------------------------------
#ifndef RUN_ACTION_HH
#define RUN_ACTION_HH

#include "G4UserRunAction.hh"
#include "G4Accumulable.hh"
#include "globals.hh"

#include <chrono>

class G4GenericMessenger;
class G4Run;

class RunAction : public G4UserRunAction {
public:
    RunAction();
    ~RunAction() override;

    void BeginOfRunAction(const G4Run* run) override;
    void EndOfRunAction(const G4Run* run) override;

    static const G4String& GetOutputFileName() { return fOutputFileName; }

    enum HistoId {
        kSourceE = 0,
        kFluxE   = 1,
        kEdepFuel = 2,
        kFluxFuelE = 3,
        kFluxModeratorE = 4,
        kFluxZircaloyE = 5,
        kFluxGasE = 6,
        kEdepFuelZ = 7
    };

    enum Histo2Id {
        kFuelPinEdepMap = 0
    };

    void AddEdep(G4double edep)        { fEdepTotal += edep; }
    void AddThermalNeutron()           { fThermalCount += 1; }
    void AddStep()                     { fStepCount += 1; }
    void AddSourceNeutron()            { fSourceCount += 1; }
    void AddTrackLength(G4double stepLengthMm) { fTrackLengthTotal += stepLengthMm; }
    void AddFuelTrackLength(G4double stepLengthMm) { fTrackLengthFuel += stepLengthMm; }
    void AddModeratorTrackLength(G4double stepLengthMm) { fTrackLengthModerator += stepLengthMm; }
    void AddZircaloyTrackLength(G4double stepLengthMm) { fTrackLengthZircaloy += stepLengthMm; }
    void AddGasTrackLength(G4double stepLengthMm) { fTrackLengthGas += stepLengthMm; }
    void AddRadialBoundaryCrossing()    { fRadialBoundaryCrossings += 1; }
    void AddAxialBoundaryCrossing()     { fAxialBoundaryCrossings += 1; }
    void AddBoundaryReflection()        { fBoundaryReflections += 1; }

    void AddFission(G4int nNeutrons, G4bool thermalIncident) {
        fFissionCount    += 1;
        fFissionNeutrons += nNeutrons;
        if (thermalIncident) fThermalFiss += 1; else fFastFiss += 1;
    }
    void AddCapture(G4bool thermalIncident) {
        fCaptureCount += 1;
        if (thermalIncident) fThermalCap += 1; else fFastCap += 1;
    }
    void AddElastic()                   { fElasticCount += 1; }
    void AddInelastic()                 { fInelasticCount += 1; }
    void AddLeak()                      { fLeakCount += 1; }
    void AddOtherAbsorption(G4bool thermalIncident) {
        fOtherAbsCount += 1;
        if (thermalIncident) fThermalOtherAbs += 1; else fFastOtherAbs += 1;
    }

    void AddBatch(G4double kEvent) {
        fBatchCount += 1;
        fSumK       += kEvent;
        fSumK2      += kEvent * kEvent;
    }

private:
    G4Accumulable<G4double> fEdepTotal{"EdepTotal", 0.0};
    G4Accumulable<G4int>    fThermalCount{"ThermalCount", 0};
    G4Accumulable<G4int>    fStepCount{"StepCount", 0};
    G4Accumulable<G4int>    fSourceCount{"SourceCount", 0};
    G4Accumulable<G4int>    fFissionCount{"FissionCount", 0};
    G4Accumulable<G4int>    fFissionNeutrons{"FissionNeutrons", 0};
    G4Accumulable<G4double> fTrackLengthTotal{"TrackLengthTotal", 0.0};
    G4Accumulable<G4double> fTrackLengthFuel{"TrackLengthFuel", 0.0};
    G4Accumulable<G4double> fTrackLengthModerator{"TrackLengthModerator", 0.0};
    G4Accumulable<G4double> fTrackLengthZircaloy{"TrackLengthZircaloy", 0.0};
    G4Accumulable<G4double> fTrackLengthGas{"TrackLengthGas", 0.0};
    G4Accumulable<G4int>    fRadialBoundaryCrossings{"RadialBoundaryCrossings", 0};
    G4Accumulable<G4int>    fAxialBoundaryCrossings{"AxialBoundaryCrossings", 0};
    G4Accumulable<G4int>    fBoundaryReflections{"BoundaryReflections", 0};

    G4Accumulable<G4int>    fCaptureCount{"CaptureCount", 0};
    G4Accumulable<G4int>    fLeakCount{"LeakCount", 0};
    G4Accumulable<G4int>    fElasticCount{"ElasticCount", 0};
    G4Accumulable<G4int>    fInelasticCount{"InelasticCount", 0};
    G4Accumulable<G4int>    fThermalFiss{"ThermalFiss", 0};
    G4Accumulable<G4int>    fFastFiss{"FastFiss", 0};
    G4Accumulable<G4int>    fThermalCap{"ThermalCap", 0};
    G4Accumulable<G4int>    fFastCap{"FastCap", 0};
    G4Accumulable<G4int>    fOtherAbsCount{"OtherAbsCount", 0};
    G4Accumulable<G4int>    fThermalOtherAbs{"ThermalOtherAbs", 0};
    G4Accumulable<G4int>    fFastOtherAbs{"FastOtherAbs", 0};

    G4Accumulable<G4int>    fBatchCount{"BatchCount", 0};
    G4Accumulable<G4double> fSumK{"SumK", 0.0};
    G4Accumulable<G4double> fSumK2{"SumK2", 0.0};

    std::chrono::steady_clock::time_point fWallStart;

    G4bool fHistosCreated = false;
    G4GenericMessenger* fMessenger = nullptr;

    static G4String fOutputFileName;
    static G4String fOutputFileType;
    static G4int    fAnalysisVerbose;

    void WriteTextSummary(const G4Run* run,
                          G4double meanEdepPerSource,
                          G4double kEst,
                          G4double kErr,
                          G4double meanNu) const;
    void WriteRegionFluxCsv(G4int nSource) const;
};

#endif
