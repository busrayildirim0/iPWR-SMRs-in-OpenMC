//===== File: src/SteppingAction.cc =====
// Per-step scoring + reflective assembly boundary (square box face or virtual
// hexagonal apothem planes). Material buckets follow the multi-reactor naming
// from Materials.cc: UO2_Enriched / UO2_Gd2O3 (fuel), BoratedWater (moderator),
// CladTube / SS304 (structural), GapHelium / G4_He / G4_AIR (gas).
//----------------------------------------------------------------------------
#include "SteppingAction.hh"
#include "DetectorConstruction.hh"
#include "EventAction.hh"
#include "FissionBank.hh"
#include "ReactorConfig.hh"
#include "RunAction.hh"

#include "G4AnalysisManager.hh"
#include "G4LogicalVolume.hh"
#include "G4Material.hh"
#include "G4Neutron.hh"
#include "G4Step.hh"
#include "G4StepPoint.hh"
#include "G4SteppingManager.hh"
#include "G4SystemOfUnits.hh"
#include "G4Track.hh"
#include "G4VPhysicalVolume.hh"
#include "G4VProcess.hh"

#include <cmath>
#include <cstdlib>

SteppingAction::SteppingAction(EventAction* eventAction, RunAction* runAction)
    : fEventAction(eventAction), fRunAction(runAction) {}

void SteppingAction::UserSteppingAction(const G4Step* step) {
    if (!step) return;

    const ReactorConfig& cfg = ReactorConfig::Get();
    const G4Track* track = step->GetTrack();
    if (!track) return;

    const G4StepPoint* prePoint = step->GetPreStepPoint();
    if (!prePoint) return;

    const G4StepPoint* postPoint = step->GetPostStepPoint();
    if (!postPoint) return;

    const FissionBank& bank = FissionBank::GetInstance();
    static const G4bool kOnly = (std::getenv("SMR_KONLY") != nullptr);
    const G4bool eigenMode = bank.Enabled();
    const G4bool fullScore = !eigenMode;
    const G4bool histoScore = (!eigenMode || bank.CurrentCycleActive()) && !kOnly;

    G4AnalysisManager* analysis = G4AnalysisManager::Instance();

    const G4double edep = step->GetTotalEnergyDeposit();
    if (edep > 0.0 && histoScore) {
        auto preVol = prePoint->GetPhysicalVolume();
        G4Material* mat = preVol ? preVol->GetLogicalVolume()->GetMaterial() : nullptr;
        const G4String mname = mat ? mat->GetName() : "";
        
        if (mname == "UO2_Enriched" || mname == "UO2_Gd2O3" || mname.find("UO2") != std::string::npos || (preVol && preVol->GetName().find("FuelPV") != std::string::npos)) {
            const G4double edepMeV = edep / MeV;
            fEventAction->AddFuelEdep(edepMeV); // Genel enerji hesabı
            
            // Parçacığın adım attığı orta noktayı (Midpoint) hesapla
            const G4ThreeVector prePos  = prePoint->GetPosition();
            const G4ThreeVector postPos = postPoint->GetPosition();
            const G4double zMidCm = (prePos.z() + postPos.z()) / (2.0 * cm);

            // Aktif Yükseklik Boyutları
            const G4double activeHeightCm = cfg.ActiveHeight() / cm;
            const G4double halfZcm = activeHeightCm / 2.0;

            // Z konumunu [0, activeHeightCm] aralığına getir
            G4double zRel = zMidCm + halfZcm;
            if (zRel < 0.0) zRel = 0.0;
            if (zRel >= activeHeightCm) zRel = activeHeightCm - 1e-5;

            // 0..99 Arası Bin İndeksi
            G4int zBin = static_cast<G4int>((zRel / activeHeightCm) * 100.0);
            zBin = std::max(0, std::min(zBin, 99));

            // FissionBank Eksenel Skorlama
            FissionBank::GetInstance().ScoreAxialPower(zBin, 100, edepMeV);
            
            // H1 Histogramı doldurma adımı
            analysis->FillH1(RunAction::kEdepFuelZ, zMidCm, edepMeV);

            if (preVol) {
                const G4int copyNo = preVol->GetCopyNo();
                const G4int col = cfg.GetPinCol(copyNo);
                const G4int row = cfg.GetPinRow(copyNo);
                const G4int gridRes = cfg.IsHex() ? 15 : cfg.NPins();
                
                if (col >= 0 && col < gridRes && row >= 0 && row < gridRes) {
                    analysis->FillH2(RunAction::kFuelPinEdepMap, col, row, edepMeV);
                    FissionBank::GetInstance().ScorePinPower(col, row, gridRes, edepMeV);
                }
            }
        }
    }

    if (track->GetDefinition() != G4Neutron::Definition()) {
        const_cast<G4Track*>(track)->SetTrackStatus(fStopAndKill);
        return;
    }

    const G4double ePre  = prePoint->GetKineticEnergy();
    const G4double stepL = step->GetStepLength();
    if (ePre > 0.0 && stepL > 0.0) {
        const G4double stepLMm = stepL / mm;
        if (histoScore) {
            analysis->FillH1(RunAction::kFluxE, ePre / MeV, stepLMm);
            const G4double ePreMeV = ePre / MeV;
            const G4double E_min = 1.0e-9;
            const G4double E_max = 20.0;
            if (ePreMeV >= E_min && ePreMeV < E_max) {
                const G4double logMin = std::log10(E_min);
                const G4double logMax = std::log10(E_max);
                const G4double logVal = std::log10(ePreMeV);
                const G4int bin = static_cast<G4int>((logVal - logMin) / (logMax - logMin) * 200.0);
                if (bin >= 0 && bin < 200) {
                    FissionBank::GetInstance().ScoreEnergyFlux(bin, stepLMm);
                }
            }
        }

        if (fullScore) {
            fRunAction->AddStep();
            fRunAction->AddTrackLength(stepLMm);
            auto preVol = prePoint->GetPhysicalVolume();
            G4Material* mat =
                preVol ? preVol->GetLogicalVolume()->GetMaterial() : nullptr;
            const G4String matName = mat ? mat->GetName() : "";
            if (matName == "UO2_Enriched" || matName == "UO2_Gd2O3") {
                fRunAction->AddFuelTrackLength(stepLMm);
                analysis->FillH1(RunAction::kFluxFuelE, ePre / MeV, stepLMm);
            } else if (matName == "BoratedWater") {
                fRunAction->AddModeratorTrackLength(stepLMm);
                analysis->FillH1(RunAction::kFluxModeratorE, ePre / MeV, stepLMm);
            } else if (matName == "CladTube" || matName == "SS304") {
                fRunAction->AddZircaloyTrackLength(stepLMm);
                analysis->FillH1(RunAction::kFluxZircaloyE, ePre / MeV, stepLMm);
            } else if (matName == "GapHelium" || matName == "G4_He" ||
                       matName == "G4_AIR") {
                fRunAction->AddGasTrackLength(stepLMm);
                analysis->FillH1(RunAction::kFluxGasE, ePre / MeV, stepLMm);
            }
        }
    }

    if (fullScore) {
        const G4double ePost = postPoint->GetKineticEnergy();
        if (ePre >= kThermalCut * MeV && ePost < kThermalCut * MeV &&
            fEventAction->MarkThermalizedNeutron(track->GetTrackID())) {
            fRunAction->AddThermalNeutron();
        }
    }

    const G4bool thermalIncident = (ePre < kThermalCut * MeV);
    const G4VProcess* proc = postPoint->GetProcessDefinedStep();
    if (proc) {
        const G4String& pname = proc->GetProcessName();
        if (pname.find("ission") != G4String::npos) {
            G4TrackVector* secondaries = fpSteppingManager ? fpSteppingManager->GetfSecondary() : nullptr;
            G4int nu = 0;
            const G4bool eigenMode = FissionBank::GetInstance().Enabled();

            if (secondaries) {
                for (auto* sec : *secondaries) {
                    if (sec && sec->GetDefinition() == G4Neutron::Definition()) {
                        ++nu;
                        if (eigenMode) {
                            sec->SetTrackStatus(fStopAndKill);
                        }
                    } else if (sec) {
                        const_cast<G4Track*>(sec)->SetTrackStatus(fStopAndKill);
                    }
                }
            }
            fRunAction->AddFission(nu, thermalIncident);
            fEventAction->AddFissionNeutrons(nu);

            if (nu > 0 && eigenMode) {
                FissionBank::GetInstance().Deposit(postPoint->GetPosition(), nu);
            }
        } else if (pname.find("apture") != G4String::npos) {
            fRunAction->AddCapture(thermalIncident);
        } else if (pname.find("Elastic") != G4String::npos) {
            fRunAction->AddElastic();
        } else if (pname.find("nelastic") != G4String::npos) {
            fRunAction->AddInelastic();
            G4int nOut = 0;
            G4TrackVector* secondaries = fpSteppingManager ? fpSteppingManager->GetfSecondary() : nullptr;
            if (secondaries) {
                for (auto* sec : *secondaries) {
                    if (sec && sec->GetDefinition() == G4Neutron::Definition()) {
                        ++nOut;
                    } else if (sec) {
                        const_cast<G4Track*>(sec)->SetTrackStatus(fStopAndKill);
                    }
                }
            }
            if (nOut == 0) fRunAction->AddOtherAbsorption(thermalIncident);
        }
    }

    if (postPoint->GetStepStatus() == fWorldBoundary) {
        fRunAction->AddLeak();
    }

    if (cfg.IsHex())
        ReflectHex(step, cfg);
    else
        ReflectSquare(step, cfg);
}

void SteppingAction::ReflectSquare(const G4Step* step,
                                   const ReactorConfig& cfg) {
    const G4StepPoint* postPoint = step->GetPostStepPoint();
    if (postPoint->GetStepStatus() != fGeomBoundary) return;

    const G4Track* track = step->GetTrack();
    const G4ThreeVector pos = postPoint->GetPosition();
    G4ThreeVector dir = track->GetMomentumDirection();
    const G4double tol = 0.5 * mm;
    const G4double halfXY = cfg.AssemblyHalfXY();
    const G4double halfZ  = cfg.ActiveHeight() / 2.0;

    G4bool reflected = false, radialFace = false, axialFace = false;
    G4bool leaked = false;

    const G4bool nearX = std::abs(std::abs(pos.x()) - halfXY) <= tol;
    const G4bool nearY = std::abs(std::abs(pos.y()) - halfXY) <= tol;
    const G4bool nearZ = std::abs(std::abs(pos.z()) - halfZ) <= tol;

    if (nearX && pos.x() * dir.x() > 0.0) {
        radialFace = true;
        if (DetectorConstruction::ReflectRadial()) {
            dir.setX(-dir.x());
            reflected = true;
        }
        else leaked = true;
    }
    if (nearY && pos.y() * dir.y() > 0.0) {
        radialFace = true;
        if (DetectorConstruction::ReflectRadial()) {
            dir.setY(-dir.y());
            reflected = true;
        }
        else leaked = true;
    }
    if (nearZ && pos.z() * dir.z() > 0.0) {
        axialFace = true;
        if (DetectorConstruction::ReflectAxial()) {
            dir.setZ(-dir.z());
            reflected = true;
        }
        else leaked = true;
    }
    if (radialFace) fRunAction->AddRadialBoundaryCrossing();
    if (axialFace)  fRunAction->AddAxialBoundaryCrossing();
    if (leaked) {
        fRunAction->AddLeak();
        step->GetTrack()->SetTrackStatus(fStopAndKill);
        return;
    }
    if (reflected) {
        dir = dir.unit();
        const_cast<G4Track*>(track)->SetMomentumDirection(dir);
        const_cast<G4StepPoint*>(postPoint)->SetMomentumDirection(dir);
        fRunAction->AddBoundaryReflection();
    }
}

void SteppingAction::ReflectHex(const G4Step* step, const ReactorConfig& cfg) {
    const G4StepPoint* postPoint = step->GetPostStepPoint();
    if (postPoint->GetStepStatus() != fGeomBoundary) return;

    G4Track* track = step->GetTrack();
    const G4ThreeVector pos = postPoint->GetPosition();
    G4ThreeVector dir = track->GetMomentumDirection();
    
    const G4double a = cfg.HexApothem();
    const G4double halfZ = cfg.ActiveHeight() / 2.0;

    G4bool reflected = false, radialFace = false, axialFace = false;
    G4bool leaked = false;

    if (std::abs(pos.z()) >= halfZ - 1.0 * mm && pos.z() * dir.z() > 0.0) {
        axialFace = true;
        if (DetectorConstruction::ReflectAxial()) {
            dir.setZ(-dir.z());
            reflected = true;
        } else leaked = true;
    }

    G4int best_k = -1;
    G4double max_s = -1.0e9;
    G4double best_vn = 0.0;
    G4double best_nx = 0.0, best_ny = 0.0;

    for (G4int k = 0; k < 6; ++k) {
        const G4double ang = (k * 60.0 + 30.0) * deg;
        const G4double nx = std::cos(ang), ny = std::sin(ang);
        const G4double s = pos.x() * nx + pos.y() * ny;
        const G4double vn = dir.x() * nx + dir.y() * ny;
        
        if (s > max_s && vn > 0.0) {
            max_s = s;
            best_k = k;
            best_vn = vn;
            best_nx = nx;
            best_ny = ny;
        }
    }

    const G4double tol = 1.0 * mm; 
    if (best_k >= 0 && max_s >= a - tol) {
        radialFace = true;
        if (DetectorConstruction::ReflectRadial()) {
            dir.setX(dir.x() - 2.0 * best_vn * best_nx);
            dir.setY(dir.y() - 2.0 * best_vn * best_ny);
            reflected = true;
        } else {
            leaked = true;
        }
    }

    if (radialFace) fRunAction->AddRadialBoundaryCrossing();
    if (axialFace)  fRunAction->AddAxialBoundaryCrossing();
    
    if (leaked) {
        fRunAction->AddLeak();
        track->SetTrackStatus(fStopAndKill);
        return;
    }
    if (reflected) {
        dir = dir.unit();
        const_cast<G4Track*>(track)->SetMomentumDirection(dir);
        const_cast<G4StepPoint*>(postPoint)->SetMomentumDirection(dir);
        fRunAction->AddBoundaryReflection();
    }
}
