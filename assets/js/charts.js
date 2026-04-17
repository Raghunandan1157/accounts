/* Chart.js — light premium SaaS. Indigo series on a calm light grid. */
(function () {
  const ACCENT = '#4F46E5';
  const ACCENT_SOFT = 'rgba(79,70,229,0.10)';
  const GRID = '#EEEEEA';
  const TEXT = '#6B6B70';
  const INK = '#0A0A0A';
  const SURFACE = '#FFFFFF';
  const BORDER = '#E7E7E4';
  const MUTED = '#6B6B70';
  const TICK_FONT = { family: "'Geist Mono', ui-monospace, monospace", size: 10.5, weight: '500' };

  const INR = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
  function fmtINR(v) { return INR.format(v || 0); }
  function fmtCompact(v) {
    const a = Math.abs(v || 0);
    if (a >= 1e7) return '₹' + (v / 1e7).toFixed(2) + ' Cr';
    if (a >= 1e5) return '₹' + (v / 1e5).toFixed(2) + ' L';
    if (a >= 1e3) return '₹' + (v / 1e3).toFixed(1) + ' K';
    return '₹' + (v || 0).toFixed(0);
  }

  /* ---------- External HTML tooltip (themed, with soft shadow) ---------- */
  const TIP_ID = '__chartTip';
  function ensureTip() {
    let t = document.getElementById(TIP_ID);
    if (t) return t;
    t = document.createElement('div');
    t.id = TIP_ID;
    t.setAttribute('role', 'tooltip');
    t.style.cssText = [
      'position:absolute', 'pointer-events:none', 'opacity:0', 'z-index:1000',
      'background:' + SURFACE, 'border:1px solid ' + BORDER, 'border-radius:8px',
      'box-shadow:0 6px 24px rgba(10,10,10,0.06), 0 1px 3px rgba(10,10,10,0.05)',
      'padding:10px 12px', 'font-family:Geist, sans-serif', 'font-size:13px',
      'color:' + INK, 'min-width:180px', 'max-width:300px',
      'transition:opacity 120ms ease, transform 120ms ease',
      'transform:translateY(-2px)'
    ].join(';');
    document.body.appendChild(t);
    return t;
  }
  function hideTip() {
    const t = document.getElementById(TIP_ID);
    if (t) { t.style.opacity = '0'; t.style.transform = 'translateY(-2px)'; }
  }
  window.addEventListener('scroll', hideTip, { passive: true, capture: true });

  const EYEBROW_CSS =
    "font-family:'Geist Mono',ui-monospace,monospace;font-size:11px;color:" + MUTED +
    ";letter-spacing:.08em;text-transform:uppercase;margin-bottom:6px";
  const DOT_CSS =
    "width:8px;height:8px;background:" + ACCENT +
    ";border-radius:50%;display:inline-block;flex-shrink:0;margin-right:8px;transform:translateY(-1px)";
  const VAL_CSS =
    "font-family:'Geist Mono',ui-monospace,monospace;font-weight:500;font-variant-numeric:tabular-nums;font-size:13.5px;color:" + INK;
  const EXTRA_CSS =
    "font-size:12px;color:" + MUTED + ";margin-top:8px;padding-top:8px;border-top:1px solid #F0F0EE;line-height:1.45";

  function externalRender(context) {
    const { chart, tooltip } = context;
    if (!tooltip || tooltip.opacity === 0) { hideTip(); return; }
    const el = ensureTip();
    const title = (tooltip.title && tooltip.title.length) ? tooltip.title.join(' ') : '';
    const bodyLines = (tooltip.body || []).flatMap(b => b.lines || []);
    const afterLines = tooltip.afterBody || [];

    const bodyRow = bodyLines.map(line =>
      `<div style="display:flex;align-items:baseline"><span style="${DOT_CSS}"></span><span style="${VAL_CSS}">${line}</span></div>`
    ).join('');
    const after = afterLines.length
      ? `<div style="${EXTRA_CSS}">${afterLines.map(l => escapeHtml(l)).join('<br>')}</div>`
      : '';
    const eyebrow = title ? `<div style="${EYEBROW_CSS}">${escapeHtml(title)}</div>` : '';
    el.innerHTML = eyebrow + bodyRow + after;

    const rect = chart.canvas.getBoundingClientRect();
    const pad = 12;
    const tw = el.offsetWidth || 220;
    const th = el.offsetHeight || 60;
    let x = rect.left + window.scrollX + tooltip.caretX + pad;
    let y = rect.top + window.scrollY + tooltip.caretY - th - pad;
    // Flip if off right edge
    if (x + tw > window.scrollX + document.documentElement.clientWidth - 8) {
      x = rect.left + window.scrollX + tooltip.caretX - tw - pad;
    }
    if (y < window.scrollY + 8) {
      y = rect.top + window.scrollY + tooltip.caretY + pad;
    }
    el.style.left = x + 'px';
    el.style.top = y + 'px';
    el.style.opacity = '1';
    el.style.transform = 'translateY(0)';
  }
  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /**
   * Build a Chart.js tooltip configuration using the themed external renderer.
   * @param {(items) => string} titleFn  Returns the eyebrow title.
   * @param {(item)  => string} labelFn  Returns the primary value line (INR).
   * @param {(items) => string|string[]|null} [extraFn]  Optional supporting info.
   */
  function tooltipConfig(titleFn, labelFn, extraFn) {
    return {
      enabled: false,
      external: externalRender,
      mode: 'index',
      intersect: false,
      animation: { duration: 120 },
      callbacks: {
        title: (items) => items && items.length ? (titleFn ? titleFn(items) : '') : '',
        label: (item) => labelFn ? labelFn(item) : '',
        afterBody: (items) => {
          if (!extraFn) return [];
          const out = extraFn(items);
          if (out == null) return [];
          return Array.isArray(out) ? out : [out];
        }
      }
    };
  }

  function setDefaults() {
    if (!window.Chart) return;
    Chart.defaults.font = { family: "'Geist', sans-serif", size: 11 };
    Chart.defaults.color = TEXT;
    Chart.defaults.borderColor = GRID;
    Chart.defaults.plugins.legend.display = false;
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
      const topCatFor = (i) => {
        const bc = daily[i] && daily[i].byCategory;
        if (!bc) return null;
        const pair = Object.entries(bc).sort((a, b) => b[1] - a[1])[0];
        return pair ? { cat: pair[0], amt: pair[1] } : null;
      };
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
            tooltip: tooltipConfig(
              items => 'Mar ' + items[0].label,
              item => fmtINR(item.parsed.y),
              items => {
                const i = items[0].dataIndex;
                const d = daily[i];
                const top = topCatFor(i);
                const lines = [d.count + ' transactions'];
                if (top) lines.push('Top · ' + top.cat + ' ' + fmtCompact(top.amt));
                return lines;
              }
            )
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
            legend: { display: false },
            tooltip: tooltipConfig(
              items => 'Mar ' + items[0].label,
              item => fmtINR(item.parsed.y),
              items => {
                const d = daily[items[0].dataIndex];
                return d ? (d.count + ' transactions') : null;
              }
            )
          },
          scales: { x: { display: false }, y: { display: false } },
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
      const totalAll = bankTotals.reduce((a, b) => a + (b.amount || 0), 0) || 1;
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
          interaction: { mode: 'nearest', axis: 'y', intersect: false },
          plugins: {
            tooltip: tooltipConfig(
              items => top[items[0].dataIndex].bank,
              item => fmtINR(item.parsed.x),
              items => {
                const b = top[items[0].dataIndex];
                const share = ((b.amount / totalAll) * 100).toFixed(1);
                return [b.count + ' transactions', share + '% of outflow'];
              }
            )
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

    trend(ctx, labels, values, key, extra) {
      setDefaults();
      this.destroy(key);
      const seriesLabel = (extra && extra.seriesLabel) || '';
      const counts = (extra && extra.counts) || null;
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
            tooltip: tooltipConfig(
              items => 'Mar ' + items[0].label,
              item => fmtINR(item.parsed.y),
              items => {
                const i = items[0].dataIndex;
                const lines = [];
                if (seriesLabel) lines.push(seriesLabel);
                if (counts && counts[i] != null) lines.push(counts[i] + ' transactions');
                return lines.length ? lines : null;
              }
            )
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
  window.tooltipConfig = tooltipConfig;
})();
