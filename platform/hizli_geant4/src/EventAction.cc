//===== File: src/EventAction.cc =====
// BEAVRS PWR Assembly - Per-event accumulation implementation
//----------------------------------------------------------------------------
#include "EventAction.hh"
#include "RunAction.hh"

#include "G4AnalysisManager.hh"
#include "G4Event.hh"
#include "G4SystemOfUnits.hh"

EventAction::EventAction(RunAction* runAction) : fRunAction(runAction) {}

void EventAction::BeginOfEventAction(const G4Event*) {
    fEdepFuel = 0.0;
    fFissionNeutronsThisEvent = 0;
    fThermalizedTrackIds.clear();
}

void EventAction::EndOfEventAction(const G4Event* event) {
    fRunAction->AddEdep(fEdepFuel);
    G4AnalysisManager::Instance()->FillH1(RunAction::kEdepFuel,
                                          fEdepFuel );

    const G4int nSource = event->GetNumberOfPrimaryVertex();
    if (nSource > 0) {
        fRunAction->AddBatch(G4double(fFissionNeutronsThisEvent) / nSource);
    }
}

G4bool EventAction::MarkThermalizedNeutron(G4int trackId) {
    return fThermalizedTrackIds.insert(trackId).second;
}
