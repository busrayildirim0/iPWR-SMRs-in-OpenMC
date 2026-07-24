FROM mambaorg/micromamba:latest

USER root

# Install system utilities and C++ build chain (gcc, g++, make, cmake)
RUN apt-get update && apt-get install -y \
    build-essential \
    cmake \
    make \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Configure micromamba for higher timeouts and retries due to large geant4 data files
RUN micromamba config set connection_timeout 300 && \
    micromamba config set max_retries 10

# Install OpenMC, Geant4 and Python dependencies via micromamba
RUN micromamba install -y -n base -c conda-forge \
    openmc \
    geant4 \
    fastapi \
    uvicorn \
    pandas \
    numpy \
    h5py \
    aiofiles \
    && micromamba clean --all --yes

# Set workdir
WORKDIR /app

# Copy C++ source and backend code
COPY platform/hizli_geant4 /app/platform/hizli_geant4
COPY platform/backend /app/platform/backend

# Compile Geant4 target inside the container (Headless mode)
WORKDIR /app/platform/hizli_geant4
RUN mkdir -p build && cd build && \
    micromamba run -n base cmake -DWITH_GEANT4_UIVIS=OFF -DCMAKE_PREFIX_PATH=/opt/conda .. && \
    micromamba run -n base make -j$(nproc)

# Copy built executable to backend run directory (or verify it can be run)
RUN cp build/beavrs_assembly /app/platform/hizli_geant4/beavrs_assembly

# Set runtime settings
WORKDIR /app/platform/backend
ENV DOCKER_ENV=1
ENV GEANT4_EXE=/app/platform/hizli_geant4/beavrs_assembly
ENV OPENMC_CROSS_SECTIONS=/data/endfb-vii.1-hdf5/cross_sections.xml
EXPOSE 8000

CMD ["micromamba", "run", "-n", "base", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
