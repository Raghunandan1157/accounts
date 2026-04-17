/* Chart.js — editorial finance. Single emerald series. No legends, thin lines. */
(function () {
  const SIGNAL = '#10B981';
  const GRID = '#2A2A32';
  const TEXT = '#8B8B94';
  const FAINT = '#5A5A62';
  const TICK_FONT = { family: "'JetBrains Mono', ui-monospace, monospace", size: 10, weight: '500' };
  const TIP_FONT = { family: "'Inter', sans-serif", size: 12 };

  function fmtINR(v) {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(v || 0);
  }
  function fmtCompact(v) {
    const a = Math.abs(v || 0);
    if (a >= 1e7) return '₹' + (v / 1e7).toFixed(2) + ' Cr';
    if (a >= 1e5) return '₹' + (v / 1e5).toFixed(2) + ' L';
    if (a >= 1e3) return '₹' + (v / 1e3).toFixed(1) + ' K';
    return '₹' + (v || 0).toFixed(0);
  }

  function setDefaults() {
    if (!window.Chart) return;
    Chart.defaults.font = { family: "'Inter', sans-serif", size: 11 };
    Chart.defaults.color = TEXT;
    Chart.defaults.borderColor = GRID;
    Chart.defaults.plugins.legend.display = false;
    Chart.defaults.plugins.tooltip.backgroundColor = '#0B0B0F';
    Chart.defaults.plugins.tooltip.titleColor = '#EDEDEE';
    Chart.defaults.plugins.tooltip.bodyColor = '#EDEDEE';
    Chart.defaults.plugins.tooltip.borderColor = '#2A2A32';
    Chart.defaults.plugins.tooltip.borderWidth = 1;
    Chart.defaults.plugins.tooltip.padding = 10;
    Chart.defaults.plugins.tooltip.cornerRadius = 0;
    Chart.defaults.plugins.tooltip.displayColors = false;
    Chart.defaults.plugins.tooltip.titleFont = { ...TIP_FONT, weight: '500' };
    Chart.defaults.plugins.tooltip.bodyFont = TIP_FONT;
    Chart.defaults.animation = { duration: 240, easing: 'easeOutQuart' };
  }

  const Charts = {
    instances: {},
    destroy(id) { if (this.instances[id]) { this.instances[id].destroy(); delete this.instances[id]; } },

    daily(ctx, daily) {
      setDefaults();
      this.destroy('daily');
      const labels = daily.map(d => d.day);
      const values = daily.map(d => d.total);
      this.instances.daily = new Chart(ctx, {
        type: 'line',
        data: {
          labels,
          datasets: [{
            data: values,
            borderColor: SIGNAL,
            backgroundColor: 'rgba(16,185,129,0.07)',
            borderWidth: 1.5,
            fill: true,
            tension: 0.28,
            pointRadius: 0,
            pointHoverRadius: 3,
            pointHoverBackgroundColor: SIGNAL,
            pointHoverBorderColor: '#0B0B0F',
            pointHoverBorderWidth: 1
          }]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          plugins: {
            tooltip: {
              callbacks: {
                title: items => 'Mar ' + items[0].label,
                label: item => '  ' + fmtINR(item.parsed.y) + '   ·   ' + daily[item.dataIndex].count + ' txns'
              }
            }
          },
          scales: {
            x: {
              grid: { color: GRID, drawTicks: false, lineWidth: 1 },
              border: { display: false },
              ticks: { font: TICK_FONT, color: TEXT, maxRotation: 0, autoSkipPadding: 16, padding: 8 }
            },
            y: {
              grid: { color: GRID, lineWidth: 1 },
              border: { display: false },
              ticks: { font: TICK_FONT, color: TEXT, padding: 10, callback: v => fmtCompact(v) }
            }
          }
        }
      });
    },

    banks(ctx, bankTotals, limit = 10) {
      setDefaults();
      this.destroy('banks');
      const top = bankTotals.slice(0, limit);
      const labels = top.map(b => b.bank.replace(/\b(Bank|HO)\b/gi, '').replace(/\s+/g, ' ').trim());
      const values = top.map(b => b.amount);
      this.instances.banks = new Chart(ctx, {
        type: 'bar',
        data: {
          labels,
          datasets: [{
            data: values,
            backgroundColor: SIGNAL,
            hoverBackgroundColor: '#0E6B4E',
            borderWidth: 0,
            borderRadius: 0,
            barPercentage: 0.68,
            categoryPercentage: 0.86
          }]
        },
        options: {
          indexAxis: 'y',
          responsive: true, maintainAspectRatio: false,
          plugins: {
            tooltip: {
              callbacks: {
                title: items => top[items[0].dataIndex].bank,
                label: item => '  ' + fmtINR(item.parsed.x) + '   ·   ' + top[item.dataIndex].count + ' txns'
              }
            }
          },
          scales: {
            x: {
              grid: { color: GRID, lineWidth: 1 },
              border: { display: false },
              ticks: { font: TICK_FONT, color: TEXT, padding: 8, callback: v => fmtCompact(v) }
            },
            y: {
              grid: { display: false },
              border: { display: false, color: GRID },
              ticks: { font: { family: "'Inter'", size: 11 }, color: TEXT, padding: 12 }
            }
          }
        }
      });
    },

    trend(ctx, labels, values, key) {
      setDefaults();
      this.destroy(key);
      this.instances[key] = new Chart(ctx, {
        type: 'line',
        data: {
          labels,
          datasets: [{
            data: values,
            borderColor: SIGNAL,
            backgroundColor: 'rgba(16,185,129,0.06)',
            borderWidth: 1.5,
            fill: true,
            tension: 0.25,
            pointRadius: 0,
            pointHoverRadius: 3,
            pointHoverBackgroundColor: SIGNAL,
            pointHoverBorderColor: '#0B0B0F',
            pointHoverBorderWidth: 1
          }]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          plugins: {
            tooltip: { callbacks: { title: i => 'Mar ' + i[0].label, label: i => '  ' + fmtINR(i.parsed.y) } }
          },
          scales: {
            x: { grid: { color: GRID, lineWidth: 1 }, border: { display: false }, ticks: { font: TICK_FONT, color: TEXT, padding: 6, maxRotation: 0, autoSkipPadding: 12 } },
            y: { grid: { color: GRID, lineWidth: 1 }, border: { display: false }, ticks: { font: TICK_FONT, color: TEXT, padding: 8, callback: v => fmtCompact(v) } }
          }
        }
      });
    }
  };

  window.Charts = Charts;
  window.fmtINR = fmtINR;
  window.fmtCompact = fmtCompact;
})();
