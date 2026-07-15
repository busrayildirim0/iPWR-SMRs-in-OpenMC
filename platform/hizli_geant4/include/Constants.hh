//===== File: include/Constants.hh =====
// BEAVRS 2.0.2 Geometry Constants
// All dimensions in cm (converted to Geant4 mm internally where needed)
//----------------------------------------------------------------------------
#ifndef CONSTANTS_HH
#define CONSTANTS_HH

#include "G4SystemOfUnits.hh"

namespace BEAVRS {

constexpr G4double kPinPitch       = 1.25984 * cm;
constexpr G4double kAssemblyPitch  = 21.50364 * cm;
constexpr G4int    kNPins          = 17;

constexpr G4double kBoronPPM         = 975.0;
constexpr G4double kModeratorDensity = 0.740582 * g/cm3;
constexpr G4double kModeratorTemp    = 566.5 * kelvin;

constexpr G4double kFuelTemp         = 900.0 * kelvin;
constexpr G4double kFuelDensity      = 10.42 * g/cm3;
constexpr G4double kEnrichment       = 0.031;

constexpr G4double kActiveFuelH    = 365.76 * cm;

constexpr G4double kFuelRadius     = 0.39218 * cm;
constexpr G4double kGapOuterR      = 0.40005 * cm;
constexpr G4double kCladOuterR     = 0.45720 * cm;

constexpr G4double kGTInnerR       = 0.56134 * cm;
constexpr G4double kGTOuterR       = 0.60198 * cm;

constexpr G4double kITAirInnerR    = 0.43688 * cm;
constexpr G4double kITThimbleOuterR = 0.48387 * cm;
constexpr G4double kITWaterOuterR  = 0.56134 * cm;
constexpr G4double kITOuterR       = 0.60198 * cm;

constexpr G4double kCellHalfXY     = kPinPitch / 2.0;
constexpr G4double kCellHalfZ      = kActiveFuelH / 2.0;
constexpr G4double kAssemblyHalfXY = kAssemblyPitch / 2.0;
constexpr G4double kAssemblyHalfZ  = kActiveFuelH / 2.0;

}

#endif
