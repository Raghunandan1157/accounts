/* Chart.js — light premium SaaS. Indigo series on a calm light grid. */
(function () {
  const ACCENT = '#4F46E5';
  const ACCENT_SOFT = 'rgba(79,70,229,0.10)';
  const GRID = '#EEEEEA';
  const TEXT = '#6B6B70';
  const INK = '#0A0A0A';
  const SURFACE = '#FFFFFF';
  const BORDER = '#E7E7E4';
  const TICK_FONT = { family: "'Geist Mono', ui-monospace, monospace", size: 10.5, weight: '500' };
  const TIP_FONT = { family: "'Geist', sans-serif", size: 12.5 };

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
    Chart.defaults.font = { family: "'Geist', sans-serif", size: 11 };
    Chart.defaults.color = TEXT;
    Chart.defaults.borderColor = GRID;
    Chart.defaults.plugins.legend.display = false;
    Chart.defaults.plugins.tooltip.backgroundColor = SURFACE;
    Chart.defaults.plugins.tooltip.titleColor = INK;
    Chart.defaults.plugins.tooltip.bodyColor = INK;
    Chart.defaults.plugins.tooltip.borderColor = BORDER;
    Chart.defaults.plugins.tooltip.borderWidth = 1;
    Chart.defaults.plugins.tooltip.padding = 10;
    Chart.defaults.plugins.tooltip.cornerRadius = 8;
    Chart.defaults.plugins.tooltip.displayColors = false;
    Chart.defaults.plugins.tooltip.titleFont = { ...TIP_FONT, weight: '500' };
    Chart.defaults.plugins.tooltip.bodyFont = TIP_FONT;
    Chart.defaults.animation = { duration: 280, easing: 'easeOutQuart' };
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
            borderColor: ACCENT,
            backgroundColor: ACCENT_SOFT,
            borderWidth: 1.5,
            fill: true,
            tension: 0.28,
            pointRadius: 0,
            pointHoverRadius: 4,
            pointHoverBackgroundColor: ACCENT,
            pointHoverBorderColor: SURFACE,
            pointHoverBorderWidth: 2
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
              grid: { display: false },
              border: { display: false },
              ticks: { font: TICK_FONT, color: TEXT, maxRotation: 0, autoSkipPadding: 18, padding: 6 }
            },
            y: {
              grid: { color: GRID, lineWidth: 1, drawTicks: false },
              border: { display: false },
              ticks: { font: TICK_FONT, color: TEXT, padding: 8, callback: v => fmtCompact(v) }
            }
          }
        }
      });
    },

    spark(ctx, daily) {
      setDefaults();
      this.destroy('spark');
      const labels = daily.map(d => d.day);
      const values = daily.map(d => d.total);
      this.instances.spark = new Chart(ctx, {
        type: 'line',
        data: {
          labels,
          datasets: [{
            data: values,
            borderColor: ACCENT,
            backgroundColor: ACCENT_SOFT,
            borderWidth: 1.25,
            fill: true,
            tension: 0.32,
            pointRadius: 0
          }]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { tooltip: { enabled: false }, legend: { display: false } },
          scales: {
            x: { display: false },
            y: { display: false }
          },
          elements: { line: { capBezierPoints: true } }
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
            backgroundColor: ACCENT,
            hoverBackgroundColor: '#3730A3',
            borderWidth: 0,
            borderRadius: 4,
            barPercentage: 0.72,
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
              grid: { color: GRID, lineWidth: 1, drawTicks: false },
              border: { display: false },
              ticks: { font: TICK_FONT, color: TEXT, padding: 6, callback: v => fmtCompact(v) }
            },
            y: {
              grid: { display: false },
              border: { display: false },
              ticks: { font: { family: "'Geist', sans-serif", size: 11.5 }, color: TEXT, padding: 10 }
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
            borderColor: ACCENT,
            backgroundColor: ACCENT_SOFT,
            borderWidth: 1.5,
            fill: true,
            tension: 0.28,
            pointRadius: 0,
            pointHoverRadius: 3,
            pointHoverBackgroundColor: ACCENT,
            pointHoverBorderColor: SURFACE,
            pointHoverBorderWidth: 2
          }]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          plugins: {
            tooltip: { callbacks: { title: i => 'Mar ' + i[0].label, label: i => '  ' + fmtINR(i.parsed.y) } }
          },
          scales: {
            x: { grid: { display: false }, border: { display: false }, ticks: { font: TICK_FONT, color: TEXT, padding: 6, maxRotation: 0, autoSkipPadding: 14 } },
            y: { grid: { color: GRID, lineWidth: 1, drawTicks: false }, border: { display: false }, ticks: { font: TICK_FONT, color: TEXT, padding: 8, callback: v => fmtCompact(v) } }
          }
        }
      });
    }
  };

  window.Charts = Charts;
  window.fmtINR = fmtINR;
  window.fmtCompact = fmtCompact;
})();
