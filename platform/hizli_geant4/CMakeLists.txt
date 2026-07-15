#----------------------------------------------------------------------------
# BEAVRS PWR 17x17 Fuel Assembly - Geant4 Project
# CMakeLists.txt
#----------------------------------------------------------------------------
cmake_minimum_required(VERSION 3.16...3.27)
project(beavrs_assembly VERSION 1.0.0 LANGUAGES CXX)

#----------------------------------------------------------------------------
# C++ standard (Geant4 11.x requires C++17)
#----------------------------------------------------------------------------
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

#----------------------------------------------------------------------------
# Find Geant4 package, activating all available UI and Vis drivers by default.
#----------------------------------------------------------------------------
option(WITH_GEANT4_UIVIS "Build with Geant4 UI and Vis drivers" ON)
if(WITH_GEANT4_UIVIS)
  find_package(Geant4 REQUIRED ui_all vis_all)
else()
  find_package(Geant4 REQUIRED)
endif()

#----------------------------------------------------------------------------
# Setup Geant4 include directories and compile definitions
#----------------------------------------------------------------------------
include(${Geant4_USE_FILE})

#----------------------------------------------------------------------------
# Option for overlap checking at runtime
#----------------------------------------------------------------------------
option(ENABLE_OVERLAP_CHECK "Enable geometry overlap checking" OFF)
if(ENABLE_OVERLAP_CHECK)
  add_compile_definitions(ENABLE_OVERLAP_CHECK)
endif()

#----------------------------------------------------------------------------
# Locate sources and headers
#----------------------------------------------------------------------------
include_directories(${PROJECT_SOURCE_DIR}/include)

file(GLOB headers CONFIGURE_DEPENDS ${PROJECT_SOURCE_DIR}/include/*.hh)
file(GLOB sources CONFIGURE_DEPENDS ${PROJECT_SOURCE_DIR}/src/*.cc)

#----------------------------------------------------------------------------
# Add the executable, linking to Geant4 libraries
#----------------------------------------------------------------------------
add_executable(beavrs_assembly main.cc ${sources} ${headers})
target_link_libraries(beavrs_assembly ${Geant4_LIBRARIES})
if(WITH_GEANT4_UIVIS)
  target_compile_definitions(beavrs_assembly PRIVATE WITH_GEANT4_UIVIS)
endif()

#----------------------------------------------------------------------------
# Copy macro files to build directory
#----------------------------------------------------------------------------
set(BEAVRS_MACROS
  macros/vis.mac
  macros/run.mac
  macros/smoke.mac
  macros/eigen.mac
  macros/eigen_hi.mac
  macros/nuscale.mac
  macros/mpower.mac
  macros/smr160.mac
  macros/carem25.mac
  macros/eigen_fast.mac
  macros/nuscale_fast.mac
  macros/mpower_fast.mac
  macros/smr160_fast.mac
  macros/carem25_fast.mac
  macros/eigen_ultra.mac
  macros/nuscale_ultra.mac
  macros/mpower_ultra.mac
  macros/smr160_ultra.mac
  macros/carem25_ultra.mac
)

foreach(_macro ${BEAVRS_MACROS})
  configure_file(
    ${PROJECT_SOURCE_DIR}/${_macro}
    ${PROJECT_BINARY_DIR}/${_macro}
    COPYONLY
  )
endforeach()

#----------------------------------------------------------------------------
# Install target
#----------------------------------------------------------------------------
install(TARGETS beavrs_assembly DESTINATION bin)

#----------------------------------------------------------------------------
# Basic runtime smoke test
#----------------------------------------------------------------------------
enable_testing()
add_test(
  NAME smoke
  COMMAND beavrs_assembly -m macros/smoke.mac
)
set_tests_properties(smoke PROPERTIES
  WORKING_DIRECTORY ${PROJECT_BINARY_DIR}
  ENVIRONMENT "G4FORCENUMBEROFTHREADS=1"
)

# Physics sanity check on the smoke output (neutron balance + k range).
# Added only when a Python 3 interpreter is available.
find_package(Python3 COMPONENTS Interpreter QUIET)
if(Python3_Interpreter_FOUND)
  add_test(
    NAME smoke_physics_check
    COMMAND ${Python3_EXECUTABLE}
            ${PROJECT_SOURCE_DIR}/scripts/check_summary.py
            ${PROJECT_BINARY_DIR}/smoke_output_summary.txt
            --kmin 0.0 --kmax 3.0 --balance-tol 0.05
  )
  set_tests_properties(smoke_physics_check PROPERTIES DEPENDS smoke)
endif()
