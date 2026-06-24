import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Play, Settings, BarChart2, Layers, Cpu, FileText, Database, 
  Terminal, Shield, Compass, RefreshCw, Download, AlertTriangle, Eye 
} from 'lucide-react';
import AssemblyVisualizer from './AssemblyVisualizer';
import PlotlyChart from './PlotlyChart';

const API_BASE_URL = ''; // Relative since backend will serve frontend, or standard dev server proxy

const getSimplifiedLogs = (rawLogs) => {
  if (!rawLogs) return '';
  const lines = rawLogs.split('\n');
  const filtered = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    
    // Check if it's our custom API step message
    if (trimmed.startsWith('Generating') || 
        trimmed.startsWith('Starting') || 
        trimmed.startsWith('Simulation finished') || 
        trimmed.startsWith('Job completed') ||
        trimmed.startsWith('Error: OpenMC') ||
        trimmed.includes('Exception occurred') ||
        trimmed.includes('Run Directory') ||
        trimmed.includes('Command')) {
      filtered.push(line);
      continue;
    }
    
    // Keep OpenMC version header details
    if (trimmed.includes('OpenMC v') || trimmed.includes('Copyright') || trimmed.includes('Git SHA1')) {
      filtered.push(line);
      continue;
    }
    
    // Exclude noisy nuclide-specific cross section loading
    if (trimmed.startsWith('Reading') && (trimmed.includes('from') || trimmed.includes('XS'))) {
      if (trimmed.includes('settings.xml') || trimmed.includes('geometry.xml') || trimmed.includes('materials.xml') || trimmed.includes('tallies.xml')) {
        filtered.push(line);
      }
      continue;
    }
    
    // Exclude loading thermal scatter/nuclide data
    if (trimmed.startsWith('Loading') || trimmed.startsWith('Pre-calculating') || trimmed.startsWith('Building') || trimmed.startsWith('Creating')) {
      if (trimmed.includes('statepoint')) {
        filtered.push(line);
      }
      continue;
    }
    
    // Include simulation progress, results, warnings, errors
    if (trimmed.includes('Simulating batch') ||
        trimmed.includes('k-effective =') ||
        trimmed.includes('Average k-effective') ||
        trimmed.includes('Combined k-effective') ||
        trimmed.includes('entropy =') ||
        trimmed.includes('Calculation Rate:') ||
        trimmed.toLowerCase().includes('error') ||
        trimmed.toLowerCase().includes('warning') ||
        trimmed.startsWith('===') ||
        trimmed.startsWith('---') ||
        trimmed.includes('reaction rates') ||
        trimmed.includes('Elapsed time') ||
        trimmed.includes('total batches')) {
      filtered.push(line);
    }
  }
  return filtered.join('\n');
};

export default function Dashboard() {
  // Preset list
  const [presets, setPresets] = useState({});
  const [activePreset, setActivePreset] = useState('NuScale');
  
  // Custom SMR Parameters
  const [params, setParams] = useState({
    lattice_type: 'Square',
    active_height: 200.0,
    pin_pitch: 1.25984,
    fuel_radius: 0.39218,
    gap_radius: 0.40005,
    clad_radius: 0.45720,
    gt_inner_radius: 0.56134,
    gt_outer_radius: 0.60198,
    enrichment: 4.5,
    soluble_boron: 975.0,
    clad_material: 'Zircaloy4',
    poison_enabled: false,
    poison_fraction: 2.0,
    control_rod_state: 'Fully Withdrawn',
    control_rod_material: 'Ag-In-Cd',
    particles: 10000,
    batches: 50,
    inactive_batches: 10,
    temperature: 566.5
  });

  // Config tab state
  const [configTab, setConfigTab] = useState('geometry'); // 'geometry', 'materials', 'simulation'
  
  // Platform tab state
  const [mainTab, setMainTab] = useState('simulation'); // 'simulation', 'dataset'
  
  // Overlay view state for AssemblyVisualizer
  const [activeOverlay, setActiveOverlay] = useState('none'); // 'none', 'power', 'flux', 'absorption'
  
  // Simulation execution state
  const [jobId, setJobId] = useState(null);
  const [jobStatus, setJobStatus] = useState('idle'); // 'idle', 'generating', 'running', 'parsing', 'completed', 'failed'
  const [simulationLogs, setSimulationLogs] = useState('');
  const [simplifyLogs, setSimplifyLogs] = useState(true);
  const [simulationResults, setSimulationResults] = useState(null);
  
  // Dataset Generation state
  const [datasetParams, setDatasetParams] = useState({
    enrichment_min: 2.0,
    enrichment_max: 5.0,
    enrichment_steps: 3,
    boron_min: 0,
    boron_max: 2000,
    boron_steps: 3,
    pitch_min: 1.20,
    pitch_max: 1.35,
    pitch_steps: 3
  });
  const [datasetStatus, setDatasetStatus] = useState({
    active: false,
    total_cases: 0,
    completed_cases: 0,
    current_params: {}
  });

  // Ref for log console auto-scrolling
  const logConsoleRef = useRef(null);

  // Fetch SMR Presets on mount
  useEffect(() => {
    fetch('/api/presets')
      .then(res => res.json())
      .then(data => {
        setPresets(data);
        if (data.NuScale) {
          setParams(data.NuScale);
        }
      })
      .catch(err => console.error("Error loading presets:", err));
  }, []);

  // Poll dataset generator status periodically
  useEffect(() => {
    let interval = null;
    if (mainTab === 'dataset' || datasetStatus.active) {
      const checkStatus = () => {
        fetch('/api/dataset/status')
          .then(res => res.json())
          .then(data => {
            setDatasetStatus(data);
            if (!data.active && datasetStatus.active) {
              // Just finished
              alert("Dataset Generation completed!");
            }
          })
          .catch(err => console.error("Error checking dataset status:", err));
      };
      
      checkStatus();
      interval = setInterval(checkStatus, 3000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [mainTab, datasetStatus.active]);

  // Handle Preset selection change
  const handlePresetChange = (name) => {
    setActivePreset(name);
    if (name === 'Custom') return;
    if (presets[name]) {
      setParams(presets[name]);
      // Adjust overlay if switching presets
      setActiveOverlay('none');
    }
  };

  // Handle individual parameter change
  const handleParamChange = (key, val) => {
    setParams(prev => {
      const next = { ...prev, [key]: val };
      // Keep active preset to 'Custom' if user modifies fields
      setActivePreset('Custom');
      return next;
    });
  };

  // Run SMR Simulation
  const triggerSimulation = () => {
    setJobStatus('pending');
    setSimulationLogs('Starting job request...\n');
    setSimulationResults(null);
    setActiveOverlay('none');
    
    fetch('/api/simulate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params)
    })
      .then(res => {
        if (!res.ok) throw new Error("Server error starting simulation");
        return res.json();
      })
      .then(data => {
        setJobId(data.job_id);
        startPollingJob(data.job_id);
      })
      .catch(err => {
        setJobStatus('failed');
        setSimulationLogs(prev => prev + `Error launching simulation: ${err.message}\n`);
      });
  };

  // Poll active simulation logs and status
  const startPollingJob = (id) => {
    let logInterval = null;
    let statusInterval = null;

    const pollLogs = () => {
      fetch(`/api/job/${id}/logs`)
        .then(res => res.json())
        .then(data => {
          setSimulationLogs(data.logs);
          // Scroll to bottom
          if (logConsoleRef.current) {
            logConsoleRef.current.scrollTop = logConsoleRef.current.scrollHeight;
          }
        })
        .catch(err => console.error("Error fetching logs:", err));
    };

    const pollStatus = () => {
      fetch(`/api/job/${id}/status`)
        .then(res => res.json())
        .then(data => {
          setJobStatus(data.status);
          if (data.status === 'completed') {
            clearInterval(logInterval);
            clearInterval(statusInterval);
            pollLogs();
            fetchResults(id);
          } else if (data.status === 'failed') {
            clearInterval(logInterval);
            clearInterval(statusInterval);
            pollLogs();
          }
        })
        .catch(err => {
          console.error("Error checking job status:", err);
          clearInterval(logInterval);
          clearInterval(statusInterval);
          setJobStatus('failed');
        });
    };

    logInterval = setInterval(pollLogs, 1000);
    statusInterval = setInterval(pollStatus, 1500);
  };

  // Fetch parsed simulation results
  const fetchResults = (id) => {
    fetch(`/api/job/${id}/results`)
      .then(res => res.json())
      .then(data => {
        setSimulationResults(data);
        setActiveOverlay('power'); // Set to power overlay by default
      })
      .catch(err => {
        console.error("Error loading results:", err);
        setSimulationLogs(prev => prev + `\nParsing results failed: ${err.message}\n`);
      });
  };

  // Launch Background Dataset Generator
  const triggerDatasetGeneration = () => {
    const dParams = {
      ...datasetParams,
      base_params: params
    };
    
    fetch('/api/dataset/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dParams)
    })
      .then(res => res.json())
      .then(data => {
        setDatasetStatus(prev => ({
          ...prev,
          active: true,
          total_cases: 100, // placeholder, will refresh on poll
          completed_cases: 0
        }));
      })
      .catch(err => alert("Error starting dataset generation: " + err.message));
  };

  // Stop dataset generation
  const stopDatasetGeneration = () => {
    fetch('/api/dataset/stop', { method: 'POST' })
      .then(res => res.json())
      .then(data => {
        alert("Stopping dataset generation. Please wait for the current case to finish.");
      });
  };

  // Export report as PDF (via Browser Print)
  const exportPDFReport = () => {
    window.print();
  };

  // ----------------------------------------------------
  // Scientific plots layout config (Plotly)
  // ----------------------------------------------------
  const energySpectrumPlot = useMemo(() => {
    if (!simulationResults?.energy_spectrum_centers) return null;
    
    return {
      data: [{
        x: simulationResults.energy_spectrum_centers,
        y: simulationResults.energy_spectrum_flux,
        type: 'scatter',
        mode: 'lines',
        name: 'Neutron Flux',
        line: { color: '#38bdf8', width: 2 }
      }],
      layout: {
        title: 'Neutron Energy Spectrum (Flux vs. Energy)',
        xaxis: {
          title: 'Energy (eV)',
          type: 'log',
          gridcolor: '#1e293b'
        },
        yaxis: {
          title: 'Flux (neutrons/cm²-s)',
          type: 'log',
          gridcolor: '#1e293b'
        },
        margin: { l: 60, r: 20, t: 40, b: 50 },
        height: 280
      }
    };
  }, [simulationResults]);

  const entropyPlot = useMemo(() => {
    if (!simulationResults?.shannon_entropy) return null;
    
    return {
      data: [{
        y: simulationResults.shannon_entropy,
        type: 'scatter',
        mode: 'lines+markers',
        name: 'Entropy',
        line: { color: '#c084fc', width: 2 },
        marker: { size: 4, color: '#a855f7' }
      }],
      layout: {
        title: 'Shannon Entropy (Source Convergence)',
        xaxis: { title: 'Batch (Generation)', gridcolor: '#1e293b' },
        yaxis: { title: 'Entropy H', gridcolor: '#1e293b' },
        margin: { l: 50, r: 20, t: 40, b: 40 },
        height: 240
      }
    };
  }, [simulationResults]);

  const keffPlot = useMemo(() => {
    if (!simulationResults?.batch_keff) return null;
    
    return {
      data: [{
        y: simulationResults.batch_keff,
        type: 'scatter',
        mode: 'lines',
        name: 'Batch k-eff',
        line: { color: '#34d399', width: 1.5 }
      }],
      layout: {
        title: 'Batch-by-Batch k-effective Evolution',
        xaxis: { title: 'Batch', gridcolor: '#1e293b' },
        yaxis: { title: 'k-eff', gridcolor: '#1e293b' },
        margin: { l: 50, r: 20, t: 40, b: 40 },
        height: 240
      }
    };
  }, [simulationResults]);

  // Spatial heatmap plot config (Plotly)
  const fineMapPlot = useMemo(() => {
    if (!simulationResults || activeOverlay === 'none') return null;
    
    let zData = null;
    let title = '';
    let colorscale = 'Inferno';
    
    if (activeOverlay === 'power' && simulationResults.pin_power_map) {
      zData = simulationResults.pin_power_map;
      title = 'Pin-by-Pin Power Map (kappa-fission)';
    } else if (activeOverlay === 'flux' && simulationResults.flux_map) {
      zData = simulationResults.flux_map;
      title = 'Neutron Flux 2D Distribution';
      colorscale = 'Viridis';
    } else if (activeOverlay === 'absorption' && simulationResults.absorption_map) {
      zData = simulationResults.absorption_map;
      title = 'Neutron Absorption Rate Map';
      colorscale = 'Hot';
    }
    
    if (!zData) return null;
    
    return {
      data: [{
        z: zData,
        type: 'heatmap',
        colorscale: colorscale,
        showscale: true,
        colorbar: { thickness: 15, len: 0.9 }
      }],
      layout: {
        title: title,
        xaxis: { title: 'X-Index', gridcolor: '#1e293b' },
        yaxis: { title: 'Y-Index', gridcolor: '#1e293b' },
        margin: { l: 50, r: 20, t: 40, b: 40 },
        height: 380
      }
    };
  }, [simulationResults, activeOverlay]);

  return (
    <div className="min-h-screen flex flex-col bg-[#0b0f19]">
      {/* Platform Header */}
      <header className="app-header">
        <div className="app-title-group">
          <Shield className="w-8 h-8 text-sky-400" />
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-100">OpenMC SMR Neutronics Platform</h1>
            <p className="text-xs text-slate-400">Civilian SMR Fuel Assembly Parametric Simulation Dashboard</p>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          {/* Main platform Mode tabs */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-lg p-1 flex gap-1">
            <button 
              className={`px-4 py-1.5 rounded-md text-xs font-semibold flex items-center gap-2 transition-all ${mainTab === 'simulation' ? 'bg-sky-500 text-slate-950 shadow-md' : 'text-slate-400 hover:text-slate-200'}`}
              onClick={() => setMainTab('simulation')}
            >
              <Cpu className="w-3.5 h-3.5" /> Simulation
            </button>
            <button 
              className={`px-4 py-1.5 rounded-md text-xs font-semibold flex items-center gap-2 transition-all ${mainTab === 'dataset' ? 'bg-sky-500 text-slate-950 shadow-md' : 'text-slate-400 hover:text-slate-200'}`}
              onClick={() => setMainTab('dataset')}
            >
              <Database className="w-3.5 h-3.5" /> Dataset Gen
            </button>
          </div>
          
          <div className="app-badge flex items-center gap-1.5 border border-sky-500/20 bg-sky-500/5 px-3 py-1.5 rounded-lg text-xs font-semibold text-sky-400">
            <Compass className="w-4 h-4 animate-spin-slow" /> OpenMC 0.15.3 WSL Active
          </div>
        </div>
      </header>

      {/* Main Grid Section */}
      <main className="dashboard-grid flex-1 w-full max-w-[1800px] gap-6 p-6">
        
        {/* Left Parameter configurator Panel */}
        <section className="panel flex flex-col gap-6 h-fit max-h-[85vh] overflow-y-auto">
          <div className="panel-header">
            <h2 className="panel-title"><Settings className="w-4 h-4 text-sky-400" /> Assembly Configurator</h2>
            <select
              value={activePreset}
              onChange={(e) => handlePresetChange(e.target.value)}
              className="bg-slate-900 border border-slate-800 rounded px-2.5 py-1 text-xs text-sky-400 font-semibold"
            >
              <option value="NuScale">NuScale Preset</option>
              <option value="SMR-160">SMR-160 Preset</option>
              <option value="CAREM-25">CAREM-25 Preset</option>
              <option value="mPower">mPower Preset</option>
              <option value="Custom">Custom / Modified</option>
            </select>
          </div>

          {/* Config sub-tabs */}
          <div className="flex border-b border-slate-800 pb-1 gap-2">
            <button
              onClick={() => setConfigTab('geometry')}
              className={`flex-1 pb-2 text-center text-xs font-bold transition-all ${configTab === 'geometry' ? 'border-b-2 border-sky-400 text-sky-400' : 'text-slate-500 hover:text-slate-400'}`}
            >
              Geometry
            </button>
            <button
              onClick={() => setConfigTab('materials')}
              className={`flex-1 pb-2 text-center text-xs font-bold transition-all ${configTab === 'materials' ? 'border-b-2 border-sky-400 text-sky-400' : 'text-slate-500 hover:text-slate-400'}`}
            >
              Materials
            </button>
            <button
              onClick={() => setConfigTab('simulation')}
              className={`flex-1 pb-2 text-center text-xs font-bold transition-all ${configTab === 'simulation' ? 'border-b-2 border-sky-400 text-sky-400' : 'text-slate-500 hover:text-slate-400'}`}
            >
              Simulation
            </button>
          </div>

          {/* Tab parameters details */}
          <div className="flex-1 flex flex-col gap-4">
            {configTab === 'geometry' && (
              <>
                <div className="form-group">
                  <label className="form-label">Lattice Matrix Type</label>
                  <select
                    value={params.lattice_type}
                    onChange={(e) => handleParamChange('lattice_type', e.target.value)}
                    className="form-select text-slate-200"
                  >
                    <option value="Square">Square Lattice (17x17)</option>
                    <option value="Hexagonal">Hexagonal Lattice (127-pin)</option>
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="form-group">
                    <label className="form-label">Active Height (cm)</label>
                    <input
                      type="number"
                      value={params.active_height}
                      onChange={(e) => handleParamChange('active_height', parseFloat(e.target.value))}
                      className="form-control"
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Pin Pitch (cm)</label>
                    <input
                      type="number"
                      step="0.001"
                      value={params.pin_pitch}
                      onChange={(e) => handleParamChange('pin_pitch', parseFloat(e.target.value))}
                      className="form-control"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 border-t border-slate-800/60 pt-4">
                  <div className="form-group">
                    <label className="form-label">Pellet Radius (cm)</label>
                    <input
                      type="number"
                      step="0.0001"
                      value={params.fuel_radius}
                      onChange={(e) => handleParamChange('fuel_radius', parseFloat(e.target.value))}
                      className="form-control"
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Clad Outer Rad (cm)</label>
                    <input
                      type="number"
                      step="0.0001"
                      value={params.clad_radius}
                      onChange={(e) => handleParamChange('clad_radius', parseFloat(e.target.value))}
                      className="form-control"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 border-t border-slate-800/60 pt-4">
                  <div className="form-group">
                    <label className="form-label">Guide Tube Inner (cm)</label>
                    <input
                      type="number"
                      step="0.0001"
                      value={params.gt_inner_radius}
                      onChange={(e) => handleParamChange('gt_inner_radius', parseFloat(e.target.value))}
                      className="form-control"
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Guide Tube Outer (cm)</label>
                    <input
                      type="number"
                      step="0.0001"
                      value={params.gt_outer_radius}
                      onChange={(e) => handleParamChange('gt_outer_radius', parseFloat(e.target.value))}
                      className="form-control"
                    />
                  </div>
                </div>
              </>
            )}

            {configTab === 'materials' && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div className="form-group">
                    <label className="form-label">U-235 Enrichment (%)</label>
                    <input
                      type="number"
                      step="0.1"
                      min="2.0"
                      max="5.0"
                      value={params.enrichment}
                      onChange={(e) => handleParamChange('enrichment', parseFloat(e.target.value))}
                      className="form-control"
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Boron Conc. (ppm)</label>
                    <input
                      type="number"
                      step="1"
                      min="0"
                      max="2000"
                      value={params.soluble_boron}
                      onChange={(e) => handleParamChange('soluble_boron', parseFloat(e.target.value))}
                      className="form-control"
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Cladding Material</label>
                  <select
                    value={params.clad_material}
                    onChange={(e) => handleParamChange('clad_material', e.target.value)}
                    className="form-select text-slate-200"
                  >
                    <option value="Zircaloy4">Zircaloy-4 (Standard PWR)</option>
                    <option value="M5">Alloy M5 (Advanced Zr-Nb)</option>
                    <option value="Q12">Q12 Cladding</option>
                  </select>
                </div>

                <div className="border-t border-slate-800/60 pt-4 flex flex-col gap-4">
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      id="poison_enabled"
                      checked={params.poison_enabled}
                      onChange={(e) => handleParamChange('poison_enabled', e.target.checked)}
                      className="w-4 h-4 rounded text-sky-400 bg-slate-900 border-slate-800"
                    />
                    <label htmlFor="poison_enabled" className="text-xs font-semibold text-slate-300">
                      Enable Burnable Poison (Gd₂O₃)
                    </label>
                  </div>

                  {params.poison_enabled && (
                    <div className="form-group">
                      <label className="form-label">Gd₂O₃ Weight Fraction (%)</label>
                      <input
                        type="number"
                        step="0.1"
                        min="0.1"
                        max="10.0"
                        value={params.poison_fraction}
                        onChange={(e) => handleParamChange('poison_fraction', parseFloat(e.target.value))}
                        className="form-control"
                      />
                    </div>
                  )}
                </div>

                <div className="border-t border-slate-800/60 pt-4">
                  <div className="form-group">
                    <label className="form-label">Control Rod State</label>
                    <select
                      value={params.control_rod_state}
                      onChange={(e) => handleParamChange('control_rod_state', e.target.value)}
                      className="form-select text-slate-200"
                    >
                      <option value="Fully Withdrawn">Fully Withdrawn (Water filled)</option>
                      <option value="Fully Inserted">Fully Inserted</option>
                      <option value="Partially Inserted">Partially Inserted (50% depth)</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Absorber Material</label>
                    <select
                      value={params.control_rod_material}
                      onChange={(e) => handleParamChange('control_rod_material', e.target.value)}
                      className="form-select text-slate-200"
                    >
                      <option value="Ag-In-Cd">Silver-Indium-Cadmium (Ag-In-Cd)</option>
                      <option value="B4C">Boron Carbide (B₄C)</option>
                      <option value="Hafnium">Hafnium Metal</option>
                    </select>
                  </div>
                </div>
              </>
            )}

            {configTab === 'simulation' && (
              <>
                <div className="form-group">
                  <label className="form-label">Number of Particles</label>
                  <input
                    type="number"
                    step="1000"
                    value={params.particles}
                    onChange={(e) => handleParamChange('particles', parseInt(e.target.value))}
                    className="form-control"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="form-group">
                    <label className="form-label">Total Batches</label>
                    <input
                      type="number"
                      value={params.batches}
                      onChange={(e) => handleParamChange('batches', parseInt(e.target.value))}
                      className="form-control"
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Inactive Batches</label>
                    <input
                      type="number"
                      value={params.inactive_batches}
                      onChange={(e) => handleParamChange('inactive_batches', parseInt(e.target.value))}
                      className="form-control"
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Coolant Temperature (K)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={params.temperature}
                    onChange={(e) => handleParamChange('temperature', parseFloat(e.target.value))}
                    className="form-control"
                  />
                </div>
              </>
            )}
          </div>

          {/* Trigger button */}
          <button
            onClick={triggerSimulation}
            disabled={jobStatus === 'pending' || jobStatus === 'generating' || jobStatus === 'running' || jobStatus === 'parsing'}
            className="btn btn-primary w-full py-3 text-sm font-semibold flex items-center justify-center gap-2 mt-4"
          >
            {jobStatus === 'running' ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" /> Running Simulation...
              </>
            ) : (
              <>
                <Play className="w-4 h-4" /> Generate & Run Simulation
              </>
            )}
          </button>
        </section>

        {/* Right Details Panel */}
        <section className="flex flex-col gap-6">
          {mainTab === 'simulation' ? (
            <>
              {/* Simulation visualizer and logs panel */}
              <div className="simulation-grid">
                
                {/* 2D Assembly visualization */}
                <div className="panel flex flex-col items-center">
                  <div className="panel-header w-full">
                    <h3 className="panel-title"><Layers className="w-4 h-4 text-sky-400" /> Geometry Visualizer</h3>
                    <div className="overlay-btn-group">
                      <button
                        onClick={() => setActiveOverlay('none')}
                        className={`overlay-btn ${activeOverlay === 'none' ? 'active' : ''}`}
                      >
                        Material
                      </button>
                      <button
                        onClick={() => setActiveOverlay('power')}
                        disabled={!simulationResults}
                        className={`overlay-btn ${activeOverlay === 'power' ? 'active' : ''}`}
                      >
                        Power
                      </button>
                      <button
                        onClick={() => setActiveOverlay('flux')}
                        disabled={!simulationResults}
                        className={`overlay-btn ${activeOverlay === 'flux' ? 'active' : ''}`}
                      >
                        Flux
                      </button>
                    </div>
                  </div>
                  <AssemblyVisualizer
                    latticeType={params.lattice_type}
                    pinPitch={params.pin_pitch}
                    fuelRadius={params.fuel_radius}
                    gapRadius={params.gap_radius}
                    cladRadius={params.clad_radius}
                    controlRodState={params.control_rod_state}
                    poisonEnabled={params.poison_enabled}
                    results={simulationResults}
                    activeMap={activeOverlay}
                  />
                </div>

                {/* Live simulation logger console */}
                <div className="panel flex flex-col h-[520px]">
                  <div className="panel-header">
                    <h3 className="panel-title"><Terminal className="w-4 h-4 text-sky-400" /> Simulation Live Logs</h3>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setSimplifyLogs(!simplifyLogs)}
                        className={`toggle-btn ${simplifyLogs ? 'active' : ''}`}
                      >
                        {simplifyLogs ? 'Simplified' : 'Raw Logs'}
                      </button>
                      <span className={`status-badge ${
                        jobStatus === 'completed' ? 'completed' : 
                        jobStatus === 'failed' ? 'failed' :
                        jobStatus === 'running' || jobStatus === 'generating' || jobStatus === 'parsing' ? 'running' : 'idle'
                      }`}>
                        {jobStatus}
                      </span>
                    </div>
                  </div>
                  
                  <div 
                    ref={logConsoleRef}
                    className="log-console"
                  >
                    {(simplifyLogs ? getSimplifiedLogs(simulationLogs) : simulationLogs) || "Console ready. Click 'Generate & Run Simulation' to start OpenMC."}
                  </div>
                </div>
              </div>

              {/* Simulation Results analysis dashboard */}
              {simulationResults && (
                <div className="flex flex-col gap-6">
                  
                  {/* Results numerical summary cards */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="panel bg-slate-900/40 p-4 border-l-4 border-l-emerald-400 flex flex-col justify-between">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">k-Effective (Combined)</span>
                      <h4 className="text-2xl font-bold text-slate-100 mt-2">
                        {simulationResults.k_eff.toFixed(5)}
                      </h4>
                      <span className="text-[10px] text-slate-500 mt-1">± {simulationResults.k_eff_std.toFixed(5)} SD</span>
                    </div>

                    <div className="panel bg-slate-900/40 p-4 border-l-4 border-l-sky-400 flex flex-col justify-between">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Reactivity (ρ)</span>
                      <h4 className="text-2xl font-bold text-slate-100 mt-2">
                        {simulationResults.reactivity.toFixed(5)}
                      </h4>
                      <span className="text-[10px] text-slate-500 mt-1">pcm: {(simulationResults.reactivity * 1e5).toFixed(0)}</span>
                    </div>

                    <div className="panel bg-slate-900/40 p-4 border-l-4 border-l-purple-400 flex flex-col justify-between">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Hot Channel Factor</span>
                      <h4 className="text-2xl font-bold text-slate-100 mt-2">
                        {simulationResults.hot_channel_factor.toFixed(3)}
                      </h4>
                      <span className="text-[10px] text-slate-500 mt-1">Safe Limit: &lt; 1.5</span>
                    </div>

                    <div className="panel bg-slate-900/40 p-4 border-l-4 border-l-amber-400 flex flex-col justify-between">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Peak Power Factor</span>
                      <h4 className="text-2xl font-bold text-slate-100 mt-2">
                        {simulationResults.peak_power_factor.toFixed(3)}
                      </h4>
                      <span className="text-[10px] text-slate-500 mt-1">Max Pin / Average Pin</span>
                    </div>
                  </div>

                  {/* Reaction Rates Stats Panel */}
                  <div className="panel">
                    <div className="panel-header">
                      <h3 className="panel-title"><BarChart2 className="w-4 h-4 text-sky-400" /> Reaction Rates Statistics</h3>
                      <button 
                        onClick={exportPDFReport}
                        className="btn btn-secondary py-1.5 px-3 text-xs flex items-center gap-1.5"
                      >
                        <FileText className="w-3.5 h-3.5" /> Export PDF Summary
                      </button>
                    </div>
                    
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-6 text-center">
                      <div className="bg-slate-950/40 p-3 rounded-lg border border-slate-900">
                        <span className="text-[10px] text-slate-400 block mb-1">Fission Rate</span>
                        <span className="text-sm font-semibold text-emerald-400">{simulationResults.global_fission_rate.toExponential(4)}</span>
                      </div>
                      <div className="bg-slate-950/40 p-3 rounded-lg border border-slate-900">
                        <span className="text-[10px] text-slate-400 block mb-1">Absorption Rate</span>
                        <span className="text-sm font-semibold text-sky-400">{simulationResults.global_absorption_rate.toExponential(4)}</span>
                      </div>
                      <div className="bg-slate-950/40 p-3 rounded-lg border border-slate-900">
                        <span className="text-[10px] text-slate-400 block mb-1">Scattering Rate</span>
                        <span className="text-sm font-semibold text-slate-300">{simulationResults.global_scatter_rate.toExponential(4)}</span>
                      </div>
                      <div className="bg-slate-950/40 p-3 rounded-lg border border-slate-900">
                        <span className="text-[10px] text-slate-400 block mb-1">(n,2n) Multiplier Rate</span>
                        <span className="text-sm font-semibold text-purple-400">{simulationResults.global_n2n_rate.toExponential(4)}</span>
                      </div>
                      <div className="bg-slate-950/40 p-3 rounded-lg border border-slate-900">
                        <span className="text-[10px] text-slate-400 block mb-1">Leakage Fraction</span>
                        <span className="text-sm font-semibold text-amber-400">{simulationResults.leakage_rate.toFixed(5)}</span>
                      </div>
                    </div>
                  </div>

                  {/* 2D Heatmap & Spectrum Charts */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Fine mesh spatial heatmap */}
                    {fineMapPlot && (
                      <div className="panel bg-[#0e1626]/80 flex items-center justify-center p-4">
                        <PlotlyChart data={fineMapPlot.data} layout={fineMapPlot.layout} />
                      </div>
                    )}
                    
                    {/* Energy Spectrum line chart */}
                    {energySpectrumPlot && (
                      <div className="panel bg-[#0e1626]/80 flex items-center justify-center p-4">
                        <PlotlyChart data={energySpectrumPlot.data} layout={energySpectrumPlot.layout} />
                      </div>
                    )}
                  </div>

                  {/* Convergence analysis plots */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Shannon Entropy Plot */}
                    {entropyPlot && (
                      <div className="panel bg-[#0e1626]/80 p-4">
                        <PlotlyChart data={entropyPlot.data} layout={entropyPlot.layout} />
                      </div>
                    )}

                    {/* k-eff convergence Plot */}
                    {keffPlot && (
                      <div className="panel bg-[#0e1626]/80 p-4">
                        <PlotlyChart data={keffPlot.data} layout={keffPlot.layout} />
                      </div>
                    )}
                  </div>

                </div>
              )}
            </>
          ) : (
            /* Dataset generation view */
            <div className="flex flex-col gap-6">
              
              {/* Dataset parameter configuration card */}
              <div className="panel grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* Param ranges fields */}
                <div>
                  <div className="panel-header mb-4">
                    <h3 className="panel-title"><Database className="w-4 h-4 text-sky-400" /> Parametric Sweeps Config</h3>
                  </div>

                  <div className="flex flex-col gap-4">
                    {/* Enrichment bounds */}
                    <div>
                      <span className="text-xs font-bold text-slate-300 block mb-2">U-235 Enrichment range (%)</span>
                      <div className="grid grid-cols-3 gap-2">
                        <input
                          type="number"
                          step="0.1"
                          placeholder="Min"
                          value={datasetParams.enrichment_min}
                          onChange={(e) => setDatasetParams(p => ({ ...p, enrichment_min: parseFloat(e.target.value) }))}
                          className="form-control"
                        />
                        <input
                          type="number"
                          step="0.1"
                          placeholder="Max"
                          value={datasetParams.enrichment_max}
                          onChange={(e) => setDatasetParams(p => ({ ...p, enrichment_max: parseFloat(e.target.value) }))}
                          className="form-control"
                        />
                        <input
                          type="number"
                          placeholder="Steps"
                          value={datasetParams.enrichment_steps}
                          onChange={(e) => setDatasetParams(p => ({ ...p, enrichment_steps: parseInt(e.target.value) }))}
                          className="form-control"
                        />
                      </div>
                    </div>

                    {/* Boron bounds */}
                    <div>
                      <span className="text-xs font-bold text-slate-300 block mb-2">Coolant Soluble Boron range (ppm)</span>
                      <div className="grid grid-cols-3 gap-2">
                        <input
                          type="number"
                          step="100"
                          placeholder="Min"
                          value={datasetParams.boron_min}
                          onChange={(e) => setDatasetParams(p => ({ ...p, boron_min: parseFloat(e.target.value) }))}
                          className="form-control"
                        />
                        <input
                          type="number"
                          step="100"
                          placeholder="Max"
                          value={datasetParams.boron_max}
                          onChange={(e) => setDatasetParams(p => ({ ...p, boron_max: parseFloat(e.target.value) }))}
                          className="form-control"
                        />
                        <input
                          type="number"
                          placeholder="Steps"
                          value={datasetParams.boron_steps}
                          onChange={(e) => setDatasetParams(p => ({ ...p, boron_steps: parseInt(e.target.value) }))}
                          className="form-control"
                        />
                      </div>
                    </div>

                    {/* Pitch bounds */}
                    <div>
                      <span className="text-xs font-bold text-slate-300 block mb-2">Pin Pitch range (cm)</span>
                      <div className="grid grid-cols-3 gap-2">
                        <input
                          type="number"
                          step="0.01"
                          placeholder="Min"
                          value={datasetParams.pitch_min}
                          onChange={(e) => setDatasetParams(p => ({ ...p, pitch_min: parseFloat(e.target.value) }))}
                          className="form-control"
                        />
                        <input
                          type="number"
                          step="0.01"
                          placeholder="Max"
                          value={datasetParams.pitch_max}
                          onChange={(e) => setDatasetParams(p => ({ ...p, pitch_max: parseFloat(e.target.value) }))}
                          className="form-control"
                        />
                        <input
                          type="number"
                          placeholder="Steps"
                          value={datasetParams.pitch_steps}
                          onChange={(e) => setDatasetParams(p => ({ ...p, pitch_steps: parseInt(e.target.value) }))}
                          className="form-control"
                        />
                      </div>
                    </div>

                  </div>
                </div>

                {/* Progress bar and control buttons */}
                <div className="flex flex-col justify-between">
                  <div>
                    <div className="panel-header mb-4">
                      <h3 className="panel-title"><Cpu className="w-4 h-4 text-sky-400" /> Generation Queue</h3>
                    </div>
                    
                    <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-900 mb-6 flex flex-col gap-3">
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-slate-400 font-medium">Status:</span>
                        <span className={`font-semibold ${datasetStatus.active ? 'text-amber-400' : 'text-slate-500'}`}>
                          {datasetStatus.active ? 'Generating Cases...' : 'Inactive'}
                        </span>
                      </div>

                      {datasetStatus.active && (
                        <>
                          <div className="flex justify-between text-[11px] text-slate-500">
                            <span>Completed: {datasetStatus.completed_cases} / {datasetStatus.total_cases}</span>
                            <span>{((datasetStatus.completed_cases / datasetStatus.total_cases) * 100).toFixed(0)}%</span>
                          </div>
                          <div className="w-full bg-slate-900 h-2.5 rounded-full overflow-hidden">
                            <div 
                              className="bg-sky-400 h-full rounded-full transition-all duration-500" 
                              style={{ width: `${(datasetStatus.completed_cases / datasetStatus.total_cases) * 100}%` }}
                            />
                          </div>
                          
                          {/* current params variant */}
                          <div className="bg-slate-900/60 p-3 rounded-lg border border-slate-800 text-[10px] font-mono text-slate-400 flex flex-col gap-1 mt-1">
                            <span className="font-semibold text-slate-200">Current Case Parameters:</span>
                            <span>• Enrichment: {datasetStatus.current_params.enrichment?.toFixed(2)} %</span>
                            <span>• Soluble Boron: {datasetStatus.current_params.soluble_boron?.toFixed(0)} ppm</span>
                            <span>• Pitch: {datasetStatus.current_params.pin_pitch?.toFixed(3)} cm</span>
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-col gap-3 mt-4">
                    {datasetStatus.active ? (
                      <button
                        onClick={stopDatasetGeneration}
                        className="btn btn-danger py-3 text-sm flex items-center justify-center gap-2"
                      >
                        Stop Dataset Generation
                      </button>
                    ) : (
                      <button
                        onClick={triggerDatasetGeneration}
                        className="btn btn-primary py-3 text-sm flex items-center justify-center gap-2"
                      >
                        <Play className="w-4 h-4" /> Start Iterative Generation
                      </button>
                    )}

                    <a
                      href="/api/dataset/download"
                      className="btn btn-secondary py-3 text-sm flex items-center justify-center gap-2"
                    >
                      <Download className="w-4 h-4" /> Download Generated CSV
                    </a>
                  </div>
                </div>

              </div>

              {/* Informative guidelines */}
              <div className="panel bg-[#0e1626]/60 border border-amber-500/10 p-5 flex gap-4">
                <AlertTriangle className="w-8 h-8 text-amber-500 shrink-0" />
                <div className="text-xs leading-relaxed">
                  <h4 className="font-bold text-amber-500 mb-1">Dataset Generation Mode Alert</h4>
                  <p className="text-slate-400">
                    Dataset generation mode sweeps across combinations of enrichment, soluble boron, and pitch. 
                    To ensure rapid execution, the platform automatically overrides particle count to 2,000 and batches to 25. 
                    This creates optimized, fast Monte Carlo executions that construct input-to-output surrogate datasets suitable for training Machine Learning, Deep Learning, and optimization study models.
                  </p>
                </div>
              </div>
            </div>
          )}
        </section>
        
      </main>
    </div>
  );
}
