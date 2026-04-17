/* Chart.js builders. Premium palette, tabular-nums, subtle grids. */
(function () {
  const COLORS = ['#D4A857', '#10B981', '#60A5FA', '#A78BFA', '#F43F5E', '#F59E0B', '#34D399', '#38BDF8', '#F472B6', '#FB923C', '#22D3EE', '#E8C074'];
  const GRID = 'rgba(255,255,255,0.06)';
  const TEXT = '#9CA3AF';

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
  function setGlobalDefaults() {
    if (!window.Chart) return;
    Chart.defaults.font.family = "'Inter', system-ui, sans-serif";
    Chart.defaults.font.size = 11;
    Chart.defaults.color = TEXT;
    Chart.defaults.plugins.legend.labels.color = TEXT;
    Chart.defaults.plugins.tooltip.backgroundColor = '#0F1524';
    Chart.defaults.plugins.tooltip.titleColor = '#E5E7EB';
    Chart.defaults.plugins.tooltip.bodyColor = '#E5E7EB';
    Chart.defaults.plugins.tooltip.borderColor = '#273449';
    Chart.defaults.plugins.tooltip.borderWidth = 1;
    Chart.defaults.plugins.tooltip.padding = 10;
    Chart.defaults.plugins.tooltip.boxPadding = 6;
    Chart.defaults.plugins.tooltip.titleFont = { weight: '600' };
  }

  const Charts = {
    instances: {},
    colors: COLORS,

    destroy(id) {
      if (this.instances[id]) { this.instances[id].destroy(); delete this.instances[id]; }
    },

    category(ctx, categoryTotals) {
      setGlobalDefaults();
      this.destroy('category');
      const labels = categoryTotals.map(c => c.category);
      const data = categoryTotals.map(c => c.amount);
      this.instances.category = new Chart(ctx, {
        type: 'doughnut',
        data: {
          labels,
          datasets: [{
            data,
            backgroundColor: labels.map((_, i) => COLORS[i % COLORS.length]),
            borderColor: '#111827', borderWidth: 2, hoverOffset: 6, spacing: 1
          }]
        },
        options: {
          responsive: true, maintainAspectRatio: false, cutout: '64%',
          plugins: {
            legend: { position: 'bottom', labels: { boxWidth: 8, boxHeight: 8, padding: 10, usePointStyle: true } },
            tooltip: {
              callbacks: {
                label(item) {
                  const total = item.dataset.data.reduce((a, b) => a + b, 0);
                  const pct = total ? ((item.parsed / total) * 100).toFixed(1) : 0;
                  return ` ${item.label}: ${fmtINR(item.parsed)} (${pct}%)`;
                }
              }
            }
          }
        }
      });
    },

    daily(ctx, dailyTotals) {
      setGlobalDefaults();
      this.destroy('daily');
      const labels = dailyTotals.map(d => d.day);
      const data = dailyTotals.map(d => d.total);
      const gradient = ctx.getContext('2d').createLinearGradient(0, 0, 0, 260);
      gradient.addColorStop(0, 'rgba(212,168,87,0.28)');
      gradient.addColorStop(1, 'rgba(212,168,87,0.02)');
      this.instances.daily = new Chart(ctx, {
        type: 'line',
        data: {
          labels,
          datasets: [{
            data, label: 'Daily payments',
            borderColor: '#D4A857', backgroundColor: gradient, fill: true,
            pointRadius: 0, pointHoverRadius: 4, tension: 0.35, borderWidth: 2,
            pointHoverBackgroundColor: '#fff', pointHoverBorderColor: '#D4A857'
          }]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                title(items) { return 'Mar ' + items[0].label; },
                label(item) { const d = dailyTotals[item.dataIndex]; return ` ${fmtINR(item.parsed.y)}  ·  ${d.count} txns`; }
              }
            }
          },
          scales: {
            x: { grid: { color: GRID, drawTicks: false }, border: { display: false }, ticks: { maxRotation: 0, autoSkipPadding: 12 } },
            y: { grid: { color: GRID }, border: { display: false }, ticks: { callback: v => fmtCompact(v) } }
          }
        }
      });
    },

    banks(ctx, bankTotals, limit = 10) {
      setGlobalDefaults();
      this.destroy('banks');
      const top = bankTotals.slice(0, limit);
      const labels = top.map(b => b.bank.replace(/ (HO|Bank|BANK)$/i, '').slice(0, 18));
      const data = top.map(b => b.amount);
      this.instances.banks = new Chart(ctx, {
        type: 'bar',
        data: {
          labels,
          datasets: [{
            data,
            backgroundColor: labels.map((_, i) => i === 0 ? '#D4A857' : 'rgba(212,168,87,0.35)'),
            hoverBackgroundColor: '#E8C074',
            borderRadius: 4, borderSkipped: false, barPercentage: 0.85
          }]
        },
        options: {
          indexAxis: 'y', responsive: true, maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                title(items) { return top[items[0].dataIndex].bank; },
                label(item) { const b = top[item.dataIndex]; return ` ${fmtINR(item.parsed.x)}  ·  ${b.count} txns`; }
              }
            }
          },
          scales: {
            x: { grid: { color: GRID }, border: { display: false }, ticks: { callback: v => fmtCompact(v) } },
            y: { grid: { display: false }, border: { display: false }, ticks: { font: { size: 11 } } }
          }
        }
      });
    },

    dayTrend(ctx, labels, values, instanceKey) {
      setGlobalDefaults();
      this.destroy(instanceKey);
      const gradient = ctx.getContext('2d').createLinearGradient(0, 0, 0, 200);
      gradient.addColorStop(0, 'rgba(16,185,129,0.28)');
      gradient.addColorStop(1, 'rgba(16,185,129,0.02)');
      this.instances[instanceKey] = new Chart(ctx, {
        type: 'line',
        data: {
          labels,
          datasets: [{
            data, label: 'Amount',
            borderColor: '#10B981', backgroundColor: gradient, fill: true,
            pointRadius: 0, pointHoverRadius: 4, tension: 0.35, borderWidth: 2
          }]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: { callbacks: { title: items => 'Mar ' + items[0].label, label: item => ' ' + fmtINR(item.parsed.y) } }
          },
          scales: {
            x: { grid: { color: GRID, drawTicks: false }, border: { display: false } },
            y: { grid: { color: GRID }, border: { display: false }, ticks: { callback: v => fmtCompact(v) } }
          }
        }
      });
    }
  };

  window.Charts = Charts;
  window.fmtINR = fmtINR;
  window.fmtCompact = fmtCompact;
})();
