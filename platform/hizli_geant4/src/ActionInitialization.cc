//===== File: src/ActionInitialization.cc =====
// Action Initialization Implementation
//----------------------------------------------------------------------------
#include "ActionInitialization.hh"
#include "PrimaryGeneratorAction.hh"
#include "RunAction.hh"
#include "EventAction.hh"
#include "SteppingAction.hh"

void ActionInitialization::BuildForMaster() const {
    SetUserAction(new RunAction());
}

void ActionInitialization::Build() const {
    auto runAction = new RunAction();
    SetUserAction(runAction);

    SetUserAction(new PrimaryGeneratorAction(runAction));

    auto eventAction = new EventAction(runAction);
    SetUserAction(eventAction);

    SetUserAction(new SteppingAction(eventAction, runAction));
}
