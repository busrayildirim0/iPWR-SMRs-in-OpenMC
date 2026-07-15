FROM mambaorg/micromamba:latest

# Switch to root to install system dependencies
USER root

# Install system dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install OpenMC and Python web packages in the base environment using micromamba.
# micromamba is a statically linked executable, preventing dynamic library corruption (like libxml2) during upgrades.
RUN micromamba install -y -n base -c conda-forge \
    openmc \
    fastapi \
    uvicorn \
    pandas \
    numpy \
    h5py \
    aiofiles \
    && micromamba clean --all --yes

# Set work directory
WORKDIR /app

# Copy application files (leveraging .dockerignore)
COPY platform/backend /app/platform/backend
COPY platform/frontend/dist /app/platform/frontend/dist

# Set default environment variable for cross sections (can be overridden at runtime)
ENV OPENMC_CROSS_SECTIONS=/data/endfb-vii.1-hdf5/cross_sections.xml

# Change directory to backend to run the server
WORKDIR /app/platform/backend

# Expose port 8000
EXPOSE 8000

# Start FastAPI server inside the activated micromamba base environment
CMD ["micromamba", "run", "-n", "base", "python", "main.py"]
