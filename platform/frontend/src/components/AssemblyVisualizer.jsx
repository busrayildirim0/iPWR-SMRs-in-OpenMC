import React, { useState, useMemo } from 'react';

// Color Palette for Materials
const MATERIAL_COLORS = {
  fuel: '#f43f5e',        // rose-500
  poison: '#eab308',      // yellow-500
  clad: '#94a3b8',        // slate-400
  water: '#38bdf8',       // sky-400
  control: '#c084fc',     // purple-400
  guide: '#0ea5e9',       // sky-600
  helium: '#fdba74',      // orange-300
  ss304: '#cbd5e1'        // slate-300
};

// Generate coordinates for 127 hexagonal pins (7 rings)
const generateHexPins = (pitch = 1.38) => {
  const pins = [];
  const rings = 7;
  const maxStep = rings - 1; // 6
  
  for (let q = -maxStep; q <= maxStep; q++) {
    for (let r = -maxStep; r <= maxStep; r++) {
      if (Math.abs(q + r) <= maxStep) {
        const x = pitch * (q + r / 2);
        const y = pitch * (Math.sqrt(3) / 2) * r;
        const ringIndex = Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r));
        
        pins.push({ q, r, x, y, ring: ringIndex });
      }
    }
  }
  
  // Sort pins to align with CAREM-25 ring definitions: ring7 down to ring1
  // Inside each ring, sort by angle to match the list definitions
  pins.sort((a, b) => {
    if (a.ring !== b.ring) {
      return b.ring - a.ring; // Ring 6 (outermost) first
    }
    const angleA = Math.atan2(a.y, a.x);
    const angleB = Math.atan2(b.y, b.x);
    return angleA - angleB;
  });
  
  // Assign material types based on CAREM-25 layout
  // ring 7: all F (36)
  // ring 6: [X, F, F, F, F] * 6 (30)
  // ring 5: [X, F, F, F] * 6 (24)
  // ring 4: [X, F, F] * 6 (18)
  // ring 3: all F (12)
  // ring 2: all F (6)
  // ring 1: central G (1)
  
  let index = 0;
  
  // Ring 7 (ringIndex = 6) - 36 items
  for (let i = 0; i < 36; i++) {
    pins[index++].type = 'fuel';
  }
  
  // Ring 6 (ringIndex = 5) - 30 items
  for (let i = 0; i < 6; i++) {
    pins[index++].type = 'control'; // X
    pins[index++].type = 'fuel';
    pins[index++].type = 'fuel';
    pins[index++].type = 'fuel';
    pins[index++].type = 'fuel';
  }
  
  // Ring 5 (ringIndex = 4) - 24 items
  for (let i = 0; i < 6; i++) {
    pins[index++].type = 'control'; // X
    pins[index++].type = 'fuel';
    pins[index++].type = 'fuel';
    pins[index++].type = 'fuel';
  }
  
  // Ring 4 (ringIndex = 3) - 18 items
  for (let i = 0; i < 6; i++) {
    pins[index++].type = 'control'; // X
    pins[index++].type = 'fuel';
    pins[index++].type = 'fuel';
  }
  
  // Ring 3 (ringIndex = 2) - 12 items
  for (let i = 0; i < 12; i++) {
    pins[index++].type = 'fuel';
  }
  
  // Ring 2 (ringIndex = 1) - 6 items
  for (let i = 0; i < 6; i++) {
    pins[index++].type = 'fuel';
  }
  
  // Ring 1 (ringIndex = 0) - 1 item
  pins[index++].type = 'guide'; // Central instrument tube
  
  return pins;
};

// Generate grid for Square 17x17 lattice
const generateSquarePins = (pitch = 1.25984) => {
  const pins = [];
  const size = 17;
  const offset = (size * pitch) / 2.0;
  
  // Symmetric guide tube (X) locations in a 17x17 grid
  const isGuideTube = (row, col) => {
    if (row === 8 && col === 8) return 'guide'; // Central instrument G
    
    const gtcoords = [
      [2, 5], [2, 8], [2, 11],
      [3, 3], [3, 13],
      [5, 2], [5, 5], [5, 8], [5, 11], [5, 14],
      [8, 2], [8, 5],          [8, 11], [8, 14],
      [11, 2], [11, 5], [11, 8], [11, 11], [11, 14],
      [13, 3], [13, 13],
      [14, 5], [14, 8], [14, 11]
    ];
    
    const found = gtcoords.some(([r, c]) => r === row && c === col);
    return found ? 'control' : null;
  };
  
  // Poison (P) locations in a 17x17 grid (mPower style)
  const isPoison = (row, col) => {
    const poisoncoords = [
      [1, 1], [1, 3], [1, 6], [1, 10], [1, 13], [1, 15],
      [3, 1], [3, 15],
      [6, 1], [6, 15],
      [10, 1], [10, 15],
      [13, 1], [13, 15],
      [15, 1], [15, 3], [15, 6], [15, 10], [15, 13], [15, 15]
    ];
    return poisoncoords.some(([r, c]) => r === row && c === col);
  };
  
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      // Calculate coordinates centered at (0, 0)
      const x = (col + 0.5) * pitch - offset;
      const y = offset - (row + 0.5) * pitch; // Standard 2D Cartesian flip
      
      let type = 'fuel';
      const gtType = isGuideTube(row, col);
      if (gtType) {
        type = gtType;
      } else if (isPoison(row, col)) {
        type = 'poison';
      }
      
      pins.push({ row, col, x, y, type });
    }
  }
  return pins;
};

// Helper for linear color scaling for heatmaps (inferno-like color map)
const getHeatmapColor = (value, min, max) => {
  if (max === min) return 'rgba(255, 255, 255, 0.1)';
  const ratio = Math.max(0, Math.min(1, (value - min) / (max - min)));
  
  // Simple hot-metal/inferno scale
  // ratio = 0: black/blue -> ratio = 1: yellow/white
  const r = Math.floor(ratio * 255);
  const g = Math.floor(Math.pow(ratio, 2) * 200);
  const b = Math.floor(Math.pow(1 - ratio, 4) * 80 + ratio * 30);
  
  return `rgb(${r}, ${g}, ${b})`;
};

export default function AssemblyVisualizer({
  latticeType = 'Square',
  pinPitch = 1.25984,
  fuelRadius = 0.39218,
  gapRadius = 0.40005,
  cladRadius = 0.45720,
  controlRodState = 'Fully Withdrawn',
  poisonEnabled = false,
  results = null,
  activeMap = 'none' // 'none', 'power', 'absorption', 'flux'
}) {
  const [hoveredPin, setHoveredPin] = useState(null);
  
  // Generate pin coordinates
  const pins = useMemo(() => {
    if (latticeType === 'Square') {
      return generateSquarePins(pinPitch);
    } else {
      return generateHexPins(pinPitch);
    }
  }, [latticeType, pinPitch]);
  
  // Determine bounds of assembly
  const bounds = useMemo(() => {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    pins.forEach(p => {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    });
    
    const padding = pinPitch * 1.0;
    return {
      width: (maxX - minX) + padding * 2,
      height: (maxY - minY) + padding * 2,
      minX: minX - padding,
      minY: minY - padding
    };
  }, [pins, pinPitch]);
  
  // Determine min/max values for active heatmaps
  const heatmapRange = useMemo(() => {
    if (!results || activeMap === 'none') return { min: 0, max: 1 };
    
    let values = [];
    
    if (activeMap === 'power' && results.pin_power_map) {
      values = results.pin_power_map.flat().filter(v => v > 0);
    } else if (activeMap === 'flux' && results.flux_map) {
      // Map to 170x170, but we can also use average values
      values = results.flux_map.flat();
    } else if (activeMap === 'absorption' && results.absorption_map) {
      values = results.absorption_map.flat();
    }
    
    if (values.length === 0) return { min: 0, max: 1 };
    return {
      min: Math.min(...values),
      max: Math.max(...values)
    };
  }, [results, activeMap]);
  
  // Get cell data mapping for simulation overlay
  const getPinOverlayColor = (pin) => {
    if (!results || activeMap === 'none') return null;
    
    if (activeMap === 'power') {
      if (latticeType === 'Square' && results.pin_power_map) {
        // Read directly from 17x17 pin power grid
        const val = results.pin_power_map[pin.row]?.[pin.col] || 0;
        return val > 0 ? getHeatmapColor(val, heatmapRange.min, heatmapRange.max) : 'rgba(30, 41, 59, 0.4)';
      } else if (latticeType === 'Hexagonal' && results.pin_power_map) {
        // Hexagonal grid has 127 pins. In model generator, we tallied on a 15x15 grid.
        // We map the hexagonal pin to the nearest 15x15 grid coordinate.
        // Or we can interpolate based on its radial layout.
        // Let's do a simple mapping from hex space to 15x15
        const offset = 6.5 * pinPitch;
        const colIdx = Math.floor(((pin.x + offset) / (2 * offset)) * 15);
        const rowIdx = Math.floor(((offset - pin.y) / (2 * offset)) * 15);
        const val = results.pin_power_map[rowIdx]?.[colIdx] || 0;
        return val > 0 ? getHeatmapColor(val, heatmapRange.min, heatmapRange.max) : 'rgba(30, 41, 59, 0.4)';
      }
    } else {
      // Detailed heatmaps (170x170 grid)
      // Map pin coordinate (x,y) to 170x170 index
      const mapData = activeMap === 'flux' ? results.flux_map : results.absorption_map;
      if (!mapData) return null;
      
      const width = bounds.width - pinPitch * 2;
      const xRatio = (pin.x - (bounds.minX + pinPitch)) / width;
      const yRatio = ((bounds.minY + bounds.height - pinPitch) - pin.y) / width;
      
      const colIdx = Math.floor(xRatio * 170);
      const rowIdx = Math.floor(yRatio * 170);
      
      const val = mapData[rowIdx]?.[colIdx] || 0;
      return getHeatmapColor(val, heatmapRange.min, heatmapRange.max);
    }
    
    return null;
  };
  
  return (
    <div className="visualizer-wrapper">
      <div className="visualizer-container">
        {/* SVG Viewport */}
        <svg
          viewBox={`${bounds.minX} ${bounds.minY} ${bounds.width} ${bounds.height}`}
          className="w-full h-full select-none"
        >
          {/* Reflective boundaries wrapper */}
          {latticeType === 'Square' ? (
            <rect
              x={bounds.minX + pinPitch}
              y={bounds.minY + pinPitch}
              width={bounds.width - pinPitch * 2}
              height={bounds.height - pinPitch * 2}
              fill="none"
              stroke="#0ea5e9"
              strokeWidth="0.08"
              strokeDasharray="0.3 0.3"
            />
          ) : (
            <polygon
              points={
                Array.from({ length: 6 }).map((_, i) => {
                  const angle = (i * 60 * Math.PI) / 180;
                  const apothem = 6.5 * pinPitch;
                  const r = apothem / Math.cos(Math.PI / 6);
                  return `${r * Math.cos(angle)},${r * Math.sin(angle)}`;
                }).join(' ')
              }
              fill="none"
              stroke="#0ea5e9"
              strokeWidth="0.08"
              strokeDasharray="0.3 0.3"
            />
          )}
          
          {/* Render individual pins */}
          {pins.map((pin, i) => {
            const overlayColor = getPinOverlayColor(pin);
            
            // Determine active color of components based on configuration state
            let pinColor = MATERIAL_COLORS.fuel;
            let label = "Fuel Rod (UO₂)";
            
            if (pin.type === 'control') {
              if (controlRodState === 'Fully Withdrawn') {
                pinColor = MATERIAL_COLORS.water;
                label = "Empty Guide Tube (Water Filled)";
              } else {
                pinColor = MATERIAL_COLORS.control;
                label = `Control Rod (${controlRodState})`;
              }
            } else if (pin.type === 'guide') {
              pinColor = MATERIAL_COLORS.guide;
              label = "Instrumentation Tube";
            } else if (pin.type === 'poison') {
              if (poisonEnabled) {
                pinColor = MATERIAL_COLORS.poison;
                label = "Burnable Poison Rod (UO₂-Gd₂O₃)";
              } else {
                pinColor = MATERIAL_COLORS.fuel;
                label = "Fuel Rod (UO₂)";
              }
            }
            
            const isHovered = hoveredPin === i;
            
            return (
              <g
                key={i}
                onMouseEnter={() => setHoveredPin(i)}
                onMouseLeave={() => setHoveredPin(null)}
                style={{ cursor: 'pointer' }}
              >
                {/* Cladding Outer Circle */}
                <circle
                  cx={pin.x}
                  cy={pin.y}
                  r={cladRadius}
                  fill={overlayColor || MATERIAL_COLORS.clad}
                  opacity={overlayColor ? 1 : 0.8}
                />
                
                {/* Helium Gap / Guide inner circle */}
                <circle
                  cx={pin.x}
                  cy={pin.y}
                  r={gapRadius}
                  fill={overlayColor ? 'none' : (pin.type === 'control' || pin.type === 'guide' ? MATERIAL_COLORS.water : MATERIAL_COLORS.helium)}
                />
                
                {/* Fuel Pellet / Control rod absorber circle */}
                {!overlayColor && (
                  <circle
                    cx={pin.x}
                    cy={pin.y}
                    r={fuelRadius}
                    fill={pinColor}
                  />
                )}
                
                {/* Hover Highlight Ring */}
                {isHovered && (
                  <circle
                    cx={pin.x}
                    cy={pin.y}
                    r={pinPitch * 0.48}
                    fill="none"
                    stroke="#38bdf8"
                    strokeWidth="0.05"
                  />
                )}
              </g>
            );
          })}
        </svg>
        
        {/* Tooltip Overlay */}
        {hoveredPin !== null && (
          <div className="absolute bottom-4 left-4 right-4 bg-slate-950/90 border border-sky-500/30 backdrop-blur-md px-4 py-3 rounded-lg text-xs pointer-events-none flex flex-col gap-1 shadow-lg">
            <div className="flex justify-between items-center border-b border-slate-800 pb-1 mb-1">
              <span className="font-semibold text-sky-400">
                {pins[hoveredPin].type === 'fuel' || (pins[hoveredPin].type === 'poison' && !poisonEnabled) ? 'UO₂ Fuel Pin' : 
                 (pins[hoveredPin].type === 'poison' ? 'UO₂-Gd₂O₃ Poison Pin' : 
                  (pins[hoveredPin].type === 'control' ? 'Control Rod / Guide Tube' : 'Instrument Guide Tube'))}
              </span>
              <span className="text-slate-500">
                {latticeType === 'Square' ? `R: ${pins[hoveredPin].row}, C: ${pins[hoveredPin].col}` : `Q: ${pins[hoveredPin].q}, R: ${pins[hoveredPin].r}`}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1">
              <span className="text-slate-400">Coordinate X:</span>
              <span className="text-slate-200 text-right">{pins[hoveredPin].x.toFixed(4)} cm</span>
              <span className="text-slate-400">Coordinate Y:</span>
              <span className="text-slate-200 text-right">{pins[hoveredPin].y.toFixed(4)} cm</span>
              
              {results && activeMap === 'power' && results.pin_power_map && (
                <>
                  <span className="text-slate-400 font-medium">Pin Power:</span>
                  <span className="text-emerald-400 text-right font-semibold">
                    {latticeType === 'Square' 
                      ? (results.pin_power_map[pins[hoveredPin].row]?.[pins[hoveredPin].col] || 0).toExponential(3)
                      : "Overlaid"
                    }
                  </span>
                </>
              )}
            </div>
          </div>
        )}
      </div>
      
      {/* Legend */}
      <div className="mt-4 flex flex-wrap gap-4 justify-center text-xs text-slate-400">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: MATERIAL_COLORS.fuel }} />
          <span>UO₂ Fuel</span>
        </div>
        {poisonEnabled && (
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: MATERIAL_COLORS.poison }} />
            <span>UO₂-Gd₂O₃ poison</span>
          </div>
        )}
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: MATERIAL_COLORS.clad }} />
          <span>Cladding</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: MATERIAL_COLORS.water }} />
          <span>Coolant (Water)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: MATERIAL_COLORS.control }} />
          <span>Control Absorber</span>
        </div>
      </div>
    </div>
  );
}
