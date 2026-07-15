//===== File: include/EventAction.hh =====
// BEAVRS PWR Assembly - Per-event accumulation of energy deposited in fuel
//----------------------------------------------------------------------------
#ifndef EVENT_ACTION_HH
#define EVENT_ACTION_HH

#include "G4UserEventAction.hh"
#include "globals.hh"

#include <set>

class RunAction;

class EventAction : public G4UserEventAction {
public:
    explicit EventAction(RunAction* runAction);
    ~EventAction() override = default;

    void BeginOfEventAction(const G4Event* event) override;
    void EndOfEventAction(const G4Event* event) override;

    void AddFuelEdep(G4double edep) { fEdepFuel += edep; }
    G4bool MarkThermalizedNeutron(G4int trackId);

    void AddFissionNeutrons(G4int nu) { fFissionNeutronsThisEvent += nu; }

private:
    RunAction* fRunAction = nullptr;
    G4double   fEdepFuel  = 0.0;
    G4int      fFissionNeutronsThisEvent = 0;
    std::set<G4int> fThermalizedTrackIds;
};

#endif
