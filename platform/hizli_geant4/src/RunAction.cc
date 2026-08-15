//===== File: src/RunAction.cc =====
// BEAVRS PWR Assembly - Run-level scoring and ROOT/CSV output implementation
//----------------------------------------------------------------------------
#include "RunAction.hh"
#include "Constants.hh"
#include "DetectorConstruction.hh"
#include "FissionBank.hh"
#include "Materials.hh"
#include "ReactorConfig.hh"

#include "G4AnalysisManager.hh"
#include "G4AccumulableManager.hh"
#include "G4GenericMessenger.hh"
#include "G4ParticleHPManager.hh"
#include "G4Run.hh"
#include "G4RunManager.hh"
#include "G4Threading.hh"
#include "G4SystemOfUnits.hh"
#include "G4UnitsTable.hh"

#include <cmath>
#include <fstream>
#include <iomanip>

namespace {

struct RegionVolumes {
    G4double total = 0.0;
    G4double fuel = 0.0;
    G4double moderator = 0.0;
    G4double zircaloy = 0.0;
    G4double gas = 0.0;
};

G4double AnnularVolume(G4double innerR, G4double outerR, G4double height) {
    return CLHEP::pi * (outerR * outerR - innerR * innerR) * height;
}

RegionVolumes ComputeRegionVolumes() {
    const auto& cfg = ReactorConfig::Get();

    G4int nFuelPins = 0;
    G4int nGuideTubes = 0;
    G4int nInstrumentTubes = 0;
    
    for (const auto& c : cfg.BuildCells()) {
        if (c.type == 'F' || c.type == 'P') {
            nFuelPins++;
        } else if (c.type == 'G' || c.type == 'X') {
            nGuideTubes++;
        } else if (c.type == 'I') {
            nInstrumentTubes++;
        } else {
            nFuelPins++;
        }
    }

    const G4double activeH = cfg.ActiveHeight();
    
    RegionVolumes v;
    if (cfg.IsHex()) {
        const G4double apothem = cfg.HexApothem();
        const G4double crossSectionArea = 2.0 * std::sqrt(3.0) * apothem * apothem;
        v.total = crossSectionArea * activeH;
    } else {
        const G4double motherHalfXY = cfg.AssemblyHalfXY();
        const G4double sideLength = 2.0 * motherHalfXY;
        v.total = sideLength * sideLength * activeH;
    }
    
    v.fuel = nFuelPins * AnnularVolume(0.0, cfg.FuelRadius(), activeH);

    const G4double fuelClad =
        nFuelPins * AnnularVolume(cfg.GapOuterR(), cfg.CladOuterR(), activeH);
    const G4double guideTubeWall =
        nGuideTubes * AnnularVolume(cfg.GTInnerR(), cfg.GTOuterR(), activeH);

    const G4double rAir     = cfg.GTInnerR() * 0.778;
    const G4double rThimble = cfg.GTInnerR() * 0.862;

    const G4double itThimble =
        nInstrumentTubes * AnnularVolume(rAir, rThimble, activeH);
    const G4double itOuterWall =
        nInstrumentTubes * AnnularVolume(cfg.GTInnerR(), cfg.GTOuterR(), activeH);
    v.zircaloy = fuelClad + guideTubeWall + itThimble + itOuterWall;

    const G4double heliumGap =
        nFuelPins * AnnularVolume(cfg.FuelRadius(), cfg.GapOuterR(), activeH);
    const G4double instrumentAir =
        nInstrumentTubes * AnnularVolume(0.0, rAir, activeH);
    v.gas = heliumGap + instrumentAir;

    v.moderator = v.total - v.fuel - v.zircaloy - v.gas;
    return v;
}

G4double ToMm3(G4double volume) {
    return volume / (mm * mm * mm);
}

G4double NormalizedIntegralFlux(G4double trackLengthMm,
                                G4double volume,
                                G4int sourceCount) {
    if (sourceCount <= 0 || volume <= 0.0) return 0.0;
    return trackLengthMm / (ToMm3(volume) * sourceCount);
}

}

G4String RunAction::fOutputFileName = "beavrs_output";
G4String RunAction::fOutputFileType = "root";
G4int RunAction::fAnalysisVerbose = 0;

RunAction::RunAction() {
    auto accMgr = G4AccumulableManager::Instance();
    accMgr->Register(fEdepTotal);
    accMgr->Register(fThermalCount);
    accMgr->Register(fStepCount);
    accMgr->Register(fSourceCount);
    accMgr->Register(fFissionCount);
    accMgr->Register(fFissionNeutrons);
    accMgr->Register(fTrackLengthTotal);
    accMgr->Register(fTrackLengthFuel);
    accMgr->Register(fTrackLengthModerator);
    accMgr->Register(fTrackLengthZircaloy);
    accMgr->Register(fTrackLengthGas);
    accMgr->Register(fRadialBoundaryCrossings);
    accMgr->Register(fAxialBoundaryCrossings);
    accMgr->Register(fBoundaryReflections);
    accMgr->Register(fCaptureCount);
    accMgr->Register(fLeakCount);
    accMgr->Register(fElasticCount);
    accMgr->Register(fInelasticCount);
    accMgr->Register(fThermalFiss);
    accMgr->Register(fFastFiss);
    accMgr->Register(fThermalCap);
    accMgr->Register(fFastCap);
    accMgr->Register(fOtherAbsCount);
    accMgr->Register(fThermalOtherAbs);
    accMgr->Register(fFastOtherAbs);
    accMgr->Register(fBatchCount);
    accMgr->Register(fSumK);
    accMgr->Register(fSumK2);

    if (G4Threading::IsMasterThread()) {
        fMessenger = new G4GenericMessenger(
            this, "/beavrs/output/", "Run output control");

        fMessenger
            ->DeclareProperty("fileName", fOutputFileName,
                              "Output file name without extension")
            .SetParameterName("name", false);

        fMessenger
            ->DeclareProperty("fileType", fOutputFileType,
                              "Output file type")
            .SetParameterName("type", false)
            .SetCandidates("root csv");

        fMessenger
            ->DeclareProperty("verbose", fAnalysisVerbose,
                              "G4AnalysisManager verbose level")
            .SetParameterName("level", false)
            .SetRange("level >= 0");
    }

}

RunAction::~RunAction() {
    delete fMessenger;
}

void RunAction::BeginOfRunAction(const G4Run*) {
    G4AccumulableManager::Instance()->Reset();

    if (IsMaster()) fWallStart = std::chrono::steady_clock::now();

    auto analysis = G4AnalysisManager::Instance();
    analysis->SetDefaultFileType(fOutputFileType);
    analysis->SetVerboseLevel(fAnalysisVerbose);

    if (analysis->GetH2Id("edep_fuel_pin_map", false) < 0) {
        analysis->CreateH1("source_E", "Source neutron energy;E [MeV];Counts",
                           200, 1.0e-9, 20.0, "none", "none", "log");
        analysis->CreateH1("flux_E", "Neutron flux spectrum;E [MeV];Track length [mm]",
                           200, 1.0e-9, 20.0, "none", "none", "log");
        analysis->CreateH1("edep_fuel", "Energy deposited in fuel per event;E [MeV];Events",
                           100, 0.0, 5.0);
        analysis->CreateH1("flux_E_fuel",
                           "Fuel neutron raw track-length spectrum;E [MeV];Track length [mm]",
                           200, 1.0e-9, 20.0, "none", "none", "log");
        analysis->CreateH1("flux_E_moderator",
                           "Moderator neutron raw track-length spectrum;E [MeV];Track length [mm]",
                           200, 1.0e-9, 20.0, "none", "none", "log");
        analysis->CreateH1("flux_E_zircaloy",
                           "Zircaloy neutron raw track-length spectrum;E [MeV];Track length [mm]",
                           200, 1.0e-9, 20.0, "none", "none", "log");
        analysis->CreateH1("flux_E_gas",
                           "Gas-gap/air neutron raw track-length spectrum;E [MeV];Track length [mm]",
                           200, 1.0e-9, 20.0, "none", "none", "log");
        analysis->CreateH1("edep_fuel_z",
                           "Axial fuel energy deposition;z [cm];Energy [MeV]",
                           100, -ReactorConfig::Get().ActiveHeight() / (2.0 * cm), ReactorConfig::Get().ActiveHeight() / (2.0 * cm));

        const G4int gridRes = ReactorConfig::Get().IsHex() ? 15 : ReactorConfig::Get().NPins();
        analysis->CreateH2("edep_fuel_pin_map",
                           "Fuel pin energy deposition map;Column;Row;Energy [MeV]",
                           gridRes, -0.5, gridRes - 0.5,
                           gridRes, -0.5, gridRes - 0.5);
        fHistosCreated = true;
    }

    if (!analysis->IsOpenFile()) {
        analysis->OpenFile(fOutputFileName);
    }
}

void RunAction::EndOfRunAction(const G4Run* run) {
    G4AccumulableManager::Instance()->Merge();

    if (!IsMaster()) return;

    const G4int nEvents = run->GetNumberOfEvent();
    if (nEvents == 0) return;

    const G4int nSource = fSourceCount.GetValue();
    const G4double meanEdepPerSource =
        nSource > 0 ? fEdepTotal.GetValue() / nSource : 0.0;

    const G4int    nFiss    = fFissionCount.GetValue();
    const G4int    nFissN   = fFissionNeutrons.GetValue();
    const G4double kEst     = nSource > 0 ? G4double(nFissN) / nSource : 0.0;
    const G4double meanNu   = nFiss   > 0 ? G4double(nFissN) / nFiss   : 0.0;
    const G4double kErr     = nSource > 0 && nFissN > 0
                                  ? kEst / std::sqrt(G4double(nFissN)) : 0.0;

    const G4int    nBatch     = fBatchCount.GetValue();
    const G4double kBatchMean = nBatch > 0 ? fSumK.GetValue() / nBatch : 0.0;
    G4double kBatchSem = 0.0;
    if (nBatch > 1) {
        const G4double meanK2 = fSumK2.GetValue() / nBatch;
        G4double var = (meanK2 - kBatchMean * kBatchMean)
                       * nBatch / (nBatch - 1.0);
        if (var < 0.0) var = 0.0;
        kBatchSem = std::sqrt(var / nBatch);
    }
    const G4double kRelErr = kBatchMean > 0.0 ? kBatchSem / kBatchMean : 0.0;
    const G4double elapsedSec = std::chrono::duration<G4double>(
        std::chrono::steady_clock::now() - fWallStart).count();
    const G4double fom = (kRelErr > 0.0 && elapsedSec > 0.0)
                             ? 1.0 / (kRelErr * kRelErr * elapsedSec) : 0.0;

    FissionBank& bank = FissionBank::GetInstance();
    if (bank.Enabled()) {
        const G4int    nCapE   = fCaptureCount.GetValue();
        const G4int    nOtherE = fOtherAbsCount.GetValue();
        const G4int    nAbsE   = nFiss + nCapE + nOtherE;
        const G4double kInfE   = nAbsE > 0 ? G4double(nFissN) / nAbsE : 0.0;

        bank.EndOfGeneration(kEst);

        G4cout << std::fixed
               << "  [eigen] gen " << std::setw(4) << bank.CurrentCycle()
               << (bank.LastCycleActive() ? "  active " : "  inactiv")
               << "  k = "  << std::setprecision(5) << kEst
               << " +/- "   << std::setprecision(5) << kBatchSem
               << "   k_inf = " << std::setprecision(5) << kInfE
               << "   H = "  << std::setprecision(4) << bank.LastShannonEntropy()
               << " bits   src/bank = " << nSource << "/" << bank.SourceSize();
        if (bank.ActiveCount() > 0) {
            G4cout << "   <k_eff> = " << std::setprecision(5) << bank.ActiveMeanK()
                   << " +/- "        << std::setprecision(5) << bank.ActiveSemK();
        }
        G4cout << std::defaultfloat << G4endl;

        // Check if this is the last generation of the run loop!
        if (bank.CurrentCycle() == bank.InactiveCycles() + bank.ActiveCycles()) {
            WriteTextSummary(run, meanEdepPerSource, bank.ActiveMeanK(), bank.ActiveSemK(), meanNu);
            WriteRegionFluxCsv(nSource);
        }
        return;
    }

    WriteTextSummary(run, meanEdepPerSource, kEst, kErr, meanNu);
    WriteRegionFluxCsv(nSource);

    const G4int    nCap    = fCaptureCount.GetValue();
    const G4int    nOther  = fOtherAbsCount.GetValue();
    const G4int    nLeak   = fLeakCount.GetValue();
    const G4int    nAbs    = nFiss + nCap + nOther;
    const G4int    balRHS  = nAbs + nLeak;
    const G4int    resid   = nSource - balRHS;
    const G4double kInfAbs = nAbs > 0 ? G4double(nFissN) / nAbs : 0.0;
    const G4double alpha   = nFiss > 0 ? G4double(nCap) / nFiss : 0.0;
    const G4double thFissFr = nFiss > 0
                                  ? G4double(fThermalFiss.GetValue()) / nFiss : 0.0;
    const RegionVolumes volumes = ComputeRegionVolumes();
    const G4double fluxTotal = NormalizedIntegralFlux(
        fTrackLengthTotal.GetValue(), volumes.total, nSource);
    const G4double fluxFuel = NormalizedIntegralFlux(
        fTrackLengthFuel.GetValue(), volumes.fuel, nSource);
    const G4double fluxModerator = NormalizedIntegralFlux(
        fTrackLengthModerator.GetValue(), volumes.moderator, nSource);

    G4cout << "\n--------------------End of Run Summary--------------------\n"
           << "  Events processed        : " << nEvents << "\n"
           << "  Source neutrons         : " << nSource << "\n"
           << "  Neutron transport steps : " << fStepCount.GetValue() << "\n"
           << "  Fissions induced        : " << nFiss
           << "  (thermal " << fThermalFiss.GetValue()
           << " / fast " << fFastFiss.GetValue() << ")\n"
           << "  Fission neutrons (prod.): " << nFissN << "\n"
           << "  Mean nu (neutrons/fiss.): " << meanNu << "\n"
           << "  k (production/source)   : " << kEst << " +/- " << kErr << "\n"
           << "  k (batch mean +/- SE)   : " << kBatchMean << " +/- " << kBatchSem
           << "  (" << kRelErr * 100.0 << " %, " << nBatch << " batches)\n"
           << "  Wall time / FOM         : " << elapsedSec << " s / " << fom
           << "\n"
           << "  ........ Neutron balance ........\n"
           << "  Captures (n,gamma)      : " << nCap
           << "  (thermal " << fThermalCap.GetValue()
           << " / fast " << fFastCap.GetValue() << ")\n"
           << "  Other abs. (n,a)/(n,p)  : " << nOther
           << "  (boron etc.; thermal " << fThermalOtherAbs.GetValue()
           << " / fast " << fFastOtherAbs.GetValue() << ")\n"
           << "  Absorptions (c+f+other) : " << nAbs << "\n"
           << "  Leakage (escaped)       : " << nLeak << "\n"
           << "  Balance src=abs+leak    : " << nSource << " = " << balRHS
           << "  (residual " << resid << ")\n"
           << "  k_inf (prod./absorption): " << kInfAbs << "\n"
           << "  alpha (capture/fission) : " << alpha << "\n"
           << "  Thermal fission fraction: " << thFissFr << "\n"
           << "  Elastic / inelastic     : " << fElasticCount.GetValue()
           << " / " << fInelasticCount.GetValue() << "\n"
           << "  ................................\n"
           << "  Track length total      : " << fTrackLengthTotal.GetValue()
           << " mm\n"
           << "  Int. flux/src total     : " << fluxTotal << " 1/mm2\n"
           << "  Int. flux/src fuel/mod. : " << fluxFuel << " / "
           << fluxModerator << " 1/mm2\n"
           << "  Boundary crossings r/z  : " << fRadialBoundaryCrossings.GetValue()
           << " / " << fAxialBoundaryCrossings.GetValue() << "\n"
           << "  Boundary reflections    : " << fBoundaryReflections.GetValue()
           << "\n"
           << "  Total energy in fuel    : "
           << G4BestUnit(fEdepTotal.GetValue() * MeV, "Energy") << "\n"
           << "  Mean fuel edep/source   : "
           << G4BestUnit(meanEdepPerSource * MeV, "Energy") << "\n"
           << "  Thermalized neutrons    : " << fThermalCount.GetValue()
           << "  (E < 0.625 eV)\n"
           << "  ........ Materials ........\n"
           << "  Boron / enrichment      : "
           << Materials::GetInstance()->GetBoronPPM() << " ppm / "
           << Materials::GetInstance()->GetEnrichment() * 100.0 << " wt% U-235"
           << " (" << Materials::GetInstance()->GetU235AtomFraction() * 100.0
           << " atom%)\n"
           << "  Fuel / moderator rho    : "
           << Materials::GetInstance()->GetFuelDensity() / (g/cm3) << " / "
           << Materials::GetInstance()->GetModeratorDensity() / (g/cm3)
           << " g/cm3\n"
           << "  Fuel / moderator temp.  : "
           << Materials::GetInstance()->GetFuelTemperature() / kelvin << " K / "
           << Materials::GetInstance()->GetModeratorTemperature() / kelvin
           << " K\n"
           << "  ................................\n"
           << "  Output file             : " << fOutputFileName << "."
           << fOutputFileType << "\n"
           << "----------------------------------------------------------\n"
           << G4endl;
}

void RunAction::WriteTextSummary(const G4Run* run,
                                 G4double meanEdepPerSource,
                                 G4double kEst,
                                 G4double kErr,
                                 G4double meanNu) const {
    std::ofstream out(fOutputFileName + "_summary.txt");
    if (!out) return;

    out << std::setprecision(12);
    const RegionVolumes volumes = ComputeRegionVolumes();
    const G4int nSource = fSourceCount.GetValue();

    out << "events=" << run->GetNumberOfEvent() << "\n";
    out << "source_neutrons=" << nSource << "\n";
    out << "neutron_transport_steps=" << fStepCount.GetValue() << "\n";
    out << "fissions_induced=" << fFissionCount.GetValue() << "\n";
    out << "fission_neutrons_produced=" << fFissionNeutrons.GetValue() << "\n";
    out << "mean_nu=" << meanNu << "\n";
    out << "k_production_over_source=" << kEst << "\n";
    out << "k_uncertainty_1sigma=" << kErr << "\n";
    out << "k_uncertainty_1sigma_poisson=" << kErr << "\n";

    const G4int    nBatch     = fBatchCount.GetValue();
    const G4double kBatchMean = nBatch > 0 ? fSumK.GetValue() / nBatch : 0.0;
    G4double kBatchSem = 0.0;
    if (nBatch > 1) {
        const G4double meanK2 = fSumK2.GetValue() / nBatch;
        G4double var = (meanK2 - kBatchMean * kBatchMean)
                       * nBatch / (nBatch - 1.0);
        if (var < 0.0) var = 0.0;
        kBatchSem = std::sqrt(var / nBatch);
    }
    const G4double kRelErr = kBatchMean > 0.0 ? kBatchSem / kBatchMean : 0.0;
    const G4double elapsedSec = std::chrono::duration<G4double>(
        std::chrono::steady_clock::now() - fWallStart).count();
    const G4double fom = (kRelErr > 0.0 && elapsedSec > 0.0)
                             ? 1.0 / (kRelErr * kRelErr * elapsedSec) : 0.0;
    out << "k_batch_mean=" << kBatchMean << "\n";
    out << "k_batch_standard_error=" << kBatchSem << "\n";
    out << "k_relative_error=" << kRelErr << "\n";
    out << "n_batches=" << nBatch << "\n";
    out << "wall_time_seconds=" << elapsedSec << "\n";
    out << "figure_of_merit=" << fom << "\n";

    const G4int nFiss  = fFissionCount.GetValue();
    const G4int nCap   = fCaptureCount.GetValue();
    const G4int nOther = fOtherAbsCount.GetValue();
    const G4int nLeak  = fLeakCount.GetValue();
    const G4int nAbs   = nFiss + nCap + nOther;
    const G4int nSrc   = fSourceCount.GetValue();
    out << "captures=" << nCap << "\n";
    out << "captures_thermal=" << fThermalCap.GetValue() << "\n";
    out << "captures_fast=" << fFastCap.GetValue() << "\n";
    out << "other_absorptions=" << nOther << "\n";
    out << "other_absorptions_thermal=" << fThermalOtherAbs.GetValue() << "\n";
    out << "other_absorptions_fast=" << fFastOtherAbs.GetValue() << "\n";
    out << "fissions_thermal=" << fThermalFiss.GetValue() << "\n";
    out << "fissions_fast=" << fFastFiss.GetValue() << "\n";
    out << "absorptions=" << nAbs << "\n";
    out << "leakage=" << nLeak << "\n";
    out << "balance_residual=" << (nSrc - (nAbs + nLeak)) << "\n";
    out << "k_inf_prod_over_absorption="
        << (nAbs > 0 ? G4double(fFissionNeutrons.GetValue()) / nAbs : 0.0) << "\n";
    out << "alpha_capture_over_fission="
        << (nFiss > 0 ? G4double(nCap) / nFiss : 0.0) << "\n";
    out << "thermal_fission_fraction="
        << (nFiss > 0 ? G4double(fThermalFiss.GetValue()) / nFiss : 0.0) << "\n";
    out << "elastic_scatters=" << fElasticCount.GetValue() << "\n";
    out << "inelastic_scatters=" << fInelasticCount.GetValue() << "\n";
    out << "fuel_edep_MeV=" << fEdepTotal.GetValue() << "\n";
    out << "mean_fuel_edep_per_source_MeV=" << meanEdepPerSource << "\n";
    out << "thermalized_neutrons=" << fThermalCount.GetValue() << "\n";
    out << "track_length_total_mm=" << fTrackLengthTotal.GetValue() << "\n";
    out << "track_length_fuel_mm=" << fTrackLengthFuel.GetValue() << "\n";
    out << "track_length_moderator_mm=" << fTrackLengthModerator.GetValue() << "\n";
    out << "track_length_zircaloy_mm=" << fTrackLengthZircaloy.GetValue() << "\n";
    out << "track_length_gas_mm=" << fTrackLengthGas.GetValue() << "\n";
    out << "volume_total_mm3=" << ToMm3(volumes.total) << "\n";
    out << "volume_fuel_mm3=" << ToMm3(volumes.fuel) << "\n";
    out << "volume_moderator_mm3=" << ToMm3(volumes.moderator) << "\n";
    out << "volume_zircaloy_mm3=" << ToMm3(volumes.zircaloy) << "\n";
    out << "volume_gas_mm3=" << ToMm3(volumes.gas) << "\n";
    out << "integral_flux_total_per_source_1_per_mm2="
        << NormalizedIntegralFlux(fTrackLengthTotal.GetValue(), volumes.total, nSource)
        << "\n";
    out << "integral_flux_fuel_per_source_1_per_mm2="
        << NormalizedIntegralFlux(fTrackLengthFuel.GetValue(), volumes.fuel, nSource)
        << "\n";
    out << "integral_flux_moderator_per_source_1_per_mm2="
        << NormalizedIntegralFlux(fTrackLengthModerator.GetValue(), volumes.moderator, nSource)
        << "\n";
    out << "integral_flux_zircaloy_per_source_1_per_mm2="
        << NormalizedIntegralFlux(fTrackLengthZircaloy.GetValue(), volumes.zircaloy, nSource)
        << "\n";
    out << "integral_flux_gas_per_source_1_per_mm2="
        << NormalizedIntegralFlux(fTrackLengthGas.GetValue(), volumes.gas, nSource)
        << "\n";
    out << "radial_boundary_crossings=" << fRadialBoundaryCrossings.GetValue() << "\n";
    out << "axial_boundary_crossings=" << fAxialBoundaryCrossings.GetValue() << "\n";
    out << "boundary_reflections=" << fBoundaryReflections.GetValue() << "\n";
    out << "reflect_radial=" << (DetectorConstruction::ReflectRadial() ? 1 : 0) << "\n";
    out << "reflect_axial=" << (DetectorConstruction::ReflectAxial() ? 1 : 0) << "\n";

    const Materials* mat = Materials::GetInstance();
    out << "boron_ppm=" << mat->GetBoronPPM() << "\n";
    out << "enrichment_wt_u235=" << mat->GetEnrichment() << "\n";
    out << "enrichment_atom_u235=" << mat->GetU235AtomFraction() << "\n";
    out << "fuel_density_g_cm3=" << mat->GetFuelDensity() / (g/cm3) << "\n";
    out << "fuel_temperature_K=" << mat->GetFuelTemperature() / kelvin << "\n";
    out << "moderator_temperature_K=" << mat->GetModeratorTemperature() / kelvin << "\n";
    out << "moderator_density_g_cm3=" << mat->GetModeratorDensity() / (g/cm3) << "\n";
    out << "particle_hp_neglect_doppler="
        << (G4ParticleHPManager::GetInstance()->GetNeglectDoppler() ? 1 : 0)
        << "\n";

    const G4double eMin = 1.0e-9;
    const G4double eMax = 20.0;
    const G4int    nBins = 200;
    out << "flux_spectrum_energy_min_MeV=" << eMin << "\n";
    out << "flux_spectrum_energy_max_MeV=" << eMax << "\n";
    out << "flux_spectrum_nbins=" << nBins << "\n";
    out << "flux_spectrum_lethargy_bin_width="
        << std::log(eMax / eMin) / nBins << "\n";

    out << "output_histogram_file=" << fOutputFileName << "." << fOutputFileType << "\n";
}

void RunAction::WriteRegionFluxCsv(G4int nSource) const {
    const RegionVolumes volumes = ComputeRegionVolumes();

    std::ofstream out(fOutputFileName + "_region_flux.csv");
    if (!out) return;

    out << std::setprecision(12);
    out << "region,volume_mm3,track_length_mm,integral_flux_per_source_1_per_mm2\n";
    out << "total," << ToMm3(volumes.total) << ","
        << fTrackLengthTotal.GetValue() << ","
        << NormalizedIntegralFlux(fTrackLengthTotal.GetValue(), volumes.total, nSource)
        << "\n";
    out << "fuel," << ToMm3(volumes.fuel) << ","
        << fTrackLengthFuel.GetValue() << ","
        << NormalizedIntegralFlux(fTrackLengthFuel.GetValue(), volumes.fuel, nSource)
        << "\n";
    out << "moderator," << ToMm3(volumes.moderator) << ","
        << fTrackLengthModerator.GetValue() << ","
        << NormalizedIntegralFlux(fTrackLengthModerator.GetValue(), volumes.moderator, nSource)
        << "\n";
    out << "zircaloy," << ToMm3(volumes.zircaloy) << ","
        << fTrackLengthZircaloy.GetValue() << ","
        << NormalizedIntegralFlux(fTrackLengthZircaloy.GetValue(), volumes.zircaloy, nSource)
        << "\n";
    out << "gas," << ToMm3(volumes.gas) << ","
        << fTrackLengthGas.GetValue() << ","
        << NormalizedIntegralFlux(fTrackLengthGas.GetValue(), volumes.gas, nSource)
        << "\n";
}
