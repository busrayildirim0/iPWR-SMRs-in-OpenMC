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
    temperature: 566.5,
    boundary_type: 'Reflective',
    kinetics_enabled: false,
    safety_coefs_enabled: false,
    depletion_enabled: false,
    shielding_enabled: false,
    economy_enabled: false,
    flux_3d_enabled: false
  });

  // Config tab state
  const [configTab, setConfigTab] = useState('geometry'); // 'geometry', 'materials', 'simulation', 'advanced'
  
  // Results detailed tab state
  const [resultsTab, setResultsTab] = useState('core'); // 'core', 'kinetics', 'safety', 'flux3d', 'depletion', 'economy', 'shielding'
  const [zSliceIndex, setZSliceIndex] = useState(5);
  const [zMapType, setZMapType] = useState('power');

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
          setParams({
            boundary_type: 'Reflective',
            kinetics_enabled: false,
            safety_coefs_enabled: false,
            depletion_enabled: false,
            shielding_enabled: false,
            economy_enabled: false,
            flux_3d_enabled: false,
            ...data.NuScale
          });
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
      setParams({
        boundary_type: 'Reflective',
        kinetics_enabled: false,
        safety_coefs_enabled: false,
        depletion_enabled: false,
        shielding_enabled: false,
        economy_enabled: false,
        flux_3d_enabled: false,
        ...presets[name]
      });
      // Adjust overlay if switching presets
      setActiveOverlay('none');
    }
  };

  // Handle individual parameter change
  const handleParamChange = (key, val) => {
    setParams(prev => {
      const next = { ...prev, [key]: val };
      
      // Core physical reactor parameters that define a preset
      const physicalKeys = [
        'lattice_type', 'active_height', 'pin_pitch', 'fuel_radius',
        'gap_radius', 'clad_radius', 'gt_inner_radius', 'gt_outer_radius',
        'enrichment', 'soluble_boron', 'clad_material', 'poison_enabled',
        'poison_fraction', 'control_rod_state', 'control_rod_material'
      ];
      
      if (physicalKeys.includes(key)) {
        let matchedPreset = 'Custom';
        for (const [presetName, presetParams] of Object.entries(presets)) {
          let match = true;
          for (const pKey of physicalKeys) {
            const currentVal = pKey === key ? val : prev[pKey];
            const presetVal = presetParams[pKey];
            if (currentVal !== presetVal) {
              match = false;
              break;
            }
          }
          if (match) {
            matchedPreset = presetName;
            break;
          }
        }
        setActivePreset(matchedPreset);
      }
      
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

  // Depletion k-eff vs days plot
  const depletionKeffPlot = useMemo(() => {
    if (!simulationResults?.depletion?.days) return null;
    return {
      data: [{
        x: simulationResults.depletion.days,
        y: simulationResults.depletion.k_eff,
        error_y: {
          type: 'data',
          array: simulationResults.depletion.k_eff_std,
          visible: true,
          color: '#ef4444'
        },
        type: 'scatter',
        mode: 'lines+markers',
        name: 'k-effective',
        line: { color: '#34d399', width: 2 },
        marker: { size: 6, color: '#059669' }
      }],
      layout: {
        title: 'k-Effective Depletion Curve',
        xaxis: { title: 'Time (Days)', gridcolor: '#1e293b' },
        yaxis: { title: 'k-eff', gridcolor: '#1e293b' },
        margin: { l: 50, r: 20, t: 40, b: 40 },
        height: 280
      }
    };
  }, [simulationResults]);

  // Depletion isotope concentrations vs days plot
  const depletionIsotopesPlot = useMemo(() => {
    if (!simulationResults?.depletion?.days) return null;
    return {
      data: [
        {
          x: simulationResults.depletion.days,
          y: simulationResults.depletion.xe135,
          type: 'scatter',
          mode: 'lines+markers',
          name: 'Xe-135 (Poison)',
          line: { color: '#c084fc', width: 2 }
        },
        {
          x: simulationResults.depletion.days,
          y: simulationResults.depletion.sm149,
          type: 'scatter',
          mode: 'lines+markers',
          name: 'Sm-149 (Poison)',
          line: { color: '#fb7185', width: 2 }
        },
        {
          x: simulationResults.depletion.days,
          y: simulationResults.depletion.pu239,
          type: 'scatter',
          mode: 'lines+markers',
          name: 'Pu-239 (Breeding)',
          line: { color: '#fbbf24', width: 2 }
        }
      ],
      layout: {
        title: 'Fission Product Poisons & Actinide Evolution',
        xaxis: { title: 'Time (Days)', gridcolor: '#1e293b' },
        yaxis: { title: 'Atom Concentration (atoms/b-cm)', type: 'log', gridcolor: '#1e293b' },
        margin: { l: 65, r: 20, t: 40, b: 40 },
        height: 280
      }
    };
  }, [simulationResults]);

  // 3D slice heatmap
  const zSlicePlot = useMemo(() => {
    if (!simulationResults?.power_3d || !simulationResults?.flux_3d) return null;
    const zData = zMapType === 'power' ? simulationResults.power_3d[zSliceIndex] : simulationResults.flux_3d[zSliceIndex];
    if (!zData) return null;
    return {
      data: [{
        z: zData,
        type: 'heatmap',
        colorscale: zMapType === 'power' ? 'Inferno' : 'Viridis',
        showscale: true,
        colorbar: { thickness: 15, len: 0.9 }
      }],
      layout: {
        title: `3D Mesh Slice Z-${zSliceIndex + 1} (${zMapType === 'power' ? 'Power' : 'Flux'})`,
        xaxis: { title: 'X-Index', gridcolor: '#1e293b' },
        yaxis: { title: 'Y-Index', gridcolor: '#1e293b' },
        margin: { l: 50, r: 20, t: 40, b: 40 },
        height: 380
      }
    };
  }, [simulationResults, zSliceIndex, zMapType]);

  // Biological dose rate map
  const doseRatePlot = useMemo(() => {
    if (!simulationResults?.dose_rate_map) return null;
    return {
      data: [{
        z: simulationResults.dose_rate_map,
        type: 'heatmap',
        colorscale: 'Hot',
        showscale: true,
        colorbar: { thickness: 15, len: 0.9 }
      }],
      layout: {
        title: 'Biological Dose Rate Map (Sv/h)',
        xaxis: { title: 'X-Index', gridcolor: '#1e293b' },
        yaxis: { title: 'Y-Index', gridcolor: '#1e293b' },
        margin: { l: 50, r: 20, t: 40, b: 40 },
        height: 380
      }
    };
  }, [simulationResults]);

  // Neutron balance pie chart
  const neutronBalancePlot = useMemo(() => {
    if (!simulationResults) return null;
    const abs = simulationResults.global_absorption_rate || 0;
    const leak = simulationResults.leakage_rate || 0;
    
    return {
      data: [{
        values: [abs, leak],
        labels: ['Absorption', 'Leakage'],
        type: 'pie',
        hole: 0.4,
        marker: {
          colors: ['#38bdf8', '#fb7185']
        },
        textinfo: 'percent+label',
        hoverinfo: 'label+value+percent'
      }],
      layout: {
        title: 'Neutron Destination Balance',
        margin: { l: 20, r: 20, t: 40, b: 20 },
        height: 280,
        showlegend: true,
        legend: { orientation: 'h', y: -0.1 },
        paper_bgcolor: 'rgba(0,0,0,0)',
        plot_bgcolor: 'rgba(0,0,0,0)',
        font: { color: '#cbd5e1' }
      }
    };
  }, [simulationResults]);

  // Reaction rates bar chart
  const reactionRatesBarPlot = useMemo(() => {
    if (!simulationResults) return null;
    return {
      data: [{
        x: ['Fission', 'Absorption', 'Scattering', '(n,2n)'],
        y: [
          simulationResults.global_fission_rate || 0,
          simulationResults.global_absorption_rate || 0,
          simulationResults.global_scatter_rate || 0,
          simulationResults.global_n2n_rate || 0
        ],
        type: 'bar',
        marker: {
          color: ['#10b981', '#3b82f6', '#64748b', '#8b5cf6']
        }
      }],
      layout: {
        title: 'Global Reaction Rates (reactions/s)',
        yaxis: { type: 'log', title: 'Rate (log scale)', gridcolor: '#1e293b' },
        margin: { l: 50, r: 20, t: 40, b: 40 },
        height: 280,
        paper_bgcolor: 'rgba(0,0,0,0)',
        plot_bgcolor: 'rgba(0,0,0,0)',
        font: { color: '#cbd5e1' }
      }
    };
  }, [simulationResults]);

  // Axial profile chart
  const axialProfilePlot = useMemo(() => {
    if (!simulationResults?.power_3d || !simulationResults?.flux_3d) return null;
    const data3D = zMapType === 'power' ? simulationResults.power_3d : simulationResults.flux_3d;
    
    const averages = data3D.map(slice => {
      let sum = 0;
      let count = 0;
      slice.forEach(row => {
        row.forEach(val => {
          if (val > 0) {
            sum += val;
            count++;
          }
        });
      });
      return count > 0 ? sum / count : 0;
    });
    
    const heights = Array.from({length: 10}, (_, i) => i + 1);
    
    return {
      data: [{
        x: averages,
        y: heights,
        type: 'scatter',
        mode: 'lines+markers',
        name: `Average Axial ${zMapType === 'power' ? 'Power' : 'Flux'}`,
        line: { color: zMapType === 'power' ? '#f97316' : '#06b6d4', width: 2 },
        marker: { size: 6 }
      }],
      layout: {
        title: `Axial ${zMapType === 'power' ? 'Power' : 'Flux'} Profile`,
        xaxis: { title: 'Average Value', gridcolor: '#1e293b' },
        yaxis: { title: 'Axial Layer (Z)', tickvals: heights, gridcolor: '#1e293b' },
        margin: { l: 50, r: 20, t: 40, b: 40 },
        height: 380
      }
    };
  }, [simulationResults, zMapType]);

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
          <div className="bg-slate-900/40 border border-slate-800/80 rounded-lg p-1 flex gap-1 shadow-inner">
            <button 
              className={`tab-btn ${mainTab === 'simulation' ? 'active' : ''}`}
              onClick={() => setMainTab('simulation')}
            >
              <Cpu className="w-3.5 h-3.5" /> Simulation
            </button>
            <button 
              className={`tab-btn ${mainTab === 'dataset' ? 'active' : ''}`}
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
            <button
              onClick={() => setConfigTab('advanced')}
              className={`flex-1 pb-2 text-center text-xs font-bold transition-all ${configTab === 'advanced' ? 'border-b-2 border-sky-400 text-sky-400' : 'text-slate-500 hover:text-slate-400'}`}
            >
              Advanced
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

            {configTab === 'advanced' && (
              <div className="flex flex-col gap-4">
                <div className="form-group">
                  <label className="form-label">Boundary Condition</label>
                  <select
                    value={params.boundary_type}
                    onChange={(e) => handleParamChange('boundary_type', e.target.value)}
                    className="form-select text-slate-200"
                  >
                    <option value="Reflective">Reflective (Infinite Assembly)</option>
                    <option value="Vacuum">Vacuum (Leakage Study)</option>
                  </select>
                </div>
                
                <div className="border-t border-slate-800/60 pt-4 flex flex-col gap-3">
                  <span className="text-[11px] font-bold text-sky-400 uppercase tracking-wider block mb-1">Analysis Modules</span>
                  
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      id="kinetics_enabled"
                      checked={params.kinetics_enabled}
                      onChange={(e) => handleParamChange('kinetics_enabled', e.target.checked)}
                      className="w-4 h-4 rounded text-sky-400 bg-slate-900 border-slate-800"
                    />
                    <label htmlFor="kinetics_enabled" className="text-xs font-semibold text-slate-300 select-none cursor-pointer">
                      Kinetics Parameters (&beta;<sub>eff</sub>, Rod Worth)
                    </label>
                  </div>
                  
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      id="safety_coefs_enabled"
                      checked={params.safety_coefs_enabled}
                      onChange={(e) => handleParamChange('safety_coefs_enabled', e.target.checked)}
                      className="w-4 h-4 rounded text-sky-400 bg-slate-900 border-slate-800"
                    />
                    <label htmlFor="safety_coefs_enabled" className="text-xs font-semibold text-slate-300 select-none cursor-pointer">
                      Safety Coefficients (FTC, MTC, Void)
                    </label>
                  </div>
                  
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      id="flux_3d_enabled"
                      checked={params.flux_3d_enabled}
                      onChange={(e) => handleParamChange('flux_3d_enabled', e.target.checked)}
                      className="w-4 h-4 rounded text-sky-400 bg-slate-900 border-slate-800"
                    />
                    <label htmlFor="flux_3d_enabled" className="text-xs font-semibold text-slate-300 select-none cursor-pointer">
                      3D Spatial Mesh Mapping
                    </label>
                  </div>
                  
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      id="depletion_enabled"
                      checked={params.depletion_enabled}
                      onChange={(e) => handleParamChange('depletion_enabled', e.target.checked)}
                      className="w-4 h-4 rounded text-sky-400 bg-slate-900 border-slate-800"
                    />
                    <label htmlFor="depletion_enabled" className="text-xs font-semibold text-slate-300 select-none cursor-pointer">
                      Fuel Depletion / Burnup Analysis
                    </label>
                  </div>
                  
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      id="economy_enabled"
                      checked={params.economy_enabled}
                      onChange={(e) => handleParamChange('economy_enabled', e.target.checked)}
                      className="w-4 h-4 rounded text-sky-400 bg-slate-900 border-slate-800"
                    />
                    <label htmlFor="economy_enabled" className="text-xs font-semibold text-slate-300 select-none cursor-pointer">
                      Reaction Rates & Spectral Indices
                    </label>
                  </div>
                  
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      id="shielding_enabled"
                      checked={params.shielding_enabled}
                      onChange={(e) => handleParamChange('shielding_enabled', e.target.checked)}
                      className="w-4 h-4 rounded text-sky-400 bg-slate-900 border-slate-800"
                    />
                    <label htmlFor="shielding_enabled" className="text-xs font-semibold text-slate-300 select-none cursor-pointer">
                      Biological Dose & Clad DPA
                    </label>
                  </div>
                </div>
              </div>
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
                  
                  {/* Results detailed tab selector */}
                  <div className="bg-slate-900/40 border border-slate-800/80 rounded-lg p-1 flex flex-wrap gap-1 shadow-inner">
                    {[
                      { id: 'core', label: 'Core Performance', icon: BarChart2 },
                      { id: 'kinetics', label: 'Kinetics & Rod Worth', icon: Cpu },
                      { id: 'safety', label: 'Safety Coefficients', icon: Shield },
                      { id: 'flux3d', label: '3D Spatial Mapping', icon: Layers },
                      { id: 'depletion', label: 'Depletion & Burnup', icon: RefreshCw },
                      { id: 'economy', label: 'Neutron Economy', icon: Compass },
                      { id: 'shielding', label: 'Shielding & DPA', icon: Shield }
                    ].map(tab => {
                      const Icon = tab.icon;
                      return (
                        <button
                          key={tab.id}
                          onClick={() => setResultsTab(tab.id)}
                          className={`tab-btn ${resultsTab === tab.id ? 'active' : ''}`}
                        >
                          <Icon className="w-3.5 h-3.5" />
                          {tab.label}
                        </button>
                      );
                    })}
                  </div>

                  {/* Core Metrics Tab */}
                  {resultsTab === 'core' && (
                    <>
                      {/* Results numerical summary cards */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="panel bg-slate-900/40 p-4 border-l-4 border-l-emerald-400 flex flex-col justify-between">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">k-Effective (Combined)</span>
                          <h4 className="text-2xl font-bold text-slate-100 mt-2">
                            {simulationResults?.k_eff?.toFixed(5) ?? "N/A"}
                          </h4>
                          <span className="text-[10px] text-slate-500 mt-1">± {simulationResults?.k_eff_std?.toFixed(5) ?? "N/A"} SD</span>
                        </div>

                        <div className="panel bg-slate-900/40 p-4 border-l-4 border-l-sky-400 flex flex-col justify-between">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Reactivity (ρ)</span>
                          <h4 className="text-2xl font-bold text-slate-100 mt-2">
                            {simulationResults?.reactivity?.toFixed(5) ?? "N/A"}
                          </h4>
                          <span className="text-[10px] text-slate-500 mt-1">pcm: {simulationResults?.reactivity !== undefined ? (simulationResults.reactivity * 1e5).toFixed(0) : "N/A"}</span>
                        </div>

                        <div className="panel bg-slate-900/40 p-4 border-l-4 border-l-purple-400 flex flex-col justify-between">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Hot Channel Factor</span>
                          <h4 className="text-2xl font-bold text-slate-100 mt-2">
                            {simulationResults?.hot_channel_factor?.toFixed(3) ?? "N/A"}
                          </h4>
                          <span className="text-[10px] text-slate-500 mt-1">Safe Limit: &lt; 1.5</span>
                        </div>

                        <div className="panel bg-slate-900/40 p-4 border-l-4 border-l-amber-400 flex flex-col justify-between">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Peak Power Factor</span>
                          <h4 className="text-2xl font-bold text-slate-100 mt-2">
                            {simulationResults?.peak_power_factor?.toFixed(3) ?? "N/A"}
                          </h4>
                          <span className="text-[10px] text-slate-500 mt-1">Max Pin / Average Pin</span>
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
                    </>
                  )}

                  {/* Kinetics Tab */}
                  {resultsTab === 'kinetics' && (
                    <div className="flex flex-col gap-6">
                      {simulationResults.beta_eff !== undefined && simulationResults.beta_eff > 0 ? (
                        <>
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            {/* Beta effective card */}
                            <div className="panel bg-[#0e1626]/60 border-l-4 border-l-sky-400 p-5 flex flex-col justify-between">
                              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Delayed Neutron Fraction (&beta;<sub>eff</sub>)</span>
                              <h4 className="text-3xl font-extrabold text-sky-400 mt-3">
                                {simulationResults.beta_eff.toFixed(6)}
                              </h4>
                              <p className="text-[11px] text-slate-400 mt-2">
                                Measures reactor dynamic response and margins to prompt criticality. Typical LWR values are 0.005 - 0.007.
                              </p>
                            </div>

                            {/* Prompt generation time card */}
                            <div className="panel bg-[#0e1626]/60 border-l-4 border-l-purple-400 p-5 flex flex-col justify-between">
                              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Mean Generation Time (&Lambda;<sub>eff</sub>)</span>
                              <h4 className="text-3xl font-extrabold text-purple-400 mt-3">
                                {(simulationResults.gen_time * 1e6).toFixed(3)} &mu;s
                              </h4>
                              <p className="text-[11px] text-slate-400 mt-2">
                                Mean time from neutron emission to causing a subsequent fission. Smaller times lead to faster transients.
                              </p>
                            </div>

                            {/* Control Rod Worth Card */}
                            <div className="panel bg-[#0e1626]/60 border-l-4 border-l-amber-400 p-5 flex flex-col justify-between">
                              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Control Rod Worth</span>
                              <h4 className="text-3xl font-extrabold text-amber-400 mt-3 font-mono">
                                {simulationResults.control_rod_worth_pcm !== undefined && simulationResults.control_rod_worth_pcm !== 0 ? `${simulationResults.control_rod_worth_pcm.toFixed(1)} pcm` : 'N/A'}
                              </h4>
                              <p className="text-[11px] text-slate-400 mt-2">
                                Reactivity worth of control rods when moving from current state to the opposite fully-inserted/withdrawn state.
                              </p>
                            </div>
                          </div>

                          {/* Worth Detailed Comparison Table */}
                          {simulationResults.control_rod_worth_pcm !== undefined && simulationResults.control_rod_worth_pcm !== 0 && (
                            <div className="panel">
                              <div className="panel-header">
                                <h3 className="panel-title"><Cpu className="w-4 h-4 text-sky-400" /> Control Rod Reactivity Worth Details</h3>
                              </div>
                              <div className="overflow-x-auto">
                                <table className="w-full text-left text-xs border-collapse">
                                  <thead>
                                    <tr className="border-b border-slate-800 text-slate-400 font-bold uppercase tracking-wider">
                                      <th className="pb-3 pr-4">Configuration State</th>
                                      <th className="pb-3 px-4">Eigenvalue (k-eff)</th>
                                      <th className="pb-3 px-4">Reactivity Worth (&Delta;&rho;)</th>
                                      <th className="pb-3 pl-4">Safety Status</th>
                                    </tr>
                                  </thead>
                                  <tbody className="text-slate-300 font-mono">
                                    <tr className="border-b border-slate-900">
                                      <td className="py-3 pr-4 font-sans font-semibold">Base Config ({params.control_rod_state})</td>
                                      <td className="py-3 px-4">{simulationResults.k_eff.toFixed(5)} &plusmn; {simulationResults.k_eff_std.toFixed(5)}</td>
                                      <td className="py-3 px-4">Base</td>
                                      <td className="py-3 pl-4 font-sans">
                                        <span className="px-2 py-0.5 rounded text-[10px] bg-slate-800 text-slate-400 font-bold">ACTIVE</span>
                                      </td>
                                    </tr>
                                    <tr className="border-b border-slate-900">
                                      <td className="py-3 pr-4 font-sans font-semibold">Aux Config (Opposite Rod State)</td>
                                      <td className="py-3 px-4">
                                        {params.control_rod_state === 'Fully Inserted' 
                                          ? (simulationResults.k_eff_withdrawn ? simulationResults.k_eff_withdrawn.toFixed(5) : 'N/A')
                                          : (simulationResults.k_eff_inserted ? simulationResults.k_eff_inserted.toFixed(5) : 'N/A')
                                        }
                                      </td>
                                      <td className="py-3 px-4">
                                        {simulationResults.control_rod_worth_pcm.toFixed(1)} pcm
                                      </td>
                                      <td className="py-3 pl-4 font-sans">
                                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                          Math.abs(simulationResults.control_rod_worth_pcm) > 1000 
                                            ? 'bg-emerald-500/10 text-emerald-400' 
                                            : 'bg-amber-500/10 text-amber-400'
                                        }`}>
                                          {Math.abs(simulationResults.control_rod_worth_pcm) > 1000 ? 'SUFFICIENT WORTH' : 'LOW WORTH'}
                                        </span>
                                      </td>
                                    </tr>
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="panel bg-[#1a1420] border-amber-500/10 p-8 flex flex-col items-center justify-center text-center gap-4">
                          <AlertTriangle className="w-12 h-12 text-amber-500" />
                          <div>
                            <h4 className="text-lg font-bold text-amber-500">Kinetics Analysis Module Inactive</h4>
                            <p className="text-xs text-slate-400 mt-2 max-w-lg">
                              Kinetics parameter calculations require Iterated Fission Probability (IFP) tallies which are not enabled in the current run parameters. To activate, check the <b>Kinetics Parameters</b> module in the <b>Advanced</b> configurator tab and run the simulation again.
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Safety Coefficients Tab */}
                  {resultsTab === 'safety' && (
                    <div className="flex flex-col gap-6">
                      {simulationResults.safety_coefficients !== undefined ? (
                        <>
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            {/* FTC Card */}
                            <div className="panel bg-[#0e1626]/60 border-l-4 border-l-emerald-400 p-5 flex flex-col justify-between">
                              <div className="flex justify-between items-start">
                                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Fuel Temp Coefficient (FTC)</span>
                                <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${simulationResults.safety_coefficients.ftc < 0 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}`}>
                                  {simulationResults.safety_coefficients.ftc < 0 ? 'Safe / Neg' : 'Danger / Pos'}
                                </span>
                              </div>
                              <h4 className="text-3xl font-extrabold text-slate-100 mt-3">
                                {simulationResults.safety_coefficients.ftc.toFixed(2)} <span className="text-sm font-normal text-slate-400">pcm/K</span>
                              </h4>
                              <p className="text-[11px] text-slate-400 mt-2">
                                Doppler feedback. Measures absorption resonance broadening. A negative FTC provides inherent stability against fuel overheating.
                              </p>
                            </div>

                            {/* MTC Card */}
                            <div className="panel bg-[#0e1626]/60 border-l-4 border-l-indigo-400 p-5 flex flex-col justify-between">
                              <div className="flex justify-between items-start">
                                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Moderator Temp Coeff (MTC)</span>
                                <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${simulationResults.safety_coefficients.mtc < 0 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}`}>
                                  {simulationResults.safety_coefficients.mtc < 0 ? 'Safe / Neg' : 'Danger / Pos'}
                                </span>
                              </div>
                              <h4 className="text-3xl font-extrabold text-slate-100 mt-3">
                                {simulationResults.safety_coefficients.mtc.toFixed(2)} <span className="text-sm font-normal text-slate-400">pcm/K</span>
                              </h4>
                              <p className="text-[11px] text-slate-400 mt-2">
                                Coolant temperature feedback. Measures moderator density reduction as coolant warms. Negative MTC ensures stable power control.
                              </p>
                            </div>

                            {/* Void Card */}
                            <div className="panel bg-[#0e1626]/60 border-l-4 border-l-amber-400 p-5 flex flex-col justify-between">
                              <div className="flex justify-between items-start">
                                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Coolant Void Coefficient</span>
                                <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${simulationResults.safety_coefficients.void < 0 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}`}>
                                  {simulationResults.safety_coefficients.void < 0 ? 'Safe / Neg' : 'Danger / Pos'}
                                </span>
                              </div>
                              <h4 className="text-3xl font-extrabold text-slate-100 mt-3">
                                {simulationResults.safety_coefficients.void.toFixed(2)} <span className="text-sm font-normal text-slate-400">pcm/% void</span>
                              </h4>
                              <p className="text-[11px] text-slate-400 mt-2">
                                Density feedback for steam bubbles/voiding. A negative coefficient prevents power runaway during boiling or coolant depletion.
                              </p>
                            </div>
                          </div>

                          {/* Detailed Auxiliary Runs Table */}
                          <div className="panel">
                            <div className="panel-header">
                              <h3 className="panel-title"><Cpu className="w-4 h-4 text-sky-400" /> Auxiliary Safety States Analysis</h3>
                            </div>
                            <div className="overflow-x-auto">
                              <table className="w-full text-left text-xs border-collapse">
                                <thead>
                                  <tr className="border-b border-slate-800 text-slate-400 font-bold uppercase tracking-wider">
                                    <th className="pb-3 pr-4">Perturbed State</th>
                                    <th className="pb-3 px-4">Perturbation Details</th>
                                    <th className="pb-3 px-4">Simulated k-eff</th>
                                    <th className="pb-3 px-4">Calculated Feedback Coefficient</th>
                                    <th className="pb-3 pl-4">License Compliance</th>
                                  </tr>
                                </thead>
                                <tbody className="text-slate-300 font-mono">
                                  <tr className="border-b border-slate-900">
                                    <td className="py-3 pr-4 font-sans font-semibold">Fuel Doppler (FTC)</td>
                                    <td className="py-3 px-4">Fuel Temperature +300.0 K</td>
                                    <td className="py-3 px-4">{simulationResults.safety_coefficients.ftc_k.toFixed(5)}</td>
                                    <td className="py-3 px-4">{simulationResults.safety_coefficients.ftc.toFixed(2)} pcm/K</td>
                                    <td className={`py-3 pl-4 font-sans font-bold ${simulationResults.safety_coefficients.ftc < 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                      {simulationResults.safety_coefficients.ftc < 0 ? 'COMPLIANT (Negative)' : 'NON-COMPLIANT (Positive)'}
                                    </td>
                                  </tr>
                                  <tr className="border-b border-slate-900">
                                    <td className="py-3 pr-4 font-sans font-semibold">Moderator Heat (MTC)</td>
                                    <td className="py-3 px-4">Coolant Temperature +20.0 K</td>
                                    <td className="py-3 px-4">{simulationResults.safety_coefficients.mtc_k.toFixed(5)}</td>
                                    <td className="py-3 px-4">{simulationResults.safety_coefficients.mtc.toFixed(2)} pcm/K</td>
                                    <td className={`py-3 pl-4 font-sans font-bold ${simulationResults.safety_coefficients.mtc < 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                      {simulationResults.safety_coefficients.mtc < 0 ? 'COMPLIANT (Negative)' : 'NON-COMPLIANT (Positive)'}
                                    </td>
                                  </tr>
                                  <tr className="border-b border-slate-900">
                                    <td className="py-3 pr-4 font-sans font-semibold">Moderator Voiding (Void)</td>
                                    <td className="py-3 px-4">Coolant Density -10.0% (10% steam)</td>
                                    <td className="py-3 px-4">{simulationResults.safety_coefficients.void_k.toFixed(5)}</td>
                                    <td className="py-3 px-4">{simulationResults.safety_coefficients.void.toFixed(2)} pcm/% void</td>
                                    <td className={`py-3 pl-4 font-sans font-bold ${simulationResults.safety_coefficients.void < 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                      {simulationResults.safety_coefficients.void < 0 ? 'COMPLIANT (Negative)' : 'NON-COMPLIANT (Positive)'}
                                    </td>
                                  </tr>
                                </tbody>
                              </table>
                            </div>
                          </div>
                        </>
                      ) : (
                        <div className="panel bg-[#1a1420] border-amber-500/10 p-8 flex flex-col items-center justify-center text-center gap-4">
                          <AlertTriangle className="w-12 h-12 text-amber-500" />
                          <div>
                            <h4 className="text-lg font-bold text-amber-500">Safety Coefficients Module Inactive</h4>
                            <p className="text-xs text-slate-400 mt-2 max-w-lg">
                              Safety coefficient evaluations (FTC, MTC, Void) require 3 additional sequential OpenMC runs simulating perturbed operational states. To activate, check the <b>Safety Coefficients</b> module in the <b>Advanced</b> configurator tab and re-run.
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* 3D Spatial Mapping Tab */}
                  {resultsTab === 'flux3d' && (
                    <div className="flex flex-col gap-6">
                      {simulationResults.power_3d !== null && simulationResults.power_3d !== undefined ? (
                        <>
                          {/* Slider Panel */}
                          <div className="panel grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
                            <div className="flex flex-col gap-2">
                              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Axial Layer Selection</span>
                              <div className="flex items-center gap-4">
                                <input
                                  type="range"
                                  min="0"
                                  max="9"
                                  value={zSliceIndex}
                                  onChange={(e) => setZSliceIndex(parseInt(e.target.value))}
                                  className="w-full accent-sky-400 bg-slate-900 border border-slate-800 rounded-lg h-2"
                                />
                                <span className="text-sm font-bold font-mono text-sky-400 w-20 text-right">Z - {zSliceIndex + 1} / 10</span>
                              </div>
                              <span className="text-[10px] text-slate-500">Axial heights slice from bottom (Z=1) to top (Z=10) of fuel assembly</span>
                            </div>

                            <div className="flex flex-col gap-2">
                              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Overlay Distribution Type</span>
                              <div className="overlay-btn-group w-fit">
                                <button
                                  onClick={() => setZMapType('power')}
                                  className={`overlay-btn ${zMapType === 'power' ? 'active' : ''}`}
                                >
                                  Fission Power
                                </button>
                                <button
                                  onClick={() => setZMapType('flux')}
                                  className={`overlay-btn ${zMapType === 'flux' ? 'active' : ''}`}
                                >
                                  Neutron Flux
                                </button>
                              </div>
                            </div>

                            <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-900 text-xs text-slate-400">
                              <span className="font-semibold text-slate-200 block mb-1">Active 3D Tallies:</span>
                              • Mesh Dimensions: 17x17x10 voxel grid<br/>
                              • Filters: Axial spatial mesh + Energy-independent
                            </div>
                          </div>

                          {/* Graphs */}
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {/* Slice Heatmap */}
                            {zSlicePlot && (
                              <div className="panel bg-[#0e1626]/80 flex items-center justify-center p-4">
                                <PlotlyChart data={zSlicePlot.data} layout={zSlicePlot.layout} />
                              </div>
                            )}

                            {/* Axial Profile */}
                            {axialProfilePlot && (
                              <div className="panel bg-[#0e1626]/80 flex items-center justify-center p-4">
                                <PlotlyChart data={axialProfilePlot.data} layout={axialProfilePlot.layout} />
                              </div>
                            )}
                          </div>
                        </>
                      ) : (
                        <div className="panel bg-[#1a1420] border-amber-500/10 p-8 flex flex-col items-center justify-center text-center gap-4">
                          <AlertTriangle className="w-12 h-12 text-amber-500" />
                          <div>
                            <h4 className="text-lg font-bold text-amber-500">3D Spatial Mapping Module Inactive</h4>
                            <p className="text-xs text-slate-400 mt-2 max-w-lg">
                              Detailed 3D mesh tallies generate massive data files and are disabled by default. To activate, check the <b>3D Spatial Mesh Mapping</b> module in the <b>Advanced</b> configurator tab and re-run.
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Depletion & Burnup Tab */}
                  {resultsTab === 'depletion' && (
                    <div className="flex flex-col gap-6">
                      {simulationResults.depletion !== undefined ? (
                        <>
                          {/* Charts */}
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {depletionKeffPlot && (
                              <div className="panel bg-[#0e1626]/80 flex items-center justify-center p-4">
                                <PlotlyChart data={depletionKeffPlot.data} layout={depletionKeffPlot.layout} />
                              </div>
                            )}

                            {depletionIsotopesPlot && (
                              <div className="panel bg-[#0e1626]/80 flex items-center justify-center p-4">
                                <PlotlyChart data={depletionIsotopesPlot.data} layout={depletionIsotopesPlot.layout} />
                              </div>
                            )}
                          </div>

                          {/* Numerical depletion step table */}
                          <div className="panel">
                            <div className="panel-header">
                              <h3 className="panel-title"><RefreshCw className="w-4 h-4 text-sky-400" /> Depletion Step Concentrations</h3>
                            </div>
                            <div className="overflow-x-auto max-h-[300px] overflow-y-auto">
                              <table className="w-full text-left text-xs border-collapse">
                                <thead>
                                  <tr className="border-b border-slate-800 text-slate-400 font-bold uppercase tracking-wider sticky top-0 bg-[#0f172a] z-10 font-sans">
                                    <th className="pb-3 pr-4">Step (Days)</th>
                                    <th className="pb-3 px-4">k-Effective</th>
                                    <th className="pb-3 px-4">U-235 (atoms/b-cm)</th>
                                    <th className="pb-3 px-4">Xe-135 (atoms/b-cm)</th>
                                    <th className="pb-3 px-4">Sm-149 (atoms/b-cm)</th>
                                    <th className="pb-3 pl-4">Pu-239 (atoms/b-cm)</th>
                                  </tr>
                                </thead>
                                <tbody className="text-slate-300 font-mono">
                                  {simulationResults.depletion.days.map((day, idx) => (
                                    <tr key={idx} className="border-b border-slate-900 hover:bg-slate-900/30">
                                      <td className="py-2.5 pr-4 font-sans font-semibold">{day.toFixed(1)} d</td>
                                      <td className="py-2.5 px-4 font-semibold text-sky-400">{simulationResults.depletion.k_eff[idx].toFixed(5)}</td>
                                      <td className="py-2.5 px-4">
                                        {simulationResults.depletion.u235?.[idx] !== undefined 
                                          ? simulationResults.depletion.u235[idx].toExponential(4) 
                                          : 'N/A'}
                                      </td>
                                      <td className="py-2.5 px-4 text-purple-400">
                                        {simulationResults.depletion.xe135?.[idx] !== undefined 
                                          ? simulationResults.depletion.xe135[idx].toExponential(4) 
                                          : 'N/A'}
                                      </td>
                                      <td className="py-2.5 px-4 text-rose-400">
                                        {simulationResults.depletion.sm149?.[idx] !== undefined 
                                          ? simulationResults.depletion.sm149[idx].toExponential(4) 
                                          : 'N/A'}
                                      </td>
                                      <td className="py-2.5 pl-4 text-amber-400">
                                        {simulationResults.depletion.pu239?.[idx] !== undefined 
                                          ? simulationResults.depletion.pu239[idx].toExponential(4) 
                                          : 'N/A'}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        </>
                      ) : (
                        <div className="panel bg-[#1a1420] border-amber-500/10 p-8 flex flex-col items-center justify-center text-center gap-4">
                          <AlertTriangle className="w-12 h-12 text-amber-500" />
                          <div>
                            <h4 className="text-lg font-bold text-amber-500">Fuel Depletion Analysis Module Inactive</h4>
                            <p className="text-xs text-slate-400 mt-2 max-w-lg">
                              Fuel depletion (burnup) simulation requires coupling with decay chains and takes longer due to sub-stepping. To activate, check the <b>Fuel Depletion / Burnup Analysis</b> module in the <b>Advanced</b> configurator tab and re-run.
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Neutron Economy Tab */}
                  {resultsTab === 'economy' && (
                    <div className="flex flex-col gap-6">
                      {/* Summary Economy Cards */}
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {/* Spectral index Card */}
                        <div className="panel bg-[#0e1626]/60 border-l-4 border-l-sky-400 p-5 flex flex-col justify-between">
                          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Neutron Spectral Index</span>
                          <h4 className="text-3xl font-extrabold text-sky-400 mt-3 font-mono">
                            {simulationResults.spectral_index !== undefined ? simulationResults.spectral_index.toFixed(5) : '0.00000'}
                          </h4>
                          <p className="text-[11px] text-slate-400 mt-2">
                            Fast-to-thermal fission ratio. A value below 0.1 indicates a well-thermalized spectrum typical of PWR assemblies.
                          </p>
                          <div className="w-full bg-slate-900 h-2 rounded-full mt-3 overflow-hidden relative border border-slate-800">
                            <div 
                              className="bg-sky-400 h-full rounded-full transition-all duration-300"
                              style={{ width: `${Math.min(100, (simulationResults.spectral_index || 0) * 400)}%` }}
                            />
                          </div>
                          <div className="flex justify-between text-[9px] text-slate-500 mt-1 font-mono">
                            <span>Thermal (0.0)</span>
                            <span>Epithermal (0.15)</span>
                            <span>Fast (&gt;0.25)</span>
                          </div>
                        </div>

                        {/* Leakage card */}
                        <div className="panel bg-[#0e1626]/60 border-l-4 border-l-rose-400 p-5 flex flex-col justify-between">
                          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Neutron Leakage Fraction</span>
                          <h4 className="text-3xl font-extrabold text-rose-400 mt-3 font-mono">
                            {simulationResults.leakage_rate !== undefined ? `${(simulationResults.leakage_rate * 100).toFixed(4)} %` : '0.0000 %'}
                          </h4>
                          <p className="text-[11px] text-slate-400 mt-2">
                            Percentage of neutrons leaking out of boundaries. Requires <b>Vacuum</b> boundary conditions to be non-zero.
                          </p>
                          <div className="w-full bg-slate-900 h-2 rounded-full mt-3 overflow-hidden relative border border-slate-800">
                            <div 
                              className="bg-rose-400 h-full rounded-full transition-all duration-300"
                              style={{ width: `${Math.min(100, (simulationResults.leakage_rate || 0) * 100)}%` }}
                            />
                          </div>
                          <div className="flex justify-between text-[9px] text-slate-500 mt-1 font-mono">
                            <span>0% (Infinite)</span>
                            <span>5% (High Leakage)</span>
                            <span>10% (Critical Leak)</span>
                          </div>
                        </div>

                        {/* Neutron production proxy card */}
                        <div className="panel bg-[#0e1626]/60 border-l-4 border-l-emerald-400 p-5 flex flex-col justify-between">
                          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Fission Reproduction Factor (&eta;)</span>
                          <h4 className="text-3xl font-extrabold text-emerald-400 mt-3 font-mono">
                            {simulationResults.global_fission_rate > 0 
                              ? (simulationResults.global_neutron_production_rate / simulationResults.global_absorption_rate).toFixed(3) 
                              : '0.000'}
                          </h4>
                          <p className="text-[11px] text-slate-400 mt-2">
                            Average neutrons produced per neutron absorbed in fuel assembly. Must be &gt; 1.0 to sustain chain reactions.
                          </p>
                        </div>
                      </div>

                      {/* Plots */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Neutron balance Pie */}
                        {neutronBalancePlot && (
                          <div className="panel bg-[#0e1626]/80 flex items-center justify-center p-4">
                            <PlotlyChart data={neutronBalancePlot.data} layout={neutronBalancePlot.layout} />
                          </div>
                        )}

                        {/* Reaction rates Bar */}
                        {reactionRatesBarPlot && (
                          <div className="panel bg-[#0e1626]/80 flex items-center justify-center p-4">
                            <PlotlyChart data={reactionRatesBarPlot.data} layout={reactionRatesBarPlot.layout} />
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Shielding & Dosimetry Tab */}
                  {resultsTab === 'shielding' && (
                    <div className="flex flex-col gap-6">
                      {/* Shielding summary card */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Clad DPA card */}
                        <div className="panel bg-[#0e1626]/60 border-l-4 border-l-purple-400 p-5 flex flex-col justify-between">
                          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Cladding Damage Energy (DPA Rate proxy)</span>
                          <h4 className="text-3xl font-extrabold text-purple-400 mt-3 font-mono">
                            {simulationResults.clad_dpa_rate !== undefined && simulationResults.clad_dpa_rate > 0 
                              ? simulationResults.clad_dpa_rate.toExponential(4) 
                              : '0.0000e+0'} <span className="text-sm font-normal text-slate-400">eV/s</span>
                          </h4>
                          <p className="text-[11px] text-slate-400 mt-2">
                            Measures damage energy deposited in the Zircaloy cladding. Used as a proxy for Displacements Per Atom (DPA) to study structural aging and radiation swelling.
                          </p>
                        </div>

                        {/* Peak dose card */}
                        <div className="panel bg-[#0e1626]/60 border-l-4 border-l-amber-400 p-5 flex flex-col justify-between">
                          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Estimated Peak Biological Dose Rate</span>
                          <h4 className="text-3xl font-extrabold text-amber-400 mt-3 font-mono">
                            {simulationResults.dose_rate_map !== undefined 
                              ? `${Math.max(...simulationResults.dose_rate_map.flat()).toExponential(4)} Sv/h` 
                              : '0.0000e+0 Sv/h'}
                          </h4>
                          <p className="text-[11px] text-slate-400 mt-2">
                            Peak calculated dose rate just outside the fuel cladding. Scaled from 3-group fluxes using standard ANSI/ANS flux-to-dose conversion factors.
                          </p>
                        </div>
                      </div>

                      {/* Dose rate Plot */}
                      {doseRatePlot && (
                        <div className="grid grid-cols-1 gap-6">
                          <div className="panel bg-[#0e1626]/80 flex items-center justify-center p-4">
                            <PlotlyChart data={doseRatePlot.data} layout={doseRatePlot.layout} />
                          </div>
                        </div>
                      )}
                    </div>
                  )}

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
                            <span>{datasetStatus.total_cases > 0 ? ((datasetStatus.completed_cases / datasetStatus.total_cases) * 100).toFixed(0) : 0}%</span>
                          </div>
                          <div className="w-full bg-slate-900 h-2.5 rounded-full overflow-hidden">
                            <div 
                              className="bg-sky-400 h-full rounded-full transition-all duration-500" 
                              style={{ width: `${datasetStatus.total_cases > 0 ? (datasetStatus.completed_cases / datasetStatus.total_cases) * 100 : 0}%` }}
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
