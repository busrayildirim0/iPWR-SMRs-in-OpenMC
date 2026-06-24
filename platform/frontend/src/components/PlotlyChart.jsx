import React, { useEffect, useRef } from 'react';

export default function PlotlyChart({ data, layout, config = {}, style = { width: '100%', height: '100%' } }) {
  const chartRef = useRef(null);

  useEffect(() => {
    if (chartRef.current && window.Plotly) {
      // Default dark theme styling for layout
      const darkLayout = {
        paper_bgcolor: 'transparent',
        plot_bgcolor: 'transparent',
        font: {
          color: '#94a3b8', // text-secondary
          family: 'Outfit, Inter, system-ui, sans-serif'
        },
        xaxis: {
          gridcolor: '#1e293b',
          linecolor: '#24324f',
          zerolinecolor: '#24324f',
          ...layout?.xaxis
        },
        yaxis: {
          gridcolor: '#1e293b',
          linecolor: '#24324f',
          zerolinecolor: '#24324f',
          ...layout?.yaxis
        },
        ...layout
      };

      const defaultConfig = {
        responsive: true,
        displayModeBar: true,
        displaylogo: false,
        modeBarButtonsToRemove: ['select2d', 'lasso2d', 'resetScale2d'],
        ...config
      };

      window.Plotly.newPlot(chartRef.current, data, darkLayout, defaultConfig);
    }
  }, [data, layout, config]);

  // Clean up plot on unmount to avoid memory leaks
  useEffect(() => {
    return () => {
      if (chartRef.current && window.Plotly) {
        window.Plotly.purge(chartRef.current);
      }
    };
  }, []);

  return <div ref={chartRef} style={style} className="plotly-chart-container" />;
}
