//===== File: src/FissionBank.cc =====
// BEAVRS PWR Assembly - Fission source bank implementation
//----------------------------------------------------------------------------
#include "FissionBank.hh"
#include "Constants.hh"

#include "G4SystemOfUnits.hh"
#include "Randomize.hh"

#include <algorithm>
#include <cmath>
#include <fstream>
#include <iomanip>

FissionBank& FissionBank::GetInstance() {
    static FissionBank instance;
    return instance;
}

void FissionBank::Enable(G4int inactiveCycles, G4int activeCycles) {
    fEnabled  = true;
    fInactive = inactiveCycles;
    fActive   = activeCycles;
    fCycle    = 0;
    fLastActive = false;
    fEntropy  = 0.0;
    fActiveN  = 0;
    fActiveSumK = 0.0;
    fActiveSumK2 = 0.0;
    {
        std::lock_guard<std::mutex> lock(fMutex);
        fDeposited.clear();
        fSource.clear();
    }
    {
        std::lock_guard<std::mutex> lock(fMapMutex);
        fPinPower.clear();
        fAxialPower.clear();
        fEnergyFlux.clear();
    }
    fHistory.clear();
}

void FissionBank::Deposit(const G4ThreeVector& pos, G4int nNeutrons) {
    if (nNeutrons <= 0) return;
    std::lock_guard<std::mutex> lock(fMutex);
    for (G4int i = 0; i < nNeutrons; ++i) fDeposited.push_back(pos);
}

G4bool FissionBank::SampleSource(G4ThreeVector& pos) const {
    const std::size_t n = fSource.size();
    if (n == 0) return false;
    std::size_t idx = static_cast<std::size_t>(G4UniformRand() * n);
    if (idx >= n) idx = n - 1;
    pos = fSource[idx];
    return true;
}

void FissionBank::EndOfGeneration(G4double kGeneration) {
    {
        std::lock_guard<std::mutex> lock(fMutex);
        fSource.swap(fDeposited);
        fDeposited.clear();
    }
    fEntropy = ComputeEntropy(fSource);

    ++fCycle;
    fLastActive = (fCycle > fInactive);
    if (fLastActive) {
        fActiveSumK  += kGeneration;
        fActiveSumK2 += kGeneration * kGeneration;
        ++fActiveN;
    }

    fHistory.push_back({fCycle, kGeneration, fEntropy, fLastActive,
                        fSource.size()});
}

G4double FissionBank::ActiveMeanK() const {
    return fActiveN > 0 ? fActiveSumK / fActiveN : 0.0;
}

G4double FissionBank::ActiveSemK() const {
    if (fActiveN < 2) return 0.0;
    const G4double mean = fActiveSumK / fActiveN;
    const G4double meanSq = fActiveSumK2 / fActiveN;
    G4double var = (meanSq - mean * mean) * fActiveN / (fActiveN - 1.0);
    if (var < 0.0) var = 0.0;
    return std::sqrt(var / fActiveN);
}

G4double FissionBank::ComputeEntropy(
    const std::vector<G4ThreeVector>& sites) const {
    using namespace BEAVRS;
    const std::size_t n = sites.size();
    if (n == 0) return 0.0;

    const G4double offset = (kNPins - 1) * kPinPitch / 2.0;
    std::vector<G4long> count(static_cast<std::size_t>(kNPins) * kNPins, 0);

    for (const auto& s : sites) {
        G4int i = static_cast<G4int>(std::lround((s.x() + offset) / kPinPitch));
        G4int j = static_cast<G4int>(std::lround((s.y() + offset) / kPinPitch));
        i = std::clamp(i, 0, kNPins - 1);
        j = std::clamp(j, 0, kNPins - 1);
        ++count[static_cast<std::size_t>(j) * kNPins + i];
    }

    G4double h = 0.0;
    const G4double invN = 1.0 / static_cast<G4double>(n);
    for (G4long c : count) {
        if (c == 0) continue;
        const G4double p = c * invN;
        h -= p * std::log2(p);
    }
    return h;
}

void FissionBank::WriteEigenSummary(const G4String& path) const {
    std::ofstream out(path);
    if (!out) return;

    out << std::setprecision(8);
    out << "# k-eigenvalue power iteration convergence history\n";
    out << "# columns: cycle  k_generation  shannon_entropy_bits  active  source_size\n";
    for (const auto& r : fHistory) {
        out << r.cycle << "  " << r.k << "  " << r.entropy << "  "
            << (r.active ? 1 : 0) << "  " << r.sourceSize << "\n";
    }
    out << "inactive_cycles=" << fInactive << "\n";
    out << "active_cycles=" << fActiveN << "\n";
    out << "k_eff=" << ActiveMeanK() << "\n";
    out << "k_eff_standard_error=" << ActiveSemK() << "\n";
    out << "max_shannon_entropy_bits="
        << std::log2(static_cast<double>(BEAVRS::kNPins) * BEAVRS::kNPins) << "\n";
}

void FissionBank::ScorePinPower(G4int col, G4int row, G4int gridRes, G4double edepMeV) {
    if (col < 0 || col >= gridRes || row < 0 || row >= gridRes) return;
    std::lock_guard<std::mutex> lock(fMapMutex);
    const std::size_t N = gridRes + 2;
    if (fPinPower.size() != N * N) {
        fPinPower.assign(N * N, 0.0);
    }
    const std::size_t idx = (row + 1) * N + (col + 1);
    fPinPower[idx] += edepMeV;
}

void FissionBank::ScoreAxialPower(G4int bin, G4int nBins, G4double edepMeV) {
    if (bin < 0 || bin >= nBins) return;
    std::lock_guard<std::mutex> lock(fMapMutex);
    const std::size_t total = nBins + 2;
    if (fAxialPower.size() != total) {
        fAxialPower.assign(total, 0.0);
    }
    fAxialPower[bin + 1] += edepMeV;
}

void FissionBank::ScoreEnergyFlux(G4int bin, G4double trackLengthMm) {
    if (bin < 0 || bin >= 200) return;
    std::lock_guard<std::mutex> lock(fMapMutex);
    const std::size_t total = 202;
    if (fEnergyFlux.size() != total) {
        fEnergyFlux.assign(total, 0.0);
    }
    fEnergyFlux[bin + 1] += trackLengthMm;
}

void FissionBank::WriteCsvOutputs(const G4String& prefix, G4int gridRes, G4double activeHeightCm) const {
    std::lock_guard<std::mutex> lock(fMapMutex);

    {
        const G4String pinPath = prefix + "_h2_edep_fuel_pin_map.csv";
        std::ofstream out(pinPath);
        if (out.is_open()) {
            const G4int N = gridRes + 2;
            out << "#class tools::histo::h2d\n";
            out << "#title Fuel pin energy deposition map;Column;Row;Energy [MeV]\n";
            out << "#dimension 2\n";
            out << "#axis fixed " << gridRes << " -0.5 " << (gridRes - 0.5) << "\n";
            out << "#axis fixed " << gridRes << " -0.5 " << (gridRes - 0.5) << "\n";
            out << "#planes_Sxyw 0\n";
            out << "#annotation axis_x.title \n";
            out << "#annotation axis_y.title \n";
            out << "#bin_number " << (N * N) << "\n";
            out << "entries,Sw,Sw2,Sxw0,Sx2w0,Sxw1,Sx2w1\n";

            for (G4int i = 0; i < N * N; ++i) {
                G4double val = (i < (G4int)fPinPower.size()) ? fPinPower[i] : 0.0;
                out << (val > 0.0 ? 1 : 0) << "," << val << ",0,0,0,0,0\n";
            }
        }
    }

    {
        const G4String axialPath = prefix + "_h1_edep_fuel_z.csv";
        std::ofstream out(axialPath);
        if (out.is_open()) {
            const G4double halfH = activeHeightCm / 2.0;
            out << "#class tools::histo::h1d\n";
            out << "#title Axial fuel energy deposition;z [cm];Energy [MeV]\n";
            out << "#dimension 1\n";
            out << "#axis fixed 100 -" << halfH << " " << halfH << "\n";
            out << "#annotation axis_x.title \n";
            out << "#bin_number 102\n";
            out << "entries,Sw,Sw2,Sxw0,Sx2w0\n";

            for (G4int i = 0; i < 102; ++i) {
                G4double val = (i < (G4int)fAxialPower.size()) ? fAxialPower[i] : 0.0;
                out << (val > 0.0 ? 1 : 0) << "," << val << ",0,0,0\n";
            }
        }
    }

    {
        const G4String specPath = prefix + "_h1_flux_E.csv";
        std::ofstream out(specPath);
        if (out.is_open()) {
            out << "#class tools::histo::h1d\n";
            out << "#title Neutron flux spectrum;E [MeV];Track length [mm]\n";
            out << "#dimension 1\n";
            out << "#axis edges";
            const G4double E_min = 1.0e-9;
            const G4double E_max = 20.0;
            const G4double logMin = std::log10(E_min);
            const G4double logMax = std::log10(E_max);
            for (G4int i = 0; i <= 200; ++i) {
                G4double logE = logMin + (logMax - logMin) * i / 200.0;
                out << " " << std::pow(10.0, logE);
            }
            out << "\n";
            out << "#annotation axis_x.title \n";
            out << "#bin_number 202\n";
            out << "entries,Sw,Sw2,Sxw0,Sx2w0\n";

            for (G4int i = 0; i < 202; ++i) {
                G4double val = (i < (G4int)fEnergyFlux.size()) ? fEnergyFlux[i] : 0.0;
                out << (val > 0.0 ? 1 : 0) << "," << val << ",0,0,0\n";
            }
        }
    }
}
