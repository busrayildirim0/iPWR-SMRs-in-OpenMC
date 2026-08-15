import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Play, Settings, BarChart2, Layers, Cpu, FileText, Database, 
  Terminal, Shield, Compass, RefreshCw, Download, AlertTriangle, Eye,
  Globe, Sun, Moon
} from 'lucide-react';
import AssemblyVisualizer from './AssemblyVisualizer';
import PlotlyChart from './PlotlyChart';

const API_BASE_URL = ''; // Relative since backend will serve frontend, or standard dev server proxy

const getSimplifiedLogs = (rawLogs, params) => {
  if (!rawLogs) return '';
  const lines = rawLogs.split('\n');
  const filtered = [];
  
  let openmcBatch = 0;
  let g4Batch = 0;
  const totalBatches = params?.batches || 50;
  let hasOpenMC = false;
  let hasG4 = false;
  let printedOpenMCProgress = false;
  let printedG4Progress = false;
  
  const flushOpenMCProgress = () => {
    if (hasOpenMC && !printedOpenMCProgress) {
      const pct = ((openmcBatch / totalBatches) * 100).toFixed(0);
      filtered.push(`🔄 [OpenMC Progress] Batch: ${openmcBatch} / ${totalBatches} (${pct}%)`);
      printedOpenMCProgress = true;
    }
  };
  
  const flushG4Progress = () => {
    if (hasG4 && !printedG4Progress) {
      const pct = ((g4Batch / totalBatches) * 100).toFixed(0);
      filtered.push(`🔄 [Geant4 Progress] Batch: ${g4Batch} / ${totalBatches} (${pct}%)`);
      printedG4Progress = true;
    }
  };
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    
    // Explicitly filter out WARNING lines, Copyright banners, and noisy logs
    if (trimmed.toUpperCase().includes('WARNING') || 
        trimmed.includes('Copyright') || 
        trimmed.includes('Git SHA1') ||
        trimmed.includes('MIT, UChicago')) {
      continue;
    }
    
    // Check for Geant4 start (flushes OpenMC progress)
    if (trimmed.startsWith('Generating Geant4') || trimmed.startsWith('Starting Geant4')) {
      flushOpenMCProgress();
      filtered.push(line);
      continue;
    }
    
    // Check if it's our custom API step message or statepoint
    if (trimmed.startsWith('Generating') || 
        trimmed.startsWith('Starting') || 
        trimmed.startsWith('Simulation finished') || 
        trimmed.startsWith('Job completed') ||
        trimmed.startsWith('Creating state point') ||
        trimmed.startsWith('Error:') ||
        trimmed.includes('Exception occurred')) {
      filtered.push(line);
      continue;
    }
    
    // Parse OpenMC progress
    if (trimmed.includes('Simulating batch')) {
      const match = trimmed.match(/Simulating batch\s+(\d+)/);
      if (match) {
        openmcBatch = Math.max(openmcBatch, parseInt(match[1]));
        hasOpenMC = true;
      }
      continue;
    }
    
    // Parse Geant4 progress
    if (trimmed.includes('[eigen] gen')) {
      const activeMatch = trimmed.match(/\[eigen\] gen\s+(\d+)\s+active/);
      const inactiveMatch = trimmed.match(/\[eigen\] gen\s+(\d+)\s+inactive/);
      if (activeMatch) {
        const activeIdx = parseInt(activeMatch[1]);
        g4Batch = Math.max(g4Batch, activeIdx);
        hasG4 = true;
      } else if (inactiveMatch) {
        const inactiveIdx = parseInt(inactiveMatch[1]);
        g4Batch = Math.max(g4Batch, inactiveIdx);
        hasG4 = true;
      }
      continue;
    }
    
    // Include simulation k-effective & final summary lines
    if (trimmed.includes('k-effective =') ||
        trimmed.includes('Average k-effective') ||
        trimmed.includes('Combined k-effective') ||
        trimmed.includes('Elapsed time')) {
      if (!hasG4) {
        flushOpenMCProgress();
      } else {
        flushG4Progress();
      }
      filtered.push(line);
    }
  }
  
  // Ensure progress lines are flushed at end if not already printed
  flushOpenMCProgress();
  flushG4Progress();
  
  return filtered.join('\n');
};

const localizations = {
  en: {
    appTitle: "OpenMC & Geant4 SMR Neutronics Platform",
    appSub: "Civilian SMR Fuel Assembly Parametric Simulation Dashboard",
    simulation: "Simulation",
    datasetGen: "Dataset Gen",
    openmcActive: "OpenMC & Geant4 Solvers Active",
    configurator: "Assembly Configurator",
    preset: "Preset",
    geometrySettings: "Geometry & Lattice",
    latticeType: "Lattice Type",
    pinPitch: "Pin Pitch (cm)",
    activeHeight: "Active Height (cm)",
    fuelPelletRadius: "Fuel Pellet Radius (cm)",
    gasGapRadius: "Gas Gap Radius (cm)",
    cladOuterRadius: "Clad Outer Radius (cm)",
    guideTubeInner: "GT Inner Radius (cm)",
    guideTubeOuter: "GT Outer Radius (cm)",
    materialSettings: "Materials & Temperatures",
    fuelMaterial: "Fuel Material",
    fuelDensity: "Fuel Density (g/cm³)",
    fuelTemp: "Fuel Temp (K)",
    cladMaterial: "Clad Material",
    coolantTemp: "Coolant Temp (K)",
    solubleBoron: "Soluble Boron (ppm)",
    poisonEnable: "Enable Burnable Poison (Gd₂O₃)",
    poisonWeight: "Gd₂O₃ Weight Fraction (%)",
    controlRodState: "Control Rod State",
    controlRodMaterial: "Absorber Material",
    simulationSettings: "Monte Carlo Engine",
    particles: "Particles per Batch",
    batches: "Active Batches",
    inactiveBatches: "Inactive Batches (Skip)",
    runButton: "Run Assembly Simulation",
    geometryVisualizer: "Geometry Visualizer",
    liveLogs: "Simulation Live Logs",
    simplified: "Simplified",
    rawLogs: "Raw Logs",
    xsNuclide: "Select Nuclide",
    xsTitle: "Microscopic Cross Sections (ENDF/B-VII.1)",
    xsLoading: "Loading ENDF/B-VII.1 libraries...",
    xsError: "Could not retrieve nuclear database cross-section records.",
    sweepsConfig: "Parametric Sweeps Config",
    enrichmentRange: "U-235 Enrichment range (%)",
    boronRange: "Soluble Boron range (ppm)",
    fuelTempRange: "Fuel Temperature range (K)",
    coolantTempRange: "Coolant Temperature range (K)",
    poisonRange: "Burnable Poison Gd₂O₃ range (wt %)",
    cladThickRange: "Cladding Thickness range (cm)",
    lhsSamples: "Latin Hypercube Samples (N)",
    lhsSamplesSub: "Determines the exact total number of valid simulated points generated inside the parameter space.",
    queueTitle: "Generation Queue",
    status: "Status",
    statusInactive: "Inactive",
    statusGenerating: "Generating Cases...",
    completed: "Completed",
    percentage: "Percentage",
    currentCase: "Current Case Parameters",
    stopGen: "Stop Dataset Generation",
    startGen: "Start Iterative Generation",
    downloadCsv: "Download Generated CSV",
    alertTitle: "Dataset Generation Mode Alert",
    alertSub: "Dataset generation mode sweeps across variables using Latin Hypercube Sampling (LHS). Every simulated point dynamically inherits the fixed reactor geometries and Monte Carlo engine specifications (particles, active/inactive batches, boundary conditions) configured directly inside the Assembly Configurator.",
    controlVariables: "Control Variables (Constants)",
    lattice: "Lattice",
    boundary: "Boundary",
    reflective: "Reflective",
    fixed: "Fixed",
    constantsSub: "* Constant parameters are locked to the current Active Configurator state to minimize noise in critical ML training targets.",
    resultsPanel: "Results & Analyses",
    keffCard: "Infinite Multiplication Factor (k∞)",
    reactivityCard: "Excess Reactivity (ρ)",
    peakingCard: "Pin Power Peaking Factor (Fq)",
    dpaCard: "Cladding Damage Energy (DPA Rate proxy)",
    doseCard: "Estimated Peak Biological Dose Rate",
    spectralIndexCard: "Neutron Spectral Index",
    leakageCard: "Neutron Leakage Fraction",
    reproductionCard: "Fission Reproduction Factor (η)",
    enrichment: "U-235 Enrichment",
    cladThickness: "Clad Thickness"
  },
  tr: {
    appTitle: "OpenMC & Geant4 SMR Nötronik Platformu",
    appSub: "Sivil SMR Yakıt Demeti Parametrik Simülasyon Paneli",
    simulation: "Simülasyon",
    enrichment: "U-235 Zenginliği",
    cladThickness: "Kaplama Kalınlığı",
    datasetGen: "Veri Seti Üret",
    openmcActive: "OpenMC ve Geant4 Çözücüleri Aktif",
    configurator: "Demet Konfigüratörü",
    preset: "Şablon",
    geometrySettings: "Geometri ve Dizilim",
    latticeType: "Dizilim Tipi",
    pinPitch: "Çubuk Adımı (Pitch - cm)",
    activeHeight: "Aktif Yakıt Boyu (cm)",
    fuelPelletRadius: "Yakıt Pelet Yarıçapı (cm)",
    gasGapRadius: "Gaz Boşluğu Yarıçapı (cm)",
    cladOuterRadius: "Kaplama Dış Yarıçapı (cm)",
    guideTubeInner: "Kılavuz Tüp İç Yarıçapı (cm)",
    guideTubeOuter: "Kılavuz Tüp Dış Yarıçapı (cm)",
    materialSettings: "Malzemeler ve Sıcaklıklar",
    fuelMaterial: "Yakıt Malzemesi",
    fuelDensity: "Yakıt Yoğunluğu (g/cm³)",
    fuelTemp: "Yakıt Sıcaklığı (K)",
    cladMaterial: "Kaplama Malzemesi",
    coolantTemp: "Soğutucu Sıcaklığı (K)",
    solubleBoron: "Çözünmüş Bor (ppm)",
    poisonEnable: "Yanabilir Zehir Etkinleştir (Gd₂O₃)",
    poisonWeight: "Gd₂O₃ Ağırlık Oranı (%)",
    controlRodState: "Kontrol Çubuğu Konumu",
    controlRodMaterial: "Absorber Malzemesi",
    simulationSettings: "Monte Carlo Motoru",
    particles: "Parçacık Sayısı (Batch başına)",
    batches: "Aktif Batch Sayısı",
    inactiveBatches: "Aktif Olmayan Batch Sayısı",
    runButton: "Demet Simülasyonunu Başlat",
    geometryVisualizer: "Geometri Görselleştirici",
    liveLogs: "Simülasyon Canlı Logları",
    simplified: "Basitleştirilmiş",
    rawLogs: "Ham Loglar",
    xsNuclide: "Nükleer İzotop Seçin",
    xsTitle: "Mikroskopik Tesir Kesitleri (ENDF/B-VII.1)",
    xsLoading: "ENDF/B-VII.1 kütüphaneleri yükleniyor...",
    xsError: "Nükleer veri tabanı tesir kesiti kayıtları alınamadı.",
    sweepsConfig: "Parametrik Tarama (LHS) Ayarları",
    enrichmentRange: "U-235 Zenginlik Aralığı (%)",
    boronRange: "Çözünmüş Bor Aralığı (ppm)",
    fuelTempRange: "Yakıt Sıcaklığı Aralığı (K)",
    coolantTempRange: "Soğutucu Sıcaklığı Aralığı (K)",
    poisonRange: "Yanabilir Zehir Gd₂O₃ Aralığı (wt %)",
    cladThickRange: "Kaplama Kalınlığı Aralığı (cm)",
    lhsSamples: "Latin Hiperküp Örnekleme Sayısı (N)",
    lhsSamplesSub: "Parametre uzayında üretilecek ve simüle edilecek toplam geçerli nokta sayısını belirler.",
    queueTitle: "Veri Üretim Kuyruğu",
    status: "Durum",
    statusInactive: "Pasif",
    statusGenerating: "Simülasyonlar Çalışıyor...",
    completed: "Tamamlanan",
    percentage: "Yüzde",
    currentCase: "Aktif Simülasyon Parametreleri",
    stopGen: "Veri Üretimini Durdur",
    startGen: "İteratif Veri Üretimini Başlat",
    downloadCsv: "Üretilen CSV Dosyasını İndir",
    alertTitle: "Veri Seti Üretim Modu Uyarısı",
    alertSub: "Veri seti üretimi, Latin Hiperküp Örneklemesi (LHS) kullanarak değişken parametreleri tarar. Simüle edilen her durum, doğrudan Demet Konfigüratörü sekmesinde ayarladığınız sabit reaktör geometrilerini ve Monte Carlo motor ayarlarını (parçacıklar, aktif/inaktif batch sayıları, sınır koşulları) dinamik olarak devralır.",
    controlVariables: "Sabit Tutulan Parametreler (Kontrol Değişkenleri)",
    lattice: "Dizilim",
    boundary: "Sınır Koşulu",
    reflective: "Yansıtıcı",
    fixed: "Sabit",
    constantsSub: "* Sabit parametreler, makine öğrenmesi modellerindeki gürültüyü azaltmak için o anki aktif Konfigüratör ayarlarına kilitlenmiştir.",
    resultsPanel: "Analiz Sonuçları ve Grafikler",
    keffCard: "Sonsuz Çoğaltma Faktörü (k∞)",
    reactivityCard: "Fazla Reaktivite (ρ)",
    peakingCard: "Pik Güç Faktörü (Fq)",
    dpaCard: "Kaplama Hasar Enerjisi (DPA Rate proxy)",
    doseCard: "Tahmini Pik Biyolojik Doz Hızı",
    spectralIndexCard: "Nötron Spektrum İndeksi",
    leakageCard: "Nötron Sızıntı Oranı",
    reproductionCard: "Fisyon Üretim Faktörü (η)"
  }
};

export default function Dashboard() {
  const theme = 'dark';
  const [lang, setLang] = useState(() => localStorage.getItem('lang') || 'tr');
  
  const toggleLang = () => {
    const nextLang = lang === 'en' ? 'tr' : 'en';
    setLang(nextLang);
    localStorage.setItem('lang', nextLang);
  };

  const t = (key) => {
    return localizations[lang][key] || key;
  };

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
    flux_3d_enabled: false,
    fuel_material: 'UO2',
    fuel_density: 10.42,
    fuel_temperature: 900.0,
    run_openmc: true,
    run_geant4: true,
    g4_k_only: false
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
  const [activeOverlayG4, setActiveOverlayG4] = useState('none');
  const [activeOverlayOpenMC, setActiveOverlayOpenMC] = useState('none');
  
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
    boron_min: 0,
    boron_max: 2000,
    fuel_temp_min: 600,
    fuel_temp_max: 1200,
    coolant_temp_min: 500,
    coolant_temp_max: 600,
    poison_min: 0.0,
    poison_max: 8.0,
    clad_thick_min: 0.03,
    clad_thick_max: 0.08,
    num_samples: 50,
    engine: 'openmc'
  });
  const [datasetStatus, setDatasetStatus] = useState({
    active: false,
    total_cases: 0,
    completed_cases: 0,
    current_params: {}
  });

  // Nuclear Database Cross Section states
  const [xsData, setXsData] = useState(null);
  const [xsLoading, setXsLoading] = useState(false);
  const [selectedXsNuclide, setSelectedXsNuclide] = useState('U235');

  // Ref for log console auto-scrolling
  const logConsoleRef = useRef(null);
  const alertedJobIdRef = useRef(null);

  // Fetch SMR Presets on mount
  useEffect(() => {
    fetch('api/presets')
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
            fuel_material: 'UO2',
            fuel_density: 10.42,
            fuel_temperature: 900.0,
            run_openmc: true,
            run_geant4: true,
            g4_k_only: false,
            ...data.NuScale
          });
        }
      })
      .catch(err => console.error("Error loading presets:", err));
  }, []);

  // Fetch Cross-Sections when 'xs' tab is selected
  useEffect(() => {
    if (resultsTab === 'xs' && !xsData && !xsLoading) {
      setXsLoading(true);
      fetch('api/nuclear-data/xs')
        .then(res => {
          if (!res.ok) throw new Error("Could not fetch nuclear database");
          return res.json();
        })
        .then(data => {
          setXsData(data);
          setXsLoading(false);
        })
        .catch(err => {
          console.error("Error loading cross sections:", err);
          setXsLoading(false);
        });
    }
  }, [resultsTab, xsData, xsLoading]);

  // Poll dataset generator status periodically
  useEffect(() => {
    let interval = null;
    if (mainTab === 'dataset' || datasetStatus.active) {
      const checkStatus = () => {
        fetch('api/dataset/status')
          .then(res => res.json())
          .then(data => {
            setDatasetStatus(prev => {
              if (prev.active && !data.active && data.job_id && (data.job_id === prev.job_id || !prev.job_id) && alertedJobIdRef.current !== data.job_id) {
                alertedJobIdRef.current = data.job_id;
                setTimeout(() => {
                  if (data.status === 'stopped') {
                    alert(lang === 'en' ? "Dataset Generation stopped." : "Veri seti üretimi durduruldu.");
                  } else {
                    alert(lang === 'en' ? "Dataset Generation completed!" : "Veri seti üretimi tamamlandı!");
                  }
                }, 50);
              }
              return data;
            });
          })
          .catch(err => console.error("Error checking dataset status:", err));
      };
      
      checkStatus();
      interval = setInterval(checkStatus, 3000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [mainTab, datasetStatus.active, lang]);

  // Handle Preset selection change
  const handlePresetChange = (name) => {
    setActivePreset(name);
    if (name === 'Custom') return;
    if (presets[name]) {
      setParams(prev => ({
        boundary_type: 'Reflective',
        kinetics_enabled: false,
        safety_coefs_enabled: false,
        depletion_enabled: false,
        shielding_enabled: false,
        economy_enabled: false,
        flux_3d_enabled: false,
        fuel_material: 'UO2',
        fuel_density: 10.42,
        fuel_temperature: 900.0,
        run_openmc: true,
        run_geant4: true,
        g4_k_only: prev.g4_k_only !== undefined ? prev.g4_k_only : false,
        ...presets[name]
      }));
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
    
    fetch('api/simulate', {
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
      fetch(`api/job/${id}/logs`)
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
      fetch(`api/job/${id}/status`)
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
    fetch(`api/job/${id}/results`)
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
      num_samples: parseInt(datasetParams.num_samples) || 10,
      reactor_preset: activePreset,
      base_params: params
    };
    
    fetch('api/dataset/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dParams)
    })
      .then(res => {
        if (!res.ok) {
          return res.json().then(err => { throw new Error(err.detail || "Server error"); });
        }
        return res.json();
      })
      .then(data => {
        setDatasetStatus(prev => ({
          ...prev,
          active: true,
          total_cases: dParams.num_samples,
          completed_cases: 0,
          job_id: data.job_id
        }));
      })
      .catch(err => alert("Error starting dataset generation: " + err.message));
  };

  // Stop dataset generation
  const stopDatasetGeneration = () => {
    fetch('api/dataset/stop', { method: 'POST' })
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
  // ----------------------------------------------------
  // Dynamic Plots & Metrics Helpers for Solver Comparison
  // ----------------------------------------------------
  const getFineMapPlot = (res, overlay, title) => {
    if (!res || overlay === 'none') return null;
    let zData = null;
    let colorscale = 'Inferno';
    let label = title;
    let zmin = undefined;
    let zmax = undefined;
    
    const powerMap = res.relative_power_map || res.pin_power_map;
    
    if (overlay === 'power' && powerMap) {
      zData = powerMap;
      label = title + ' - Pin Power Map';
      zmin = 0.0;
      zmax = 1.6;
      colorscale = 'Reds';
    } else if (overlay === 'flux' && res.flux_map) {
      zData = res.flux_map;
      label = title + ' - Neutron Flux';
      colorscale = 'Viridis';
    } else if (overlay === 'absorption' && res.absorption_map) {
      zData = res.absorption_map;
      label = title + ' - Neutron Absorption';
      colorscale = 'Hot';
    }
    if (!zData) return null;
    return {
      data: [{
        z: zData,
        type: 'heatmap',
        colorscale: colorscale,
        showscale: true,
        zmin: zmin,
        zmax: zmax,
        colorbar: { thickness: 12, len: 0.9 }
      }],
      layout: {
        title: label,
        xaxis: { title: 'X-Index', gridcolor: '#3A3E45' },
        yaxis: { title: 'Y-Index', gridcolor: '#3A3E45' },
        margin: { l: 45, r: 15, t: 35, b: 35 },
        height: 340,
        paper_bgcolor: 'rgba(0,0,0,0)',
        plot_bgcolor: 'rgba(0,0,0,0)',
        font: { color: '#F5F5F5' }
      }
    };
  };

  const getEnergySpectrumPlot = (res, title, color) => {
    if (!res?.energy_spectrum_centers) return null;
    const centers = [];
    const flux = [];
    for (let i = 0; i < res.energy_spectrum_centers.length; i++) {
      const f = res.energy_spectrum_flux[i];
      const c = res.energy_spectrum_centers[i];
      if (f > 0 && c > 0) {
        centers.push(c);
        flux.push(f);
      }
    }
    if (centers.length === 0) return null;
    return {
      data: [{
        x: centers,
        y: flux,
        type: 'scatter',
        mode: 'lines',
        name: 'Neutron Flux',
        line: { color: color, width: 2 }
      }],
      layout: {
        title: title,
        xaxis: { title: 'Neutron Energy (eV)', type: 'log', gridcolor: '#3A3E45' },
        yaxis: { title: 'Normalized Flux [ϕ(u)/ϕ_tot]', type: 'log', gridcolor: '#3A3E45' },
        margin: { l: 55, r: 15, t: 35, b: 45 },
        height: 260,
        paper_bgcolor: 'rgba(0,0,0,0)',
        plot_bgcolor: 'rgba(0,0,0,0)',
        font: { color: '#F5F5F5' }
      }
    };
  };

  const getAxialPowerPlot = (res, title, color) => {
    if (!res?.axial_power_profile) return null;
    const n = res.axial_power_profile.length;
    const zHeights = res.axial_z_heights || res.axial_power_profile.map((_, i) => ((i + 0.5) / n) * 200);
    const profile = res.axial_power_profile;
    return {
      data: [{
        x: profile,
        y: zHeights,
        type: 'scatter',
        mode: 'lines',
        name: 'Axial Power',
        line: { color: color, width: 2.5 }
      }],
      layout: {
        title: title,
        xaxis: { 
          title: lang === 'en' ? 'Relative Power (P/P_avg)' : 'Göreceli Güç (P/P_avg)', 
          gridcolor: '#3A3E45',
          range: [0, 2.0]
        },
        yaxis: { title: lang === 'en' ? 'Active Height (cm)' : 'Aktif Yükseklik (cm)', gridcolor: '#3A3E45' },
        margin: { l: 45, r: 15, t: 35, b: 35 },
        height: 260,
        paper_bgcolor: 'rgba(0,0,0,0)',
        plot_bgcolor: 'rgba(0,0,0,0)',
        font: { color: '#F5F5F5' }
      }
    };
  };

  const getEntropyPlot = (res, title, color, markerColor) => {
    if (!res?.shannon_entropy || res.shannon_entropy.length === 0) return null;
    const inactiveCount = res.inactive_batches || 0;
    const shapes = inactiveCount > 0 ? [{
      type: 'line',
      xref: 'x',
      yref: 'paper',
      x0: inactiveCount + 0.5,
      y0: 0,
      x1: inactiveCount + 0.5,
      y1: 1,
      line: { color: '#ef4444', width: 1.5, dash: 'dash' }
    }] : [];
    const annotations = inactiveCount > 0 ? [{
      x: inactiveCount + 0.5,
      y: 0.9,
      xref: 'x',
      yref: 'paper',
      text: 'Active Cycles Begin',
      showarrow: false,
      textangle: -90,
      xanchor: 'right',
      yanchor: 'top',
      font: { color: '#ef4444', size: 9 }
    }] : [];

    return {
      data: [{
        x: Array.from({ length: res.shannon_entropy.length }, (_, i) => i + 1),
        y: res.shannon_entropy,
        type: 'scatter',
        mode: 'lines+markers',
        name: 'Entropy',
        line: { color: color, width: 2 },
        marker: { size: 4, color: markerColor }
      }],
      layout: {
        title: title,
        xaxis: { title: 'Batch (Generation)', gridcolor: '#3A3E45' },
        yaxis: { title: 'Entropy H (bits)', gridcolor: '#3A3E45' },
        margin: { l: 45, r: 15, t: 35, b: 35 },
        height: 240,
        paper_bgcolor: 'rgba(0,0,0,0)',
        plot_bgcolor: 'rgba(0,0,0,0)',
        font: { color: '#F5F5F5' },
        shapes,
        annotations
      }
    };
  };

  const getKeffPlot = (res, title, color) => {
    if (!res?.batch_keff || res.batch_keff.length === 0) return null;
    const inactiveCount = res.inactive_batches || 0;
    const shapes = inactiveCount > 0 ? [{
      type: 'line',
      xref: 'x',
      yref: 'paper',
      x0: inactiveCount + 0.5,
      y0: 0,
      x1: inactiveCount + 0.5,
      y1: 1,
      line: { color: '#ef4444', width: 1.5, dash: 'dash' }
    }] : [];
    const annotations = inactiveCount > 0 ? [{
      x: inactiveCount + 0.5,
      y: 0.9,
      xref: 'x',
      yref: 'paper',
      text: 'Active Cycles Begin',
      showarrow: false,
      textangle: -90,
      xanchor: 'right',
      yanchor: 'top',
      font: { color: '#ef4444', size: 9 }
    }] : [];

    return {
      data: [{
        x: Array.from({ length: res.batch_keff.length }, (_, i) => i + 1),
        y: res.batch_keff,
        type: 'scatter',
        mode: 'lines',
        name: 'Batch k-eff',
        line: { color: color, width: 1.5 }
      }],
      layout: {
        title: title,
        xaxis: { title: 'Batch', gridcolor: '#3A3E45' },
        yaxis: { title: 'k-eff', gridcolor: '#3A3E45' },
        margin: { l: 45, r: 15, t: 35, b: 35 },
        height: 240,
        paper_bgcolor: 'rgba(0,0,0,0)',
        plot_bgcolor: 'rgba(0,0,0,0)',
        font: { color: '#F5F5F5' },
        shapes,
        annotations
      }
    };
  };

  const renderEngineMetrics = (engineData, title, colorClass) => {
    return (
      <div className="panel bg-[#22242B] p-5 border border-[#3A3E45] rounded-[20px] flex flex-col gap-4">
        <h3 className={`text-sm font-bold text-center border-b border-[#3A3E45] pb-3 ${colorClass} tracking-wider`}>
          {title}
        </h3>
        
        {/* Metrics Grid */}
        <div className="grid grid-cols-2 gap-4">
          <div className="panel bg-slate-900/40 p-4 border-l-4 border-l-blue-400 flex flex-col justify-between rounded-[10px]">
            <span className="text-[10px] font-bold text-[#A0A7B4] uppercase tracking-wider">Collision k-Effective</span>
            <h4 className="text-lg font-bold text-[#F5F5F5] mt-2 font-mono">
              {engineData?.k_collision ? engineData.k_collision[0].toFixed(5) : (engineData?.k_eff?.toFixed(5) ?? "N/A")}
            </h4>
            <span className="text-[10px] text-[#7A828F] mt-1">σ: {engineData?.k_collision ? engineData.k_collision[1].toFixed(5) : (engineData?.k_eff_std?.toFixed(5) ?? "N/A")}</span>
          </div>

          <div className="panel bg-slate-900/40 p-4 border-l-4 border-l-cyan-400 flex flex-col justify-between rounded-[10px]">
            <span className="text-[10px] font-bold text-[#A0A7B4] uppercase tracking-wider">Track-Length k-Effective</span>
            <h4 className="text-lg font-bold text-[#F5F5F5] mt-2 font-mono">
              {engineData?.k_tracklength ? engineData.k_tracklength[0].toFixed(5) : (engineData?.k_eff?.toFixed(5) ?? "N/A")}
            </h4>
            <span className="text-[10px] text-[#7A828F] mt-1">σ: {engineData?.k_tracklength ? engineData.k_tracklength[1].toFixed(5) : (engineData?.k_eff_std?.toFixed(5) ?? "N/A")}</span>
          </div>

          <div className="panel bg-slate-900/40 p-4 border-l-4 border-l-pink-400 flex flex-col justify-between rounded-[10px]">
            <span className="text-[10px] font-bold text-[#A0A7B4] uppercase tracking-wider">Absorption k-Effective</span>
            <h4 className="text-lg font-bold text-[#F5F5F5] mt-2 font-mono">
              {engineData?.k_absorption ? engineData.k_absorption[0].toFixed(5) : (engineData?.k_eff?.toFixed(5) ?? "N/A")}
            </h4>
            <span className="text-[10px] text-[#7A828F] mt-1">σ: {engineData?.k_absorption ? engineData.k_absorption[1].toFixed(5) : (engineData?.k_eff_std?.toFixed(5) ?? "N/A")}</span>
          </div>

          <div className="panel bg-slate-900/40 p-4 border-l-4 border-l-emerald-400 flex flex-col justify-between rounded-[10px]">
            <span className="text-[10px] font-bold text-[#A0A7B4] uppercase tracking-wider">Combined k-Effective (k∞)</span>
            <h4 className="text-lg font-bold text-[#2DD4BF] mt-2 font-mono">
              {engineData?.k_combined ? engineData.k_combined[0].toFixed(5) : (engineData?.k_eff?.toFixed(5) ?? "N/A")}
            </h4>
            <span className="text-[10px] text-[#7A828F] mt-1">σ: {engineData?.k_combined ? engineData.k_combined[1].toFixed(5) : (engineData?.k_eff_std?.toFixed(5) ?? "N/A")}</span>
          </div>

          <div className="panel bg-slate-900/40 p-4 border-l-4 border-l-sky-400 flex flex-col justify-between rounded-[10px]">
            <span className="text-[10px] font-bold text-[#A0A7B4] uppercase tracking-wider">Excess Reactivity (ρ)</span>
            <h4 className="text-lg font-bold text-[#F5F5F5] mt-2 font-mono">
              {engineData?.reactivity?.toFixed(5) ?? "N/A"}
            </h4>
            <span className="text-[10px] text-[#7A828F] mt-1">pcm: {engineData?.reactivity !== undefined ? (engineData.reactivity * 1e5).toFixed(0) : "N/A"}</span>
          </div>

          <div className="panel bg-slate-900/40 p-4 border-l-4 border-l-purple-400 flex flex-col justify-between rounded-[10px]">
            <span className="text-[10px] font-bold text-[#A0A7B4] uppercase tracking-wider">Hot Channel Factor</span>
            <h4 className="text-lg font-bold text-[#F5F5F5] mt-2 font-mono">
              {engineData?.hot_channel_factor?.toFixed(3) ?? "N/A"}
            </h4>
            <span className="text-[10px] text-[#7A828F] mt-1">Safe Limit: &lt; 1.5</span>
          </div>

          <div className="panel bg-slate-900/40 p-4 border-l-4 border-l-amber-400 flex flex-col justify-between rounded-[10px]">
            <span className="text-[10px] font-bold text-[#A0A7B4] uppercase tracking-wider">Peak Power Factor</span>
            <h4 className="text-lg font-bold text-[#F5F5F5] mt-2 font-mono">
              {engineData?.peak_power_factor?.toFixed(3) ?? "N/A"}
            </h4>
            <span className="text-[10px] text-[#7A828F] mt-1">Max Pin / Average Pin</span>
          </div>

          <div className="panel bg-slate-900/40 p-4 border-l-4 border-l-teal-400 flex flex-col justify-between rounded-[10px]">
            <span className="text-[10px] font-bold text-[#A0A7B4] uppercase tracking-wider">Avg Neutrons / Fission (ν̄)</span>
            <h4 className="text-lg font-bold text-[#F5F5F5] mt-2 font-mono">
              {engineData?.avg_nu ? engineData.avg_nu.toFixed(4) : "N/A"}
            </h4>
            <span className="text-[10px] text-[#7A828F] mt-1">Neutron Yield Per Fission</span>
          </div>

          <div className="panel bg-slate-900/40 p-4 border-l-4 border-l-orange-400 flex flex-col justify-between rounded-[10px]">
            <span className="text-[10px] font-bold text-[#A0A7B4] uppercase tracking-wider">Source Shannon Entropy</span>
            <h4 className="text-lg font-bold text-[#F5F5F5] mt-2 font-mono">
              {engineData?.shannon_entropy && engineData.shannon_entropy.length > 0 
                ? `${engineData.shannon_entropy[engineData.shannon_entropy.length - 1].toFixed(4)} bits` 
                : "N/A"}
            </h4>
            <span className="text-[10px] text-[#7A828F] mt-1">Grid: 17x17 (Max: 8.175)</span>
          </div>
        </div>
      </div>
    );
  };

  const energySpectrumPlot = useMemo(() => {
    if (!simulationResults?.energy_spectrum_centers) return null;
    
    // Filter out non-positive values to prevent Plotly rendering failures on log-log axis
    const centers = [];
    const flux = [];
    for (let i = 0; i < simulationResults.energy_spectrum_centers.length; i++) {
      const f = simulationResults.energy_spectrum_flux[i];
      const c = simulationResults.energy_spectrum_centers[i];
      if (f > 0 && c > 0) {
        centers.push(c);
        flux.push(f);
      }
    }
    
    if (centers.length === 0) return null;
    
    return {
      data: [{
        x: centers,
        y: flux,
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

  const axialPowerPlot = useMemo(() => {
    if (!simulationResults?.axial_power_profile) return null;
    const n = simulationResults.axial_power_profile.length;
    const zHeights = simulationResults.axial_z_heights || simulationResults.axial_power_profile.map((_, i) => ((i + 0.5) / n) * 200);
    const profile = simulationResults.axial_power_profile;
    return {
      data: [{
        x: profile,
        y: zHeights,
        type: 'scatter',
        mode: 'lines',
        name: 'Axial Power',
        line: { color: '#fb7185', width: 2.5 }
      }],
      layout: {
        title: lang === 'en' ? 'Normalized Axial Power Profile' : 'Normalize Eksenel Güç Profili',
        xaxis: { 
          title: lang === 'en' ? 'Relative Power (normalized to average)' : 'Göreceli Güç (ortalama = 1.0)', 
          gridcolor: '#1e293b',
          range: [0, 2.0]
        },
        yaxis: { title: lang === 'en' ? 'Active Height (cm)' : 'Aktif Yükseklik (cm)', gridcolor: '#1e293b' },
        margin: { l: 50, r: 20, t: 40, b: 40 },
        height: 280
      }
    };
  }, [simulationResults, lang]);

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
        xaxis: { title: 'Reaction Channel', gridcolor: '#1e293b' },
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

  // Microscopic Cross Sections Plotly configuration
  const xsPlot = useMemo(() => {
    if (!xsData || !xsData[selectedXsNuclide]) return null;
    const nucData = xsData[selectedXsNuclide];
    const traces = [];
    
    if (nucData.fission) {
      traces.push({
        x: nucData.energy,
        y: nucData.fission,
        type: 'scatter',
        mode: 'lines',
        name: 'Fission (σf)',
        line: { color: '#ef4444', width: 2 }
      });
    }
    if (nucData.capture) {
      traces.push({
        x: nucData.energy,
        y: nucData.capture,
        type: 'scatter',
        mode: 'lines',
        name: 'Capture (σγ)',
        line: { color: '#38bdf8', width: 2 }
      });
    }
    if (nucData.scatter) {
      traces.push({
        x: nucData.energy,
        y: nucData.scatter,
        type: 'scatter',
        mode: 'lines',
        name: 'Elastic Scatter (σs)',
        line: { color: '#10b981', width: 1.5 }
      });
    }
    
    return {
      data: traces,
      layout: {
        title: `${selectedXsNuclide} Microscopic Cross-Sections`,
        xaxis: {
          title: 'Neutron Energy (eV)',
          type: 'log',
          gridcolor: '#1e293b'
        },
        yaxis: {
          title: 'Cross Section (barns)',
          type: 'log',
          gridcolor: '#1e293b'
        },
        margin: { l: 60, r: 20, t: 40, b: 50 },
        height: 360,
        paper_bgcolor: 'rgba(0,0,0,0)',
        plot_bgcolor: 'rgba(0,0,0,0)',
        font: { color: '#cbd5e1' }
      }
    };
  }, [xsData, selectedXsNuclide]);

  return (
    <div className={`min-h-screen flex flex-col ${theme === 'dark' ? 'bg-[#17191E]' : 'bg-slate-50'}`}>
      {/* Platform Header */}
      <header className="app-header">
        <div className="app-title-group">
          <Shield className="w-8 h-8 text-sky-400" />
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-100">{t('appTitle')}</h1>
            <p className="text-xs text-slate-400">{t('appSub')}</p>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          {/* Main platform Mode tabs */}
          <div className="bg-slate-900/40 border border-slate-800/80 rounded-lg p-1 flex gap-1 shadow-inner">
            <button 
              className={`tab-btn ${mainTab === 'simulation' ? 'active' : ''}`}
              onClick={() => setMainTab('simulation')}
            >
              <Cpu className="w-3.5 h-3.5" /> {t('simulation')}
            </button>
            <button 
              className={`tab-btn ${mainTab === 'dataset' ? 'active' : ''}`}
              onClick={() => setMainTab('dataset')}
            >
              <Database className="w-3.5 h-3.5" /> {t('datasetGen')}
            </button>
          </div>
          
          {/* Language Toggle Switch (Sliding) */}
          <div className="switch-container mx-1" title="Switch Language / Dili Değiştir">
            <Globe className="w-3.5 h-3.5 text-sky-400" />
            <span className="text-[10px] font-bold text-slate-400">TR</span>
            <label className="toggle-switch">
              <input 
                type="checkbox" 
                checked={lang === 'en'} 
                onChange={toggleLang} 
              />
              <span className="toggle-slider"></span>
            </label>
            <span className="text-[10px] font-bold text-slate-400">EN</span>
          </div>




        </div>
      </header>

      {/* Main Grid Section */}
      <main className="dashboard-grid flex-1 w-full max-w-[1800px] gap-6 p-6">
        
        {/* Left Parameter configurator Panel */}
        <section className="panel flex flex-col gap-6 h-fit max-h-[85vh] overflow-y-auto">
          <div className="panel-header">
            <h2 className="panel-title"><Settings className="w-4 h-4 text-sky-400" /> {t('configurator')}</h2>
            <select
              value={activePreset}
              onChange={(e) => handlePresetChange(e.target.value)}
              className="bg-slate-900 border border-slate-800 rounded px-2.5 py-1 text-xs text-sky-400 font-semibold cursor-pointer"
            >
              <option value="NuScale">NuScale {t('preset')}</option>
              <option value="SMR-160">SMR-160 {t('preset')}</option>
              <option value="CAREM-25">CAREM-25 {t('preset')}</option>
              <option value="SMART">SMART {t('preset')}</option>
              <option value="BEAVRS">BEAVRS {t('preset')}</option>
              <option value="Custom">{lang === 'en' ? 'Custom / Modified' : 'Özel / Değiştirilmiş'}</option>
            </select>
          </div>

          {/* Config sub-tabs */}
          <div className="flex bg-slate-955/50 p-1 rounded-xl border border-slate-900 gap-1.5 mb-2 w-full overflow-hidden shrink-0">
            <button
              onClick={() => setConfigTab('geometry')}
              className={`flex-1 py-1.5 px-1 rounded-lg text-center text-[10px] font-extrabold transition-all whitespace-nowrap border ${
                configTab === 'geometry' 
                  ? 'bg-[#0F3F36] text-[#F5F5F5] border-[rgba(45,212,191,0.35)] shadow-[0_3px_0_#07221d,inset_0_1px_0_rgba(255,255,255,0.15),0_2px_4px_rgba(0,0,0,0.25)] -translate-y-[1px]' 
                  : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/50 -translate-y-0 shadow-none'
              }`}
            >
              {lang === 'en' ? 'Geometry' : 'Geometri'}
            </button>
            <button
              onClick={() => setConfigTab('materials')}
              className={`flex-1 py-1.5 px-1 rounded-lg text-center text-[10px] font-extrabold transition-all whitespace-nowrap border ${
                configTab === 'materials' 
                  ? 'bg-[#0F3F36] text-[#F5F5F5] border-[rgba(45,212,191,0.35)] shadow-[0_3px_0_#07221d,inset_0_1px_0_rgba(255,255,255,0.15),0_2px_4px_rgba(0,0,0,0.25)] -translate-y-[1px]' 
                  : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/50 -translate-y-0 shadow-none'
              }`}
            >
              {lang === 'en' ? 'Materials' : 'Malzeme'}
            </button>
            <button
              onClick={() => setConfigTab('simulation')}
              className={`flex-1 py-1.5 px-1 rounded-lg text-center text-[10px] font-extrabold transition-all whitespace-nowrap border ${
                configTab === 'simulation' 
                  ? 'bg-[#0F3F36] text-[#F5F5F5] border-[rgba(45,212,191,0.35)] shadow-[0_3px_0_#07221d,inset_0_1px_0_rgba(255,255,255,0.15),0_2px_4px_rgba(0,0,0,0.25)] -translate-y-[1px]' 
                  : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/50 -translate-y-0 shadow-none'
              }`}
            >
              {lang === 'en' ? 'Engine' : 'Motor'}
            </button>
            <button
              onClick={() => setConfigTab('advanced')}
              className={`flex-1 py-1.5 px-1 rounded-lg text-center text-[10px] font-extrabold transition-all whitespace-nowrap border ${
                configTab === 'advanced' 
                  ? 'bg-[#0F3F36] text-[#F5F5F5] border-[rgba(45,212,191,0.35)] shadow-[0_3px_0_#07221d,inset_0_1px_0_rgba(255,255,255,0.15),0_2px_4px_rgba(0,0,0,0.25)] -translate-y-[1px]' 
                  : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/50 -translate-y-0 shadow-none'
              }`}
            >
              {lang === 'en' ? 'Advanced' : 'Gelişmiş'}
            </button>
          </div>

          {/* Tab parameters details */}
          <div className="flex-1 flex flex-col gap-4">
            {configTab === 'geometry' && (
              <>
                <div className="form-group">
                  <label className="form-label">{t('latticeType')}</label>
                  <select
                    value={params.lattice_type}
                    onChange={(e) => handleParamChange('lattice_type', e.target.value)}
                    className="form-select text-slate-200"
                  >
                    <option value="Square">{lang === 'en' ? 'Square Lattice (17x17)' : 'Kare Dizilim (17x17)'}</option>
                    <option value="Hexagonal">{lang === 'en' ? 'Hexagonal Lattice (127-pin)' : 'Altıgen Dizilim (127-Pin)'}</option>
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="form-group">
                    <label className="form-label">{t('activeHeight')}</label>
                    <input
                      type="number"
                      value={params.active_height}
                      onChange={(e) => handleParamChange('active_height', parseFloat(e.target.value))}
                      className="form-control"
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">{t('pinPitch')}</label>
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
                    <label className="form-label">{t('fuelPelletRadius')}</label>
                    <input
                      type="number"
                      step="0.0001"
                      value={params.fuel_radius}
                      onChange={(e) => handleParamChange('fuel_radius', parseFloat(e.target.value))}
                      className="form-control"
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">{t('cladOuterRadius')}</label>
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
                    <label className="form-label">{t('guideTubeInner')}</label>
                    <input
                      type="number"
                      step="0.0001"
                      value={params.gt_inner_radius}
                      onChange={(e) => handleParamChange('gt_inner_radius', parseFloat(e.target.value))}
                      className="form-control"
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">{t('guideTubeOuter')}</label>
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
                    <label className="form-label">Fuel Material Type</label>
                    <select
                      value={params.fuel_material}
                      onChange={(e) => handleParamChange('fuel_material', e.target.value)}
                      className="form-select text-slate-200"
                    >
                      <option value="UO2">UO2 (Standard PWR)</option>
                      <option value="MOX">MOX (Mixed Oxide)</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Fuel Density (g/cm³)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={params.fuel_density}
                      onChange={(e) => handleParamChange('fuel_density', parseFloat(e.target.value))}
                      className="form-control"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 pt-2">
                  <div className="form-group">
                    <label className="form-label">Enrichment (wt %)</label>
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
                    <option value="SS304">SS-304 (Stainless Steel)</option>
                    <option value="FeCrAl">FeCrAl (ATF Cladding)</option>
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

                <div className="grid grid-cols-2 gap-4">
                  <div className="form-group">
                    <label className="form-label">Coolant Temp (K)</label>
                    <input
                      type="number"
                      step="0.1"
                      value={params.temperature}
                      onChange={(e) => handleParamChange('temperature', parseFloat(e.target.value))}
                      className="form-control"
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Fuel Temp (K)</label>
                    <input
                      type="number"
                      step="0.1"
                      value={params.fuel_temperature}
                      onChange={(e) => handleParamChange('fuel_temperature', parseFloat(e.target.value))}
                      className="form-control"
                    />
                  </div>
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
            disabled={jobStatus === 'pending' || jobStatus === 'generating' || jobStatus === 'running' || jobStatus === 'parsing' || mainTab === 'dataset'}
            className="btn btn-primary w-full py-3 text-sm font-semibold flex items-center justify-center gap-2 mt-4 disabled:opacity-50 disabled:cursor-not-allowed"
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
                    {(simplifyLogs ? getSimplifiedLogs(simulationLogs, params) : simulationLogs) || "Console ready. Click 'Generate & Run Simulation' to start OpenMC."}
                  </div>
                </div>
              </div>

              {/* Simulation Results analysis dashboard */}
              {simulationResults && (
                <div className="flex flex-col gap-6">
                  
                  {/* Results detailed tab selector */}
                  <div className="bg-slate-900/40 border border-slate-800/80 rounded-lg p-1 flex flex-wrap gap-1 shadow-inner">
                    {(() => {
                      const tabs = [
                        { id: 'core', label: 'Core Performance', icon: BarChart2 },
                        { id: 'kinetics', label: 'Kinetics & Rod Worth', icon: Cpu },
                        { id: 'safety', label: 'Safety Coefficients', icon: Shield },
                        { id: 'flux3d', label: '3D Spatial Mapping', icon: Layers },
                        { id: 'depletion', label: 'Depletion & Burnup', icon: RefreshCw },
                        { id: 'economy', label: 'Neutron Economy', icon: Compass },
                        { id: 'shielding', label: 'Shielding & DPA', icon: Shield },
                        { id: 'xs', label: 'Cross-Sections', icon: FileText }
                      ];
                      if (simulationResults?.openmc && simulationResults?.geant4) {
                        tabs.push({ id: 'comparison', label: 'Engine Comparison', icon: Globe });
                      }
                      return tabs;
                    })().map(tab => {
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
                      {simulationResults?.openmc && simulationResults?.geant4 ? (
                        <div className="flex flex-col gap-8">
                          {/* Side-by-Side Metrics Grid */}
                          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-4">
                            {renderEngineMetrics(simulationResults.geant4, "GEANT4 SOLVER", "text-teal-400")}
                            {renderEngineMetrics(simulationResults.openmc, "OPENMC SOLVER", "text-sky-400")}
                          </div>

                          {/* 1. 2D Heatmap Grid */}
                          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            <div className="panel bg-[#22242B] border border-[#3A3E45] p-4 rounded-[20px]">
                              {getFineMapPlot(simulationResults.geant4, activeOverlay, 'GEANT4') ? (
                                <PlotlyChart
                                  data={getFineMapPlot(simulationResults.geant4, activeOverlay, 'GEANT4').data}
                                  layout={getFineMapPlot(simulationResults.geant4, activeOverlay, 'GEANT4').layout}
                                />
                              ) : (
                                <div className="text-center text-[#7A828F] py-8">Select Power/Flux overlay above to visualize 2D map</div>
                              )}
                            </div>
                            <div className="panel bg-[#22242B] border border-[#3A3E45] p-4 rounded-[20px]">
                              {getFineMapPlot(simulationResults.openmc, activeOverlay, 'OPENMC') ? (
                                <PlotlyChart
                                  data={getFineMapPlot(simulationResults.openmc, activeOverlay, 'OPENMC').data}
                                  layout={getFineMapPlot(simulationResults.openmc, activeOverlay, 'OPENMC').layout}
                                />
                              ) : (
                                <div className="text-center text-[#7A828F] py-8">Select Power/Flux overlay above to visualize 2D map</div>
                              )}
                            </div>
                          </div>

                          {/* 2. Energy Spectrum Grid */}
                          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            <div className="panel bg-[#22242B] border border-[#3A3E45] p-4 rounded-[20px]">
                              {getEnergySpectrumPlot(simulationResults.geant4, 'GEANT4 - Neutron Energy Spectrum', '#2DD4BF') ? (
                                <PlotlyChart
                                  data={getEnergySpectrumPlot(simulationResults.geant4, 'GEANT4 - Neutron Energy Spectrum', '#2DD4BF').data}
                                  layout={getEnergySpectrumPlot(simulationResults.geant4, 'GEANT4 - Neutron Energy Spectrum', '#2DD4BF').layout}
                                />
                              ) : (
                                <div className="text-center text-[#7A828F] py-8">Spectrum not available</div>
                              )}
                            </div>
                            <div className="panel bg-[#22242B] border border-[#3A3E45] p-4 rounded-[20px]">
                              {getEnergySpectrumPlot(simulationResults.openmc, 'OPENMC - Neutron Energy Spectrum', '#38bdf8') ? (
                                <PlotlyChart
                                  data={getEnergySpectrumPlot(simulationResults.openmc, 'OPENMC - Neutron Energy Spectrum', '#38bdf8').data}
                                  layout={getEnergySpectrumPlot(simulationResults.openmc, 'OPENMC - Neutron Energy Spectrum', '#38bdf8').layout}
                                />
                              ) : (
                                <div className="text-center text-[#7A828F] py-8">Spectrum not available</div>
                              )}
                            </div>
                          </div>

                          {/* 3. Axial Power Grid */}
                          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            <div className="panel bg-[#22242B] border border-[#3A3E45] p-4 rounded-[20px]">
                              {getAxialPowerPlot(simulationResults.geant4, 'GEANT4 - Normalized Axial Power Profile', '#2DD4BF') ? (
                                <PlotlyChart
                                  data={getAxialPowerPlot(simulationResults.geant4, 'GEANT4 - Normalized Axial Power Profile', '#2DD4BF').data}
                                  layout={getAxialPowerPlot(simulationResults.geant4, 'GEANT4 - Normalized Axial Power Profile', '#2DD4BF').layout}
                                />
                              ) : (
                                <div className="text-center text-[#7A828F] py-8">Axial profile not available</div>
                              )}
                            </div>
                            <div className="panel bg-[#22242B] border border-[#3A3E45] p-4 rounded-[20px]">
                              {getAxialPowerPlot(simulationResults.openmc, 'OPENMC - Normalized Axial Power Profile', '#fb7185') ? (
                                <PlotlyChart
                                  data={getAxialPowerPlot(simulationResults.openmc, 'OPENMC - Normalized Axial Power Profile', '#fb7185').data}
                                  layout={getAxialPowerPlot(simulationResults.openmc, 'OPENMC - Normalized Axial Power Profile', '#fb7185').layout}
                                />
                              ) : (
                                <div className="text-center text-[#7A828F] py-8">Axial profile not available</div>
                              )}
                            </div>
                          </div>

                          {/* 4. Shannon Entropy Grid */}
                          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            <div className="panel bg-[#22242B] border border-[#3A3E45] p-4 rounded-[20px]">
                              {getEntropyPlot(simulationResults.geant4, 'GEANT4 - Shannon Entropy (Source Convergence)', '#2DD4BF', '#059669') ? (
                                <PlotlyChart
                                  data={getEntropyPlot(simulationResults.geant4, 'GEANT4 - Shannon Entropy (Source Convergence)', '#2DD4BF', '#059669').data}
                                  layout={getEntropyPlot(simulationResults.geant4, 'GEANT4 - Shannon Entropy (Source Convergence)', '#2DD4BF', '#059669').layout}
                                />
                              ) : (
                                <div className="text-center text-[#7A828F] py-8">Shannon entropy not available</div>
                              )}
                            </div>
                            <div className="panel bg-[#22242B] border border-[#3A3E45] p-4 rounded-[20px]">
                              {getEntropyPlot(simulationResults.openmc, 'OPENMC - Shannon Entropy (Source Convergence)', '#c084fc', '#a855f7') ? (
                                <PlotlyChart
                                  data={getEntropyPlot(simulationResults.openmc, 'OPENMC - Shannon Entropy (Source Convergence)', '#c084fc', '#a855f7').data}
                                  layout={getEntropyPlot(simulationResults.openmc, 'OPENMC - Shannon Entropy (Source Convergence)', '#c084fc', '#a855f7').layout}
                                />
                              ) : (
                                <div className="text-center text-[#7A828F] py-8">Shannon entropy not available</div>
                              )}
                            </div>
                          </div>

                          {/* 5. k-eff Convergence Grid */}
                          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            <div className="panel bg-[#22242B] border border-[#3A3E45] p-4 rounded-[20px]">
                              {getKeffPlot(simulationResults.geant4, 'GEANT4 - k-Effective Convergence', '#2DD4BF') ? (
                                <PlotlyChart
                                  data={getKeffPlot(simulationResults.geant4, 'GEANT4 - k-Effective Convergence', '#2DD4BF').data}
                                  layout={getKeffPlot(simulationResults.geant4, 'GEANT4 - k-Effective Convergence', '#2DD4BF').layout}
                                />
                              ) : (
                                <div className="text-center text-[#7A828F] py-8">k-eff convergence not available</div>
                              )}
                            </div>
                            <div className="panel bg-[#22242B] border border-[#3A3E45] p-4 rounded-[20px]">
                              {getKeffPlot(simulationResults.openmc, 'OPENMC - k-Effective Convergence', '#38bdf8') ? (
                                <PlotlyChart
                                  data={getKeffPlot(simulationResults.openmc, 'OPENMC - k-Effective Convergence', '#38bdf8').data}
                                  layout={getKeffPlot(simulationResults.openmc, 'OPENMC - k-Effective Convergence', '#38bdf8').layout}
                                />
                              ) : (
                                <div className="text-center text-[#7A828F] py-8">k-eff convergence not available</div>
                              )}
                            </div>
                          </div>
                        </div>
                      ) : (
                        <>
                          {/* Four K-eff Estimators Grid */}
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                            <div className="panel bg-slate-900/40 p-4 border-l-4 border-l-blue-400 flex flex-col justify-between">
                              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{lang === 'en' ? 'Collision k-Effective' : 'Çarpışma k-Etkin'}</span>
                              <h4 className="text-xl font-bold text-slate-100 mt-2 font-mono">
                                {simulationResults?.k_collision ? simulationResults.k_collision[0].toFixed(5) : (simulationResults?.k_eff?.toFixed(5) ?? "N/A")}
                              </h4>
                              <span className="text-[10px] text-slate-500 mt-1">σ: {simulationResults?.k_collision ? simulationResults.k_collision[1].toFixed(5) : (simulationResults?.k_eff_std?.toFixed(5) ?? "N/A")}</span>
                            </div>

                            <div className="panel bg-slate-900/40 p-4 border-l-4 border-l-cyan-400 flex flex-col justify-between">
                              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{lang === 'en' ? 'Track-Length k-Effective' : 'Yol-Boyu k-Etkin'}</span>
                              <h4 className="text-xl font-bold text-slate-100 mt-2 font-mono">
                                {simulationResults?.k_tracklength ? simulationResults.k_tracklength[0].toFixed(5) : (simulationResults?.k_eff?.toFixed(5) ?? "N/A")}
                              </h4>
                              <span className="text-[10px] text-slate-500 mt-1">σ: {simulationResults?.k_tracklength ? simulationResults.k_tracklength[1].toFixed(5) : (simulationResults?.k_eff_std?.toFixed(5) ?? "N/A")}</span>
                            </div>

                            <div className="panel bg-slate-900/40 p-4 border-l-4 border-l-pink-400 flex flex-col justify-between">
                              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{lang === 'en' ? 'Absorption k-Effective' : 'Soğurma k-Etkin'}</span>
                              <h4 className="text-xl font-bold text-slate-100 mt-2 font-mono">
                                {simulationResults?.k_absorption ? simulationResults.k_absorption[0].toFixed(5) : (simulationResults?.k_eff?.toFixed(5) ?? "N/A")}
                              </h4>
                              <span className="text-[10px] text-slate-500 mt-1">σ: {simulationResults?.k_absorption ? simulationResults.k_absorption[1].toFixed(5) : (simulationResults?.k_eff_std?.toFixed(5) ?? "N/A")}</span>
                            </div>

                            <div className="panel bg-slate-900/40 p-4 border-l-4 border-l-emerald-400 flex flex-col justify-between">
                              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{lang === 'en' ? 'Combined k-Effective (k∞)' : 'Birleşik k-Etkin (k∞)'}</span>
                              <h4 className="text-xl font-bold text-emerald-400 mt-2 font-mono">
                                {simulationResults?.k_combined ? simulationResults.k_combined[0].toFixed(5) : (simulationResults?.k_eff?.toFixed(5) ?? "N/A")}
                              </h4>
                              <span className="text-[10px] text-slate-500 mt-1">σ: {simulationResults?.k_combined ? simulationResults.k_combined[1].toFixed(5) : (simulationResults?.k_eff_std?.toFixed(5) ?? "N/A")}</span>
                            </div>
                          </div>

                          {/* Performance Indicators Grid */}
                          <div className={`grid grid-cols-2 ${params.poison_enabled ? 'md:grid-cols-4' : 'md:grid-cols-3'} gap-4 mb-6`}>
                            <div className="panel bg-slate-900/40 p-4 border-l-4 border-l-sky-400 flex flex-col justify-between">
                              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{t('reactivityCard') || 'Excess Reactivity'}</span>
                              <h4 className="text-xl font-bold text-slate-100 mt-2">
                                {simulationResults?.reactivity?.toFixed(5) ?? "N/A"}
                              </h4>
                              <span className="text-[10px] text-slate-500 mt-1">pcm: {simulationResults?.reactivity !== undefined ? (simulationResults.reactivity * 1e5).toFixed(0) : "N/A"}</span>
                            </div>

                            <div className="panel bg-slate-900/40 p-4 border-l-4 border-l-purple-400 flex flex-col justify-between">
                              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Hot Channel Factor</span>
                              <h4 className="text-xl font-bold text-slate-100 mt-2">
                                {simulationResults?.hot_channel_factor?.toFixed(3) ?? "N/A"}
                              </h4>
                              <span className="text-[10px] text-slate-500 mt-1">Safe Limit: &lt; 1.5</span>
                            </div>

                            <div className="panel bg-slate-900/40 p-4 border-l-4 border-l-amber-400 flex flex-col justify-between">
                              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Peak Power Factor</span>
                              <h4 className="text-xl font-bold text-slate-100 mt-2">
                                {simulationResults?.peak_power_factor?.toFixed(3) ?? "N/A"}
                              </h4>
                              <span className="text-[10px] text-slate-500 mt-1">Max Pin / Average Pin</span>
                            </div>

                            {params.poison_enabled && (
                              <div className="panel bg-slate-900/40 p-4 border-l-4 border-l-rose-500 flex flex-col justify-between">
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Poison Penalty (Gd₂O₃)</span>
                                <h4 className="text-xl font-bold text-rose-450 mt-2 font-mono">
                                  -{((4500 * Math.log(1 + params.poison_fraction))).toFixed(0)} pcm
                                </h4>
                                <span className="text-[10px] text-slate-500 mt-1">Gd Fraction: {params.poison_fraction.toFixed(1)} wt%</span>
                              </div>
                            )}
                          </div>

                          {/* 2D Heatmap & Spectrum Charts */}
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                            {fineMapPlot && (
                              <div className="panel bg-[#0e1626]/80 flex items-center justify-center p-4">
                                <PlotlyChart data={fineMapPlot.data} layout={fineMapPlot.layout} />
                              </div>
                            )}
                            {energySpectrumPlot && (
                              <div className="panel bg-[#0e1626]/80 flex items-center justify-center p-4">
                                <PlotlyChart data={energySpectrumPlot.data} layout={energySpectrumPlot.layout} />
                              </div>
                            )}
                          </div>

                          {/* Axial profile & Entropy Convergence curves */}
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {axialPowerPlot && (
                              <div className="panel bg-[#0e1626]/80 p-4">
                                <PlotlyChart data={axialPowerPlot.data} layout={axialPowerPlot.layout} />
                              </div>
                            )}
                            {entropyPlot && (
                              <div className="panel bg-[#0e1626]/80 p-4">
                                <PlotlyChart data={entropyPlot.data} layout={entropyPlot.layout} />
                              </div>
                            )}
                          </div>

                          {/* Convergence analysis plots */}
                          <div className="grid grid-cols-1 gap-6 mt-6">
                            {keffPlot && (
                              <div className="panel bg-[#0e1626]/80 p-4">
                                <PlotlyChart data={keffPlot.data} layout={keffPlot.layout} />
                              </div>
                            )}
                          </div>
                        </>
                      )}
                    </>
                  )}

                  {/* Kinetics Tab */}
                  {resultsTab === 'kinetics' && (
                    <div className="flex flex-col gap-6">
                      {simulationResults.beta_eff !== undefined && simulationResults.beta_eff !== null && simulationResults.beta_eff > 0 ? (
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
                                {simulationResults.gen_time != null ? `${(simulationResults.gen_time * 1e6).toFixed(3)} μs` : 'N/A'}
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
                      ) : simulationResults.beta_eff === null ? (
                        <div className="panel bg-[#0a1628]/80 border-blue-500/20 p-8 flex flex-col items-center justify-center text-center gap-4">
                          <svg className="w-12 h-12 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                          <div>
                            <h4 className="text-lg font-bold text-blue-400">β<sub>eff</sub> Not Available in Geant4</h4>
                            <p className="text-xs text-slate-400 mt-2 max-w-lg">
                              Effective delayed neutron fraction (β<sub>eff</sub>) requires Iterated Fission Probability (IFP) tracking — a feature available only in OpenMC's eigenvalue solver. 
                              In Geant4, delayed neutrons are killed at birth (fStopAndKill) to avoid double-counting in the k-eigenvalue power iteration. 
                              Use the <b>OpenMC</b> solver with <b>Kinetics Parameters</b> enabled to obtain β<sub>eff</sub> and Λ<sub>eff</sub>.
                            </p>
                          </div>
                        </div>
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
                      {simulationResults.depletion !== undefined && simulationResults.depletion !== null ? (
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

                  {/* Microscopic Cross Sections Tab */}
                  {resultsTab === 'xs' && (
                    <div className="flex flex-col gap-6">
                      <div className="panel flex flex-col md:flex-row justify-between items-center gap-4">
                        <div>
                          <h4 className="text-sm font-bold text-slate-200">Isotope Cross-Section Database</h4>
                          <p className="text-xs text-slate-400 mt-1">
                            Microscopic cross-sections (σ) in barns vs. incident neutron energy in eV, loaded from the ENDF/B-VII.1 HDF5 nuclear data library.
                          </p>
                        </div>
                        <select
                          value={selectedXsNuclide}
                          onChange={(e) => setSelectedXsNuclide(e.target.value)}
                          className="bg-slate-900 border border-slate-800 rounded px-3 py-1.5 text-xs text-sky-400 font-semibold cursor-pointer"
                        >
                          <option value="U235">U-235 (Fissile Fuel)</option>
                          <option value="U238">U-238 (Fertile Absorber)</option>
                          <option value="B10">B-10 (Soluble Boron / Absorber)</option>
                          <option value="H1">H-1 (Moderator Hydrogen)</option>
                          <option value="Zr90">Zr-90 (Zircaloy Cladding)</option>
                        </select>
                      </div>

                      {xsLoading ? (
                        <div className="panel flex flex-col items-center justify-center p-12 text-slate-400 gap-3">
                          <RefreshCw className="w-8 h-8 animate-spin text-sky-400" />
                          <span>Loading ENDF/B-VII.1 libraries...</span>
                        </div>
                      ) : xsPlot ? (
                        <div className="panel bg-[#0e1626]/80 flex items-center justify-center p-4">
                          <PlotlyChart data={xsPlot.data} layout={xsPlot.layout} />
                        </div>
                      ) : (
                        <div className="panel p-8 text-center text-rose-400 font-semibold">
                          Could not retrieve nuclear database cross-section records.
                        </div>
                      )}
                    </div>
                  )}

                  {resultsTab === 'comparison' && simulationResults?.openmc && simulationResults?.geant4 && (
                    <div className="flex flex-col gap-6">
                      {/* Metric Comparison Table */}
                      <div className="panel p-5">
                        <div className="panel-header mb-4">
                          <h3 className="panel-title text-sky-400">
                            <BarChart2 className="w-4 h-4" /> Monte Carlo Engine Comparison Summary
                          </h3>
                        </div>
                        
                        <div className="overflow-x-auto">
                          <table className="w-full text-slate-300 text-xs border-collapse">
                            <thead>
                              <tr className="border-b border-slate-800 bg-slate-900/50">
                                <th className="p-3 text-left font-bold text-slate-400 uppercase tracking-wider">Neutronic Parameter</th>
                                <th className="p-3 text-right font-bold text-blue-400 uppercase tracking-wider">OpenMC Solver</th>
                                <th className="p-3 text-right font-bold text-orange-400 uppercase tracking-wider">Geant4 Solver</th>
                                <th className="p-3 text-right font-bold text-slate-400 uppercase tracking-wider">Abs. Diff</th>
                                <th className="p-3 text-right font-bold text-slate-400 uppercase tracking-wider">Relative Diff (%)</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800/50">
                              {[
                                {
                                  name: "Infinite Multiplication Factor (k∞)",
                                  key: "k_eff",
                                  format: (v) => v.toFixed(5),
                                  errKey: "k_eff_std"
                                },
                                {
                                  name: "Excess Reactivity (ρ, pcm)",
                                  key: "reactivity",
                                  format: (v) => (v * 1e5).toFixed(1)
                                },
                                {
                                  name: "Source Shannon Entropy (bits)",
                                  key: "shannon_entropy",
                                  format: (v) => {
                                    if (Array.isArray(v)) {
                                      return v.length > 0 ? v[v.length - 1].toFixed(4) : "N/A";
                                    }
                                    return typeof v === 'number' ? v.toFixed(4) : "N/A";
                                  }
                                },
                                {
                                  name: "Global Fission Rate (fissions/s)",
                                  key: "global_fission_rate",
                                  format: (v) => v.toExponential(4)
                                },
                                {
                                  name: "Global Absorption Rate (absorptions/s)",
                                  key: "global_absorption_rate",
                                  format: (v) => v.toExponential(4)
                                },
                                {
                                  name: "Leakage Rate",
                                  key: "leakage_rate",
                                  format: (v) => v.toExponential(4)
                                },
                                {
                                  name: "Avg Neutrons/Fission (ν̄)",
                                  key: "avg_nu",
                                  format: (v) => v ? v.toFixed(4) : "N/A"
                                },
                                {
                                  name: "Pin Power Peaking Factor (Fq)",
                                  key: "peak_power_factor",
                                  format: (v) => v.toFixed(3)
                                }
                              ].map((row, i) => {
                                const rawOM = simulationResults.openmc[row.key];
                                const rawG4 = simulationResults.geant4[row.key];
                                
                                const getNumericValue = (v) => {
                                  if (Array.isArray(v)) {
                                    return v.length > 0 ? v[v.length - 1] : 0;
                                  }
                                  return typeof v === 'number' ? v : 0;
                                };
                                
                                const valOM = rawOM !== undefined ? getNumericValue(rawOM) : 0;
                                const valG4 = rawG4 !== undefined ? getNumericValue(rawG4) : 0;
                                const absDiff = valOM - valG4;
                                const relDiff = valOM !== 0 ? (absDiff / valOM) * 100 : 0;
                                
                                return (
                                  <tr key={i} className="hover:bg-slate-900/20 transition-all font-mono">
                                    <td className="p-3 text-left font-sans font-semibold text-slate-200">{row.name}</td>
                                    <td className="p-3 text-right text-blue-300">
                                      {row.format(valOM)}
                                      {row.errKey && <span className="text-[10px] text-slate-500 block">± {row.format(simulationResults.openmc[row.errKey])}</span>}
                                    </td>
                                    <td className="p-3 text-right text-orange-300">
                                      {row.format(valG4)}
                                      {row.errKey && <span className="text-[10px] text-slate-500 block">± {row.format(simulationResults.geant4[row.errKey])}</span>}
                                    </td>
                                    <td className={`p-3 text-right ${absDiff > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                                      {absDiff > 0 ? '+' : ''}{row.format(absDiff)}
                                    </td>
                                    <td className={`p-3 text-right font-bold ${Math.abs(relDiff) > 1.0 ? 'text-amber-400' : 'text-slate-400'}`}>
                                      {relDiff > 0 ? '+' : ''}{relDiff.toFixed(3)} %
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                      
                      {/* Energy Spectrum Overlay & Axial Profile Overlay */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="panel p-4">
                          <PlotlyChart
                            data={[
                              {
                                x: simulationResults.openmc.energy_spectrum_centers,
                                y: simulationResults.openmc.energy_spectrum_flux,
                                type: 'scatter',
                                mode: 'lines',
                                name: 'OpenMC Flux',
                                line: { color: '#3b82f6', width: 2 }
                              },
                              {
                                x: simulationResults.geant4.energy_spectrum_centers,
                                y: simulationResults.geant4.energy_spectrum_flux,
                                type: 'scatter',
                                mode: 'lines',
                                name: 'Geant4 Flux',
                                line: { color: '#f97316', width: 2 }
                              }
                            ]}
                            layout={{
                              title: 'Neutron Energy Spectrum Comparison',
                              xaxis: { title: 'Energy (MeV)', type: 'log', gridcolor: '#1e293b' },
                              yaxis: { title: 'Flux (per lethargy, per source n)', type: 'log', gridcolor: '#1e293b' },
                              margin: { l: 60, r: 20, t: 40, b: 40 },
                              height: 320,
                              paper_bgcolor: 'rgba(0,0,0,0)',
                              plot_bgcolor: 'rgba(0,0,0,0)',
                              font: { color: '#94a3b8' }
                            }}
                          />
                        </div>

                        <div className="panel p-4">
                          <PlotlyChart
                            data={[
                              {
                                y: simulationResults.openmc.axial_z_heights || Array.from({ length: 100 }, (_, i) => i * 2.0),
                                x: simulationResults.openmc.axial_power_profile,
                                type: 'scatter',
                                mode: 'lines',
                                name: 'OpenMC Profile',
                                line: { color: '#3b82f6', width: 2 }
                              },
                              {
                                y: simulationResults.geant4.axial_z_heights || Array.from({ length: 100 }, (_, i) => i * 2.0),
                                x: simulationResults.geant4.axial_power_profile,
                                type: 'scatter',
                                mode: 'lines',
                                name: 'Geant4 Profile',
                                line: { color: '#f97316', width: 2 }
                              }
                            ]}
                            layout={{
                              title: 'Axial Power Distribution Comparison',
                              xaxis: { title: 'Relative Power (P/P_avg)', gridcolor: '#1e293b', range: [0, 2.0] },
                              yaxis: { title: 'Active Height (cm)', gridcolor: '#1e293b' },
                              margin: { l: 50, r: 20, t: 40, b: 40 },
                              height: 320,
                              paper_bgcolor: 'rgba(0,0,0,0)',
                              plot_bgcolor: 'rgba(0,0,0,0)',
                              font: { color: '#94a3b8' }
                            }}
                          />
                        </div>
                      </div>
                      
                      {/* Convergence Comparison Overlay (k-eff & Shannon Entropy) */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="panel p-4">
                          <PlotlyChart
                            data={[
                              {
                                x: Array.from({ length: (simulationResults.openmc.batch_keff || []).length }, (_, i) => i + 1),
                                y: simulationResults.openmc.batch_keff || [],
                                type: 'scatter',
                                mode: 'lines+markers',
                                name: 'OpenMC k-eff',
                                line: { color: '#3b82f6', width: 2 },
                                marker: { size: 4 }
                              },
                              {
                                x: Array.from({ length: (simulationResults.geant4.batch_keff || []).length }, (_, i) => i + 1),
                                y: simulationResults.geant4.batch_keff || [],
                                type: 'scatter',
                                mode: 'lines+markers',
                                name: 'Geant4 k-eff',
                                line: { color: '#f97316', width: 2 },
                                marker: { size: 4 }
                              }
                            ]}
                            layout={{
                              title: 'k-Effective Convergence Comparison (All Cycles)',
                              xaxis: { title: 'Cycle', gridcolor: '#1e293b' },
                              yaxis: { title: 'k-effective', gridcolor: '#1e293b' },
                              margin: { l: 50, r: 20, t: 40, b: 40 },
                              height: 320,
                              paper_bgcolor: 'rgba(0,0,0,0)',
                              plot_bgcolor: 'rgba(0,0,0,0)',
                              font: { color: '#94a3b8' },
                              shapes: (simulationResults.openmc.inactive_batches || 0) > 0 ? [{
                                type: 'line',
                                xref: 'x',
                                yref: 'paper',
                                x0: (simulationResults.openmc.inactive_batches || 0) + 0.5,
                                y0: 0,
                                x1: (simulationResults.openmc.inactive_batches || 0) + 0.5,
                                y1: 1,
                                line: { color: '#ef4444', width: 1.5, dash: 'dash' }
                              }] : [],
                              annotations: (simulationResults.openmc.inactive_batches || 0) > 0 ? [{
                                x: (simulationResults.openmc.inactive_batches || 0) + 0.5,
                                y: 0.9,
                                xref: 'x',
                                yref: 'paper',
                                text: 'Active Cycles Begin',
                                showarrow: false,
                                textangle: -90,
                                xanchor: 'right',
                                yanchor: 'top',
                                font: { color: '#ef4444', size: 9 }
                              }] : []
                            }}
                          />
                        </div>

                        <div className="panel p-4">
                          <PlotlyChart
                            data={[
                              {
                                x: Array.from({ length: (simulationResults.openmc.shannon_entropy || []).length }, (_, i) => i + 1),
                                y: simulationResults.openmc.shannon_entropy || [],
                                type: 'scatter',
                                mode: 'lines+markers',
                                name: 'OpenMC Entropy',
                                line: { color: '#c084fc', width: 2 },
                                marker: { size: 4 }
                              },
                              {
                                x: Array.from({ length: (simulationResults.geant4.shannon_entropy || []).length }, (_, i) => i + 1),
                                y: simulationResults.geant4.shannon_entropy || [],
                                type: 'scatter',
                                mode: 'lines+markers',
                                name: 'Geant4 Entropy',
                                line: { color: '#2dd4bf', width: 2 },
                                marker: { size: 4 }
                              }
                            ]}
                            layout={{
                              title: 'Source Shannon Entropy Comparison (All Cycles)',
                              xaxis: { title: 'Cycle', gridcolor: '#1e293b' },
                              yaxis: { title: 'Shannon Entropy H (bits)', gridcolor: '#1e293b' },
                              margin: { l: 50, r: 20, t: 40, b: 40 },
                              height: 320,
                              paper_bgcolor: 'rgba(0,0,0,0)',
                              plot_bgcolor: 'rgba(0,0,0,0)',
                              font: { color: '#94a3b8' },
                              shapes: (simulationResults.openmc.inactive_batches || 0) > 0 ? [{
                                type: 'line',
                                xref: 'x',
                                yref: 'paper',
                                x0: (simulationResults.openmc.inactive_batches || 0) + 0.5,
                                y0: 0,
                                x1: (simulationResults.openmc.inactive_batches || 0) + 0.5,
                                y1: 1,
                                line: { color: '#ef4444', width: 1.5, dash: 'dash' }
                              }] : [],
                              annotations: (simulationResults.openmc.inactive_batches || 0) > 0 ? [{
                                x: (simulationResults.openmc.inactive_batches || 0) + 0.5,
                                y: 0.9,
                                xref: 'x',
                                yref: 'paper',
                                text: 'Active Cycles Begin',
                                showarrow: false,
                                textangle: -90,
                                xanchor: 'right',
                                yanchor: 'top',
                                font: { color: '#ef4444', size: 9 }
                              }] : []
                            }}
                          />
                        </div>
                      </div>

                      {/* Side-by-side Pin Power Maps & Difference Map */}
                      <div className="panel p-5">
                        <div className="panel-header mb-4">
                          <h3 className="panel-title text-sky-400">
                            <Layers className="w-4 h-4" /> 2D Radial Pin Power Comparison & Difference Map
                          </h3>
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                          <div className="bg-slate-900/40 p-3 rounded-xl border border-slate-800">
                            <h4 className="text-xs font-bold text-center text-blue-400 mb-2">OpenMC Relative Pin Power (P/P_avg)</h4>
                            <PlotlyChart
                              data={[{
                                z: simulationResults.openmc.relative_power_map,
                                type: 'heatmap',
                                colorscale: 'Inferno',
                                zmin: 0.0,
                                zmax: 1.5,
                                zauto: false,
                                showscale: true,
                                colorbar: { thickness: 10, len: 0.8 }
                              }]}
                              layout={{
                                xaxis: { title: 'X-Index', gridcolor: '#1e293b' },
                                yaxis: { title: 'Y-Index', gridcolor: '#1e293b' },
                                margin: { l: 40, r: 10, t: 10, b: 40 },
                                height: 280,
                                paper_bgcolor: 'rgba(0,0,0,0)',
                                plot_bgcolor: 'rgba(0,0,0,0)',
                                font: { color: '#94a3b8' }
                              }}
                            />
                          </div>

                          <div className="bg-slate-900/40 p-3 rounded-xl border border-slate-800">
                            <h4 className="text-xs font-bold text-center text-orange-400 mb-2">Geant4 Relative Pin Power (P/P_avg)</h4>
                            <PlotlyChart
                              data={[{
                                z: simulationResults.geant4.relative_power_map,
                                type: 'heatmap',
                                colorscale: 'Inferno',
                                zmin: 0.0,
                                zmax: 1.5,
                                zauto: false,
                                showscale: true,
                                colorbar: { thickness: 10, len: 0.8 }
                              }]}
                              layout={{
                                xaxis: { title: 'X-Index', gridcolor: '#1e293b' },
                                yaxis: { title: 'Y-Index', gridcolor: '#1e293b' },
                                margin: { l: 40, r: 10, t: 10, b: 40 },
                                height: 280,
                                paper_bgcolor: 'rgba(0,0,0,0)',
                                plot_bgcolor: 'rgba(0,0,0,0)',
                                font: { color: '#94a3b8' }
                              }}
                            />
                          </div>

                          <div className="bg-slate-900/40 p-3 rounded-xl border border-slate-800">
                            <h4 className="text-xs font-bold text-center text-pink-400 mb-2">Absolute Difference Map</h4>
                            <PlotlyChart
                              data={[{
                                z: (() => {
                                  const omMap = simulationResults.openmc.relative_power_map || [];
                                  const g4Map = simulationResults.geant4.relative_power_map || [];
                                  const diff = [];
                                  for (let r = 0; r < omMap.length; r++) {
                                    const row = [];
                                    for (let c = 0; c < omMap[r].length; c++) {
                                      row.push(Math.abs(omMap[r][c] - (g4Map[r]?.[c] || 0)));
                                    }
                                    diff.push(row);
                                  }
                                  return diff;
                                })(),
                                type: 'heatmap',
                                colorscale: 'Hot',
                                showscale: true,
                                colorbar: { thickness: 10, len: 0.8 }
                              }]}
                              layout={{
                                xaxis: { title: 'X-Index', gridcolor: '#1e293b' },
                                yaxis: { title: 'Y-Index', gridcolor: '#1e293b' },
                                margin: { l: 40, r: 10, t: 10, b: 40 },
                                height: 280,
                                paper_bgcolor: 'rgba(0,0,0,0)',
                                plot_bgcolor: 'rgba(0,0,0,0)',
                                font: { color: '#94a3b8' }
                              }}
                            />
                          </div>
                        </div>
                      </div>
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
                      <span className="text-xs font-bold text-slate-300 block mb-1.5">U-235 Enrichment range (%)</span>
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          type="number"
                          step="0.1"
                          placeholder="Min"
                          value={datasetParams.enrichment_min}
                          onChange={(e) => setDatasetParams(p => ({ ...p, enrichment_min: parseFloat(e.target.value) }))}
                          className="form-control text-xs"
                        />
                        <input
                          type="number"
                          step="0.1"
                          placeholder="Max"
                          value={datasetParams.enrichment_max}
                          onChange={(e) => setDatasetParams(p => ({ ...p, enrichment_max: parseFloat(e.target.value) }))}
                          className="form-control text-xs"
                        />
                      </div>
                    </div>

                    {/* Boron bounds */}
                    <div>
                      <span className="text-xs font-bold text-slate-300 block mb-1.5">Soluble Boron range (ppm)</span>
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          type="number"
                          step="100"
                          placeholder="Min"
                          value={datasetParams.boron_min}
                          onChange={(e) => setDatasetParams(p => ({ ...p, boron_min: parseFloat(e.target.value) }))}
                          className="form-control text-xs"
                        />
                        <input
                          type="number"
                          step="100"
                          placeholder="Max"
                          value={datasetParams.boron_max}
                          onChange={(e) => setDatasetParams(p => ({ ...p, boron_max: parseFloat(e.target.value) }))}
                          className="form-control text-xs"
                        />
                      </div>
                    </div>

                    {/* Fuel Temperature bounds */}
                    <div>
                      <span className="text-xs font-bold text-slate-300 block mb-1.5">Fuel Temperature range (K)</span>
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          type="number"
                          step="50"
                          placeholder="Min"
                          value={datasetParams.fuel_temp_min}
                          onChange={(e) => setDatasetParams(p => ({ ...p, fuel_temp_min: parseFloat(e.target.value) }))}
                          className="form-control text-xs"
                        />
                        <input
                          type="number"
                          step="50"
                          placeholder="Max"
                          value={datasetParams.fuel_temp_max}
                          onChange={(e) => setDatasetParams(p => ({ ...p, fuel_temp_max: parseFloat(e.target.value) }))}
                          className="form-control text-xs"
                        />
                      </div>
                    </div>

                    {/* Coolant Temperature bounds */}
                    <div>
                      <span className="text-xs font-bold text-slate-300 block mb-1.5">Coolant Temperature range (K)</span>
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          type="number"
                          step="10"
                          placeholder="Min"
                          value={datasetParams.coolant_temp_min}
                          onChange={(e) => setDatasetParams(p => ({ ...p, coolant_temp_min: parseFloat(e.target.value) }))}
                          className="form-control text-xs"
                        />
                        <input
                          type="number"
                          step="10"
                          placeholder="Max"
                          value={datasetParams.coolant_temp_max}
                          onChange={(e) => setDatasetParams(p => ({ ...p, coolant_temp_max: parseFloat(e.target.value) }))}
                          className="form-control text-xs"
                        />
                      </div>
                    </div>

                    {/* Poison fraction bounds */}
                    <div>
                      <span className="text-xs font-bold text-slate-300 block mb-1.5">Burnable Poison Gd₂O₃ range (wt %)</span>
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          type="number"
                          step="0.5"
                          placeholder="Min"
                          value={datasetParams.poison_min}
                          onChange={(e) => setDatasetParams(p => ({ ...p, poison_min: parseFloat(e.target.value) }))}
                          className="form-control text-xs"
                        />
                        <input
                          type="number"
                          step="0.5"
                          placeholder="Max"
                          value={datasetParams.poison_max}
                          onChange={(e) => setDatasetParams(p => ({ ...p, poison_max: parseFloat(e.target.value) }))}
                          className="form-control text-xs"
                        />
                      </div>
                    </div>

                    {/* Cladding thickness bounds */}
                    <div>
                      <span className="text-xs font-bold text-slate-300 block mb-1.5">Cladding Thickness range (cm)</span>
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          type="number"
                          step="0.005"
                          placeholder="Min"
                          value={datasetParams.clad_thick_min}
                          onChange={(e) => setDatasetParams(p => ({ ...p, clad_thick_min: parseFloat(e.target.value) }))}
                          className="form-control text-xs"
                        />
                        <input
                          type="number"
                          step="0.005"
                          placeholder="Max"
                          value={datasetParams.clad_thick_max}
                          onChange={(e) => setDatasetParams(p => ({ ...p, clad_thick_max: parseFloat(e.target.value) }))}
                          className="form-control text-xs"
                        />
                      </div>
                    </div>

                    {/* Number of LHS Samples input */}
                    <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-800 flex flex-col gap-2 mt-2">
                      <label className="text-xs font-bold text-sky-400 flex items-center gap-1.5">
                        <Database className="w-3.5 h-3.5" />
                        Latin Hypercube Samples (N)
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="2000"
                        value={datasetParams.num_samples}
                        onChange={(e) => {
                          const val = e.target.value;
                          setDatasetParams(p => ({ ...p, num_samples: val === "" ? "" : parseInt(val) }));
                        }}
                        className="form-control font-bold text-sky-400 font-mono text-center text-sm"
                      />
                      <span className="text-[10px] text-slate-500 italic mt-0.5">
                        {t('lhsSamplesSub')}
                      </span>
                    </div>

                    {/* Simulation Engine selection */}
                    <div className="bg-slate-900/60 p-3.5 rounded-xl border border-slate-800 flex items-center justify-between gap-4 mt-4">
                      <label className="text-xs font-bold text-sky-400 flex items-center gap-1.5 shrink-0">
                        <Cpu className="w-3.5 h-3.5" />
                        Choose Engine:
                      </label>
                      <select
                        value={datasetParams.engine}
                        onChange={(e) => setDatasetParams(p => ({ ...p, engine: e.target.value }))}
                        className="bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-xs font-bold text-sky-400 focus:outline-none focus:border-sky-500 cursor-pointer w-full max-w-[140px] text-center"
                      >
                        <option value="openmc">OpenMC</option>
                        <option value="geant4">Geant4</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Progress bar and control buttons */}
                <div className="flex flex-col justify-between">
                  <div>
                    <div className="panel-header mb-4">
                      <h3 className="panel-title"><Cpu className="w-4 h-4 text-sky-400" /> {t('queueTitle')}</h3>
                    </div>
                    
                    <div className="bg-slate-955/60 p-4 rounded-xl border border-slate-900 mb-6 flex flex-col gap-3">
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-slate-400 font-medium">{t('status')}:</span>
                        <span className={`font-semibold ${datasetStatus.active ? 'text-amber-400' : 'text-slate-500'}`}>
                          {datasetStatus.active ? t('statusGenerating') : t('statusInactive')}
                        </span>
                      </div>

                      {datasetStatus.active && (
                        <>
                          <div className="flex flex-col gap-1.5 text-xs mb-2">
                            <div className="flex justify-between">
                              <span className="text-slate-400">{t('completed')}:</span>
                              <span className="font-mono font-bold text-sky-400">{datasetStatus.completed_cases} / {datasetStatus.total_cases}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-400">{t('percentage')}:</span>
                              <span className="font-mono font-bold text-sky-400">{datasetStatus.total_cases > 0 ? ((datasetStatus.completed_cases / datasetStatus.total_cases) * 100).toFixed(0) : 0}%</span>
                            </div>
                          </div>
                          <div className="w-full bg-slate-900 h-2.5 rounded-full overflow-hidden">
                            <div 
                              className="bg-sky-400 h-full rounded-full transition-all duration-500" 
                              style={{ width: `${datasetStatus.total_cases > 0 ? (datasetStatus.completed_cases / datasetStatus.total_cases) * 100 : 0}%` }}
                            />
                          </div>
                          
                          {/* current params variant */}
                          <div className="bg-slate-900/60 p-3 rounded-lg border border-slate-800 text-[10px] font-mono text-slate-400 flex flex-col gap-1 mt-1">
                            <span className="font-semibold text-slate-200">{t('currentCase')}:</span>
                            <span>• {t('enrichment')}: {datasetStatus.current_params.enrichment?.toFixed(2)} wt%</span>
                            <span>• {t('solubleBoron')}: {datasetStatus.current_params.soluble_boron?.toFixed(0)} ppm</span>
                            <span>• {t('fuelTemp')}: {datasetStatus.current_params.fuel_temp?.toFixed(0)} K</span>
                            <span>• {t('coolantTemp')}: {datasetStatus.current_params.coolant_temp?.toFixed(1)} K</span>
                            <span>• {t('poisonWeight')}: {datasetStatus.current_params.poison_frac?.toFixed(2)} wt%</span>
                            <span>• {t('cladThickness')}: {datasetStatus.current_params.clad_thick?.toFixed(3)} cm</span>
                          </div>
                        </>
                      )}
                    </div>

                    {/* Control Variables Card */}
                    <div className="bg-slate-900/40 p-4 rounded-xl border border-slate-900 mt-2 flex flex-col gap-2">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                        {t('controlVariables')}
                      </span>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-[11px] font-mono text-slate-400">
                        <div className="flex justify-between">
                          <span>{t('lattice')}:</span>
                          <span className="text-sky-400 font-semibold">{params.lattice_type} (17x17)</span>
                        </div>
                        <div className="flex justify-between">
                          <span>{t('pinPitch') || 'Pin Pitch'}:</span>
                          <span className="text-slate-200">{params.pin_pitch} cm</span>
                        </div>
                        <div className="flex justify-between">
                          <span>{t('fuelMaterial') || 'Fuel Material'}:</span>
                          <span className="text-slate-200">{params.fuel_material}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>{t('cladMaterial') || 'Clad Material'}:</span>
                          <span className="text-slate-200">{params.clad_material}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>{t('activeHeight') || 'Active Height'}:</span>
                          <span className="text-slate-200">{params.active_height} cm</span>
                        </div>
                        <div className="flex justify-between">
                          <span>{t('boundary') || 'Boundary'}:</span>
                          <span className="text-sky-400 font-semibold">{t('reflective')}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>{t('particles') || 'Particles'}:</span>
                          <span className="text-slate-200">{params.particles?.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>{t('batches') || 'Batches'}:</span>
                          <span className="text-slate-200">{params.batches}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>{t('inactiveBatches') || 'Inactive'}:</span>
                          <span className="text-slate-200">{params.inactive_batches}</span>
                        </div>
                      </div>
                      <div className="text-[9px] text-slate-500 italic mt-1 border-t border-slate-800/60 pt-2">
                        {t('constantsSub')}
                      </div>
                    </div>
                  </div>

                  {/* Dynamic Simulation Count Indicator */}
                  {!datasetStatus.active && (
                    <div className="bg-sky-950/20 border border-sky-850/40 rounded-xl p-3 text-xs text-slate-300 mt-4 flex justify-between items-center">
                      <span className="font-semibold text-slate-400">Total LHS Cases to Simulate:</span>
                      <span className="font-extrabold text-sky-400 font-mono text-sm bg-slate-900/60 px-3 py-1 rounded border border-slate-800">
                        {(datasetParams.num_samples || 0).toLocaleString()}
                      </span>
                    </div>
                  )}

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
              <div className="panel bg-amber-500/5 border border-amber-500/20 p-5 flex gap-4 mt-4">
                <AlertTriangle className="w-8 h-8 text-amber-500 shrink-0" />
                <div className="text-xs leading-relaxed">
                  <h4 className="font-bold text-amber-500 mb-1">{t('alertTitle')}</h4>
                  <p className="text-slate-400">
                    {t('alertSub')}
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
