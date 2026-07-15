//===== File: include/SteppingAction.hh =====
// BEAVRS PWR Assembly - Per-step scoring (flux spectrum, fuel edep, thermal count)
//----------------------------------------------------------------------------
#ifndef STEPPING_ACTION_HH
#define STEPPING_ACTION_HH

#include "G4UserSteppingAction.hh"
#include "globals.hh"

class EventAction;
class RunAction;
class ReactorConfig;
class G4Step;

class SteppingAction : public G4UserSteppingAction {
public:
    SteppingAction(EventAction* eventAction, RunAction* runAction);
    ~SteppingAction() override = default;

    void UserSteppingAction(const G4Step* step) override;

private:
    void ReflectSquare(const G4Step* step, const ReactorConfig& cfg);
    void ReflectHex(const G4Step* step, const ReactorConfig& cfg);

    EventAction* fEventAction = nullptr;
    RunAction*   fRunAction   = nullptr;

    static constexpr G4double kThermalCut = 0.625e-6;
};

#endif
