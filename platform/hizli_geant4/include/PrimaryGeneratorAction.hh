//===== File: include/PrimaryGeneratorAction.hh =====
// BEAVRS PWR Assembly - Fission Neutron Source Generator
// Fires neutrons from random fuel rod positions with Watt fission spectrum
//----------------------------------------------------------------------------
#ifndef PRIMARY_GENERATOR_ACTION_HH
#define PRIMARY_GENERATOR_ACTION_HH

#include "G4VUserPrimaryGeneratorAction.hh"
#include "G4ParticleGun.hh"
#include "G4GenericMessenger.hh"
#include "G4ThreeVector.hh"
#include "globals.hh"

#include <vector>

class G4Event;
class RunAction;

class PrimaryGeneratorAction : public G4VUserPrimaryGeneratorAction {
public:
    explicit PrimaryGeneratorAction(RunAction* runAction);
    ~PrimaryGeneratorAction() override;

    void GeneratePrimaries(G4Event* event) override;

private:
    G4double SampleWattEnergy();

    void BuildFuelPinPositions();

    G4ParticleGun* fParticleGun = nullptr;
    RunAction* fRunAction = nullptr;

    G4GenericMessenger* fMessenger = nullptr;

    G4int fNeutronsPerEvent = 1;

    std::vector<G4ThreeVector> fFuelPinXY;
    G4double fFuelRadius = 0.0;
    G4double fHalfZ      = 0.0;

    static constexpr G4double kWattA = 0.988;
    static constexpr G4double kWattB = 2.249;
};

#endif
