//===== File: src/PrimaryGeneratorAction.cc =====
// BEAVRS PWR Assembly - Fission Neutron Source Generator Implementation
// Neutrons are generated from random positions within random fuel rods
// with isotropic direction and Watt fission energy spectrum (U-235)
//----------------------------------------------------------------------------
#include "PrimaryGeneratorAction.hh"
#include "FissionBank.hh"
#include "ReactorConfig.hh"
#include "RunAction.hh"

#include "G4AnalysisManager.hh"
#include "G4Event.hh"
#include "G4ParticleDefinition.hh"
#include "G4ParticleTable.hh"
#include "G4RandomDirection.hh"
#include "G4SystemOfUnits.hh"
#include "Randomize.hh"

#include <cmath>

PrimaryGeneratorAction::PrimaryGeneratorAction(RunAction* runAction)
    : fRunAction(runAction) {
  fParticleGun = new G4ParticleGun(1);

  G4ParticleDefinition *neutron =
      G4ParticleTable::GetParticleTable()->FindParticle("neutron");
  fParticleGun->SetParticleDefinition(neutron);

  BuildFuelPinPositions();

  fMessenger =
      new G4GenericMessenger(this, "/beavrs/gun/", "Primary generator control");

  fMessenger
      ->DeclareProperty("neutronsPerEvent", fNeutronsPerEvent,
                        "Number of neutrons fired per event")
      .SetParameterName("N", true)
      .SetRange("N > 0")
      .SetDefaultValue("1");
}

PrimaryGeneratorAction::~PrimaryGeneratorAction() {
  delete fParticleGun;
  delete fMessenger;
}

void PrimaryGeneratorAction::BuildFuelPinPositions() {
  const ReactorConfig& cfg = ReactorConfig::Get();
  fFuelRadius = cfg.FuelRadius();
  fHalfZ      = cfg.ActiveHeight() / 2.0;

  fFuelPinXY.clear();
  for (const auto& c : cfg.BuildCells()) {
    if (c.type == 'F' || c.type == 'P') {
      fFuelPinXY.emplace_back(c.x, c.y, 0.0);
    }
  }
}

G4double PrimaryGeneratorAction::SampleWattEnergy() {
  const G4double a = kWattA;
  const G4double b = kWattB;

  const G4double K = 1.0 + (a * b) / 8.0;
  const G4double L = a * (K + std::sqrt(K * K - 1.0));
  const G4double M = L / a - 1.0;

  G4double x, t;
  do {
    x = -std::log(G4UniformRand());
    const G4double y = -std::log(G4UniformRand());
    t = y - M * (x + 1.0);
  } while (t * t > b * L * x);

  return L * x * MeV;
}

void PrimaryGeneratorAction::GeneratePrimaries(G4Event *event) {
  const G4int nFuelPins = static_cast<G4int>(fFuelPinXY.size());

  for (G4int n = 0; n < fNeutronsPerEvent; ++n) {
    G4ThreeVector bankPos;
    if (FissionBank::GetInstance().Enabled() &&
        FissionBank::GetInstance().SampleSource(bankPos)) {
      fParticleGun->SetParticlePosition(bankPos);
    } else {
      G4int pinIndex = static_cast<G4int>(G4UniformRand() * nFuelPins);
      if (pinIndex >= nFuelPins)
        pinIndex = nFuelPins - 1;

      const G4ThreeVector& c = fFuelPinXY[pinIndex];

      G4double r = fFuelRadius * std::sqrt(G4UniformRand());
      G4double phi = 2.0 * CLHEP::pi * G4UniformRand();
      G4double z = fHalfZ * (2.0 * G4UniformRand() - 1.0);

      G4double posX = c.x() + r * std::cos(phi);
      G4double posY = c.y() + r * std::sin(phi);
      G4double posZ = z;

      fParticleGun->SetParticlePosition(G4ThreeVector(posX, posY, posZ));
    }

    fParticleGun->SetParticleMomentumDirection(G4RandomDirection());

    const G4double energy = SampleWattEnergy();
    fParticleGun->SetParticleEnergy(energy);

    G4AnalysisManager::Instance()->FillH1(0, energy / MeV);
    if (fRunAction) {
      fRunAction->AddSourceNeutron();
    }

    fParticleGun->GeneratePrimaryVertex(event);
  }
}
