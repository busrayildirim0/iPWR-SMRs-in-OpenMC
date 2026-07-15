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
    const ReactorConfig& cfg = ReactorConfig::Get();
    const G4Track* track = step->GetTrack();
    const FissionBank& bank = FissionBank::GetInstance();
    static const G4bool kOnly = (std::getenv("SMR_KONLY") != nullptr);
    const G4bool eigenMode = bank.Enabled();
    const G4bool fullScore = !eigenMode;
    const G4bool histoScore = (!eigenMode || bank.CurrentCycleActive()) && !kOnly;

    G4AnalysisManager* analysis = G4AnalysisManager::Instance();

    // 1. DOĞRU GÜÇ SKORLAMASI (Gerçek Fisyon Isı Birikimi - edep)
    const G4double edep = step->GetTotalEnergyDeposit();
    if (edep > 0.0 && histoScore) {
        auto preVol = step->GetPreStepPoint()->GetTouchableHandle()->GetVolume();
        G4Material* mat = preVol ? preVol->GetLogicalVolume()->GetMaterial() : nullptr;
        const G4String mname = mat ? mat->GetName() : "";
        
        if (mname == "UO2_Enriched" || mname == "UO2_Gd2O3") {
            const G4double edepMeV = edep / MeV;
            fEventAction->AddFuelEdep(edepMeV); // Genel enerji hesabı
            
            // Z Ekseni için Adımın Orta Noktası (Daha yüksek hassasiyet)
            G4double zMid = (step->GetPreStepPoint()->GetPosition().z() + 
                             step->GetPostStepPoint()->GetPosition().z()) / 2.0;
            
            // Eksenel Güç Profilini enerji birikimi (edep) ile doldur!
            analysis->FillH1(RunAction::kEdepFuelZ, zMid / cm, edepMeV);
            
            // 2D Pin Güç Haritasını enerji birikimi ile doldur
            if (!cfg.IsHex()) {
                const G4int n = cfg.NPins();
                const G4int copyNo = preVol->GetCopyNo();
                analysis->FillH2(RunAction::kFuelPinEdepMap, copyNo % n, copyNo / n, edepMeV);
            } else {
                const G4double pitch = cfg.PinPitch();
                const G4double x = preVol->GetObjectTranslation().x();
                const G4double y = preVol->GetObjectTranslation().y();
                
                // Fiziksel kartezyen koordinatları doğrudan piksel sütun/satırına eşle
                const G4int col = (G4int)std::floor(x / pitch + 8.5);
                const G4int row = (G4int)std::floor(y / pitch + 8.5);
                
                if (row >= 0 && row < 17 && col >= 0 && col < 17) {
                    analysis->FillH2(RunAction::kFuelPinEdepMap, col, row, edepMeV);
                }
            }
        }
    }

    // 2. NÖTRON KONTROLÜ VE HIZLI AKI (Track-Length)
    if (track->GetDefinition() != G4Neutron::Definition()) {
        const_cast<G4Track*>(track)->SetTrackStatus(fStopAndKill);
        return;
    }

    const G4double ePre  = step->GetPreStepPoint()->GetKineticEnergy();
    const G4double stepL = step->GetStepLength();
    if (ePre > 0.0 && stepL > 0.0) {
        const G4double stepLMm = stepL / mm;
        if (histoScore) {
            analysis->FillH1(RunAction::kFluxE, ePre / MeV, stepLMm);
            
        }

        if (fullScore) {
            fRunAction->AddStep();
            fRunAction->AddTrackLength(stepLMm);
            auto preVol =
                step->GetPreStepPoint()->GetTouchableHandle()->GetVolume();
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
        const G4double ePost = step->GetPostStepPoint()->GetKineticEnergy();
        if (ePre >= kThermalCut * MeV && ePost < kThermalCut * MeV &&
            fEventAction->MarkThermalizedNeutron(track->GetTrackID())) {
            fRunAction->AddThermalNeutron();
        }
    }

    const G4StepPoint* postPoint = step->GetPostStepPoint();
    const G4bool thermalIncident = (ePre < kThermalCut * MeV);
    const G4VProcess* proc = postPoint->GetProcessDefinedStep();
    if (proc) {
        const G4String& pname = proc->GetProcessName();
        if (pname.find("ission") != G4String::npos) {
            G4TrackVector* secondaries = fpSteppingManager->GetfSecondary();
            G4int nu = 0;
            for (auto* sec : *secondaries) {
                if (sec->GetDefinition() == G4Neutron::Definition()) {
                    ++nu;
                    sec->SetTrackStatus(fStopAndKill);
                }
            }
            fRunAction->AddFission(nu, thermalIncident);
            fEventAction->AddFissionNeutrons(nu);
            if (nu > 0 && FissionBank::GetInstance().Enabled()) {
                FissionBank::GetInstance().Deposit(postPoint->GetPosition(), nu);
            }
        } else if (pname.find("apture") != G4String::npos) {
            fRunAction->AddCapture(thermalIncident);
        } else if (pname.find("Elastic") != G4String::npos) {
            fRunAction->AddElastic();
        } else if (pname.find("nelastic") != G4String::npos) {
            fRunAction->AddInelastic();
            G4int nOut = 0;
            for (auto* sec : *fpSteppingManager->GetfSecondary()) {
                if (sec->GetDefinition() == G4Neutron::Definition()) ++nOut;
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
        step->GetTrack()->SetMomentumDirection(dir);
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

    // 🛡️ 2. Z Ekseni (Alt/Üst) Yansıtması
    // Toleransı 1.0 mm gibi geniş ve güvenli bir değere alıyoruz (Çünkü dış sınırda olduğumuzu zaten biliyoruz)
    if (std::abs(pos.z()) >= halfZ - 1.0 * mm && pos.z() * dir.z() > 0.0) {
        axialFace = true;
        if (DetectorConstruction::ReflectAxial()) {
            dir.setZ(-dir.z());
            reflected = true;
        } else leaked = true;
    }

    // 🛡️ 3. Radyal (Hegzagonal Yüzey) Yansıtması
    // 'else' kullanmıyoruz! Parçacık köşede (hem Z hem Radyal sınırda) olabilir.
    // 🛡️ 3. Radyal (Hegzagonal Yüzey) Yansıtması
    // Köşelerde yuvarlama ve çakışma hatalarını gidermek için en yakın/en yüksek projeksiyon değerine sahip yüzeyi seçiyoruz.
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
        track->SetMomentumDirection(dir);
        fRunAction->AddBoundaryReflection();
    }
}
