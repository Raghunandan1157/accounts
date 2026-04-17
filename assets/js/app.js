/* Accounts — routing, state, interactions. Editorial finance dashboard. */
(function () {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  const state = {
    data: null,
    route: 'overview',
    day: null,
    category: null,
    bank: null,
    txn: {
      page: 1, pageSize: 50,
      sort: { key: 'date', dir: 'asc' },
      filters: { q: '', bank: '', category: '', from: '', to: '', min: '', max: '' }
    },
    palette: { open: false, results: [], idx: 0 },
    keyBuf: ''
  };

  const fmtINR = window.fmtINR;
  const fmtCompact = window.fmtCompact;
  const fmtDate = (iso) => {
    const d = new Date(iso + 'T00:00:00');
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
  };
  const dayNum = (iso) => parseInt(iso.slice(-2), 10);
  const dowIdx = (iso) => { // Mon=0..Sun=6
    const d = new Date(iso + 'T00:00:00').getDay();
    return (d + 6) % 7;
  };
  const esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const truncate = (s, n) => { s = s || ''; return s.length > n ? s.slice(0, n - 1) + '…' : s; };

  /* ---------- Init ---------- */
  async function init() {
    try {
      state.data = await window.DataLoader.load();
    } catch (err) {
      console.error(err);
      $('#main').innerHTML = `<div class="empty"><strong>Could not load data</strong>${esc(err.message)}</div>`;
      return;
    }
    renderOverview();
    setupRouting();
    setupCalendar();
    setupCategoryList();
    setupBankList();
    setupTransactions();
    setupSchedules();
    setupPalette();
    setupHelp();
    setupKeyboard();
    const hash = location.hash.replace('#', '') || 'overview';
    go(hash);
  }

  /* ---------- Overview ---------- */
  function renderOverview() {
    const d = state.data;
    const s = d.summary;

    const cr = (n) => (n / 1e7).toFixed(2);
    const uncat = d.categoryTotals.find(c => c.category === 'Uncategorized') || { count: 0, amount: 0 };
    const topCat = d.categoryTotals[0] || {};
    const topBank = d.bankTotals[0] || {};

    $('#heroValue').textContent = '₹ ' + cr(s.totalPayments) + ' Cr';
    $('#heroMeta').innerHTML =
      `<strong>${s.transactionCount.toLocaleString('en-IN')}</strong> transactions`
      + `<span class="pipe">|</span><strong>${s.bankCount}</strong> accounts`
      + `<span class="pipe">|</span><strong>${s.daysWithActivity}</strong> of 31 days active`;

    $('#statStrip').innerHTML = [
      { l: 'Largest category', v: topCat.category, sub: fmtCompact(topCat.amount) + ' · ' + topCat.count + ' txns' },
      { l: 'Primary bank',     v: truncate(topBank.bank, 22), sub: fmtCompact(topBank.amount) },
      { l: 'Avg ticket',       v: fmtCompact(s.totalPayments / s.transactionCount), sub: 'per transaction' },
      { l: 'Busiest day',      v: busiestDay(d), sub: 'by outflow' }
    ].map(k =>
      `<div class="stat" role="listitem">
        <div class="stat__label">${esc(k.l)}</div>
        <div class="stat__value">${esc(k.v)}</div>
        <div class="stat__sub">${esc(k.sub)}</div>
      </div>`).join('');

    // Category ledger
    const total = s.totalPayments;
    $('#catLedger tbody').innerHTML = d.categoryTotals.map(c => `
      <tr><td>${esc(c.category)}</td>
        <td class="num">${fmtINR(c.amount)}</td>
        <td class="num mono">${((c.amount / total) * 100).toFixed(1)}%</td>
        <td class="num mono">${c.count}</td></tr>`).join('');

    // Charts
    window.Charts.daily($('#chartDaily'), d.dailyTotals);
    window.Charts.banks($('#chartBanks'), d.bankTotals, 10);
    const sparkEl = $('#chartSpark');
    if (sparkEl && window.Charts.spark) window.Charts.spark(sparkEl, d.dailyTotals);
    const cm = $('#catLedgerMeta');
    if (cm) cm.textContent = d.categoryTotals.length + ' categories';

    // Top 10
    const top = [...d.transactions].sort((a, b) => b.amount - a.amount).slice(0, 10);
    $('#topTxnTable tbody').innerHTML = top.map(t => txnRow(t)).join('');

    renderInsights();
  }

  function busiestDay(d) {
    const b = [...d.dailyTotals].sort((a, b) => b.total - a.total)[0];
    if (!b) return '—';
    return 'Mar ' + b.day + ' · ' + fmtCompact(b.total);
  }

  function txnRow(t) {
    return `<tr data-id="${t.id}">
      <td class="c-date">${fmtDate(t.date)}</td>
      <td class="particulars">${esc(truncate(t.particulars, 130))}</td>
      <td><span class="mono">${esc(truncate(t.bank, 28))}</span></td>
      <td><span class="pill ${t.category === 'Uncategorized' ? 'pill--warn' : ''}">${esc(t.category || 'Uncategorized')}</span></td>
      <td class="num">${fmtINR(t.amount)}</td></tr>`;
  }

  /* ---------- Insights ---------- */
  function renderInsights() {
    const I = state.data.insights;
    const el = $('#insights');
    if (!I) { el.innerHTML = ''; return; }

    const weeks = I.weekSummaries || [];
    const maxW = Math.max(...weeks.map(w => w.total)) || 1;
    const bars = weeks.map(w => {
      const h = Math.max(2, Math.round((w.total / maxW) * 100));
      return `<div class="bars__col">
        <div class="bars__val">${fmtCompact(w.total)}</div>
        <div style="flex:1;display:flex;align-items:flex-end"><div class="bars__fill" style="height:${h}%;width:100%"></div></div>
        <div class="bars__lbl">W${w.week}</div>
      </div>`;
    }).join('');

    const cat = I.categoryConcentration || {};
    const bank = I.bankConcentration || {};
    const uncat = I.uncategorizedFlag || {};
    const extreme = I.extremeDays || {};

    const rows = (arr, formatter) => arr.map(formatter).join('');
    const top5 = rows((I.top5LargestTransactions || []), t =>
      `<div class="insight__row">
        <div class="insight__row-label">${esc(truncate(t.particulars, 42))}</div>
        <div class="insight__row-amt">${fmtINR(t.amount)}</div>
        <div class="insight__row-meta">${fmtDate(t.date)} · ${esc(truncate(t.bank, 24))} · ${esc(t.category || 'Uncategorized')}</div>
      </div>`);
    const anomalies = rows((I.anomalies || []).slice(0, 5), a =>
      `<div class="insight__row">
        <div class="insight__row-label">${esc(truncate(a.particulars, 42))}</div>
        <div class="insight__row-amt">${fmtINR(a.amount)}</div>
        <div class="insight__row-meta">${fmtDate(a.date)} · ${esc(a.category || 'Uncategorized')} · z=${(a.zScore || 0).toFixed(1)}</div>
      </div>`);
    const jumps = rows((I.dayOverDayBiggestJumps || []).slice(0, 5), j => {
      const cls = j.direction === 'up' ? 'pos' : 'neg';
      const sign = j.direction === 'up' ? '▲' : '▼';
      const pct = Math.abs(j.pctChange || 0) >= 1000 ? `${((j.pctChange || 0) / 100).toFixed(0)}×` : `${(j.pctChange || 0).toFixed(0)}%`;
      return `<div class="insight__row">
        <div class="insight__row-label">${fmtDate(j.date)} <span style="color:var(--muted)">vs ${fmtDate(j.prevDate)}</span></div>
        <div class="insight__row-amt ${cls}">${sign} ${pct}</div>
        <div class="insight__row-meta">${fmtCompact(j.prevTotal)} → ${fmtCompact(j.currTotal)}</div>
      </div>`;
    });

    el.innerHTML = `
      <div class="insight insight--wide">
        <span class="insight__eyebrow">Fig. 03 · Weekly rhythm</span>
        <h2 class="insight__title">Five weeks, month-end spike.</h2>
        <div class="bars">${bars}</div>
      </div>

      <div class="insight insight--third">
        <span class="insight__eyebrow">Concentration · Categories</span>
        <h2 class="insight__title">${esc(cat.interpretation || '')}</h2>
        <div class="gauge">
          <div class="gauge__ring" style="--p:${Math.round(cat.top3SharePct || 0)}"><span>${(cat.top3SharePct || 0).toFixed(1)}%</span></div>
          <div class="gauge__text"><strong>Top-3 categories</strong><small>HHI ${Math.round(cat.hhi || 0)} · top-1 ${(cat.top1SharePct || 0).toFixed(1)}%</small></div>
        </div>
      </div>

      <div class="insight insight--third">
        <span class="insight__eyebrow">Concentration · Banks</span>
        <h2 class="insight__title">${esc(bank.interpretation || '')}</h2>
        <div class="gauge">
          <div class="gauge__ring" style="--p:${Math.round(bank.top3SharePct || 0)}"><span>${(bank.top3SharePct || 0).toFixed(1)}%</span></div>
          <div class="gauge__text"><strong>Top-3 banks</strong><small>HHI ${Math.round(bank.hhi || 0)} · top-1 ${(bank.top1SharePct || 0).toFixed(1)}%</small></div>
        </div>
      </div>

      <div class="insight insight--third">
        <span class="insight__eyebrow">Extreme days</span>
        <h2 class="insight__title">Peaks & troughs.</h2>
        <div class="insight__rows">
          <div class="insight__row"><div class="insight__row-label">Busiest · ${fmtDate(extreme.busiestByAmount?.date)}</div><div class="insight__row-amt">${fmtINR(extreme.busiestByAmount?.total || 0)}</div><div class="insight__row-meta">${extreme.busiestByAmount?.count || 0} txns</div></div>
          <div class="insight__row"><div class="insight__row-label">Slowest · ${fmtDate(extreme.slowestByAmount?.date)}</div><div class="insight__row-amt">${fmtINR(extreme.slowestByAmount?.total || 0)}</div><div class="insight__row-meta">${extreme.slowestByAmount?.count || 0} txns</div></div>
          <div class="insight__row"><div class="insight__row-label">Most txns · ${fmtDate(extreme.busiestByCount?.date)}</div><div class="insight__row-amt">${extreme.busiestByCount?.count || 0}</div><div class="insight__row-meta">${fmtCompact(extreme.busiestByCount?.total || 0)}</div></div>
        </div>
      </div>

      <div class="insight">
        <span class="insight__eyebrow">Tbl. 03 · Top 5 largest</span>
        <h2 class="insight__title">Single-transaction leaders.</h2>
        <div class="insight__rows">${top5}</div>
      </div>

      <div class="insight">
        <span class="insight__eyebrow">Tbl. 04 · Anomalies</span>
        <h2 class="insight__title">${I.anomalyCount || 0} flagged · z-score outliers.</h2>
        <div class="insight__rows">${anomalies}</div>
      </div>

      <div class="insight">
        <span class="insight__eyebrow">Tbl. 05 · Day-over-day jumps</span>
        <h2 class="insight__title">Biggest % moves.</h2>
        <div class="insight__rows">${jumps}</div>
      </div>

      ${(uncat.totalCount || 0) > 0 ? `
      <div class="insight insight--wide">
        <div class="callout">
          <span class="callout__idx">Action item</span>
          <div class="callout__text">
            <strong>${fmtINR(uncat.totalAmount || 0)}</strong> across <strong>${uncat.totalCount || 0}</strong> transactions (${(uncat.sharePct || 0).toFixed(2)}% of month) are unclassified.
            <small>Concentrated in ${(uncat.byBank || []).slice(0, 3).map(b => esc(truncate(b.bank, 22)) + ' (' + b.count + ')').join(' · ') || '—'}</small>
          </div>
          <button class="btn" id="uncatBtn">Review →</button>
        </div>
      </div>` : ''}`;

    const btn = $('#uncatBtn');
    if (btn) btn.addEventListener('click', () => {
      $('#txnCategory').value = 'Uncategorized';
      $('#txnCategory').dispatchEvent(new Event('input', { bubbles: true }));
      go('transactions');
    });
  }

  /* ---------- Routing ---------- */
  function setupRouting() {
    $$('.rail__item').forEach(btn => btn.addEventListener('click', () => go(btn.dataset.route)));
    window.addEventListener('hashchange', () => go(location.hash.replace('#', '') || 'overview'));
  }
  function go(route) {
    if (!['overview', 'daily', 'categories', 'banks', 'transactions', 'schedules'].includes(route)) route = 'overview';
    state.route = route;
    location.hash = route;
    $$('.rail__item').forEach(t => t.setAttribute('aria-selected', t.dataset.route === route ? 'true' : 'false'));
    $$('.view').forEach(v => v.hidden = v.dataset.view !== route);
    if (route === 'daily' && state.day == null) selectDay(state.data.dailyTotals[0].date);
    if (route === 'categories' && !state.category) selectCategory(state.data.categoryTotals[0].category);
    if (route === 'banks' && !state.bank) selectBank(state.data.bankTotals[0].bank);
    if (route === 'transactions') renderTxnTable();
    if (route === 'schedules' && !state.schedule) selectSchedule(SCHEDULES[0].key);
    window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
  }

  /* ---------- Calendar (7×5) ---------- */
  function setupCalendar() {
    const grid = $('#calGrid');
    const daily = state.data.dailyTotals;
    const max = Math.max(...daily.map(d => d.total));
    const first = daily[0];
    const offset = dowIdx(first.date);
    const cells = [];
    for (let i = 0; i < offset; i++) cells.push('<div class="cal__cell cal__cell--empty" aria-hidden="true"></div>');
    daily.forEach(d => {
      const w = max ? Math.round((d.total / max) * 100) : 0;
      cells.push(`<button class="cal__cell" role="gridcell" data-date="${d.date}" aria-selected="false">
        <span class="cal__day">${d.day}</span>
        <span class="cal__count">${d.count}</span>
        <span class="cal__amt">${fmtCompact(d.total)}</span>
        <span class="cal__bar" style="--w:${w}%"></span>
      </button>`);
    });
    // pad to complete row
    const total = cells.length;
    const pad = (7 - (total % 7)) % 7;
    for (let i = 0; i < pad; i++) cells.push('<div class="cal__cell cal__cell--empty" aria-hidden="true"></div>');
    grid.innerHTML = cells.join('');
    grid.addEventListener('click', (e) => {
      const b = e.target.closest('.cal__cell[data-date]');
      if (b) selectDay(b.dataset.date);
    });
    $('#dayFilter').addEventListener('input', renderDayTable);
  }

  function selectDay(date) {
    state.day = date;
    $$('#calGrid .cal__cell[data-date]').forEach(c => c.setAttribute('aria-selected', c.dataset.date === date ? 'true' : 'false'));
    const d = state.data.dailyTotals.find(x => x.date === date);
    const weekday = new Date(date + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'long' });
    $('#dayTitle').textContent = new Date(date + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'long' });
    const topCats = Object.entries(d.byCategory || {}).sort((a, b) => b[1] - a[1]).slice(0, 3)
      .map(([k, v]) => `${k} ${fmtCompact(v)}`).join('  ·  ') || '—';
    $('#dayMeta').innerHTML = `${weekday} · <strong style="color:var(--text)">${fmtINR(d.total)}</strong> · ${d.count} txns · ${esc(topCats)}`;
    renderDayTable();
  }

  function renderDayTable() {
    if (!state.day) return;
    const q = ($('#dayFilter').value || '').toLowerCase().trim();
    const rows = state.data.transactions.filter(t => t.date === state.day)
      .filter(t => !q || (t.particulars + ' ' + t.bank + ' ' + (t.category || '')).toLowerCase().includes(q))
      .sort((a, b) => b.amount - a.amount);
    $('#dayTable tbody').innerHTML = rows.length
      ? rows.map(t => txnRow(t)).join('')
      : `<tr><td colspan="5"><div class="empty"><strong>No transactions</strong>${q ? 'Clear the filter.' : 'No activity on this day.'}</div></td></tr>`;
  }

  /* ---------- Categories ---------- */
  function setupCategoryList() {
    const cats = state.data.categoryTotals;
    const total = state.data.summary.totalPayments;
    $('#catList').innerHTML = cats.map((c, i) => `
      <button class="sidelist__item" role="option" data-key="${esc(c.category)}" aria-selected="false">
        <span class="sidelist__name">${esc(c.category)}</span>
        <span class="sidelist__amt">${fmtCompact(c.amount)}</span>
        <span class="sidelist__meta">${String(i + 1).padStart(2, '0')} · ${c.count} txns · ${((c.amount / total) * 100).toFixed(1)}%</span>
      </button>`).join('');
    $('#catList').addEventListener('click', (e) => {
      const b = e.target.closest('.sidelist__item'); if (b) selectCategory(b.dataset.key);
    });
    $('#catFilter').addEventListener('input', renderCategoryTable);
  }

  function selectCategory(cat) {
    state.category = cat;
    $$('#catList .sidelist__item').forEach(i => i.setAttribute('aria-selected', i.dataset.key === cat ? 'true' : 'false'));
    const t = state.data.categoryTotals.find(c => c.category === cat);
    const idx = state.data.categoryTotals.findIndex(c => c.category === cat);
    $('#catIdx').textContent = String(idx + 1).padStart(2, '0') + ' · Category';
    $('#catTitle').textContent = cat;
    $('#catMeta').innerHTML = `<strong style="color:var(--text)">${fmtINR(t?.amount || 0)}</strong> · ${t?.count || 0} transactions`;
    const labels = state.data.dailyTotals.map(d => d.day);
    const values = state.data.dailyTotals.map(d => (d.byCategory && d.byCategory[cat]) || 0);
    window.Charts.trend($('#chartCatTrend'), labels, values, 'catTrend', { seriesLabel: cat });
    renderCategoryTable();
  }

  function renderCategoryTable() {
    if (!state.category) return;
    const q = ($('#catFilter').value || '').toLowerCase().trim();
    const rows = state.data.transactions
      .filter(t => (t.category || 'Uncategorized') === state.category)
      .filter(t => !q || (t.particulars + ' ' + t.bank).toLowerCase().includes(q))
      .sort((a, b) => b.amount - a.amount);
    $('#catTable tbody').innerHTML = rows.length
      ? rows.map(t => `<tr><td class="c-date">${fmtDate(t.date)}</td><td class="particulars">${esc(truncate(t.particulars, 130))}</td><td class="mono">${esc(truncate(t.bank, 28))}</td><td class="num">${fmtINR(t.amount)}</td></tr>`).join('')
      : `<tr><td colspan="4"><div class="empty"><strong>No transactions</strong></div></td></tr>`;
  }

  /* ---------- Banks ---------- */
  function setupBankList() {
    const banks = state.data.bankTotals;
    const total = state.data.summary.totalPayments;
    $('#bankList').innerHTML = banks.map((b, i) => `
      <button class="sidelist__item" role="option" data-key="${esc(b.bank)}" aria-selected="false">
        <span class="sidelist__name">${esc(b.bank)}</span>
        <span class="sidelist__amt">${fmtCompact(b.amount)}</span>
        <span class="sidelist__meta">${String(i + 1).padStart(2, '0')} · ${b.count} txns · ${((b.amount / total) * 100).toFixed(1)}%</span>
      </button>`).join('');
    $('#bankList').addEventListener('click', (e) => {
      const btn = e.target.closest('.sidelist__item'); if (btn) selectBank(btn.dataset.key);
    });
    $('#bankFilter').addEventListener('input', renderBankTable);
  }

  function selectBank(bank) {
    state.bank = bank;
    $$('#bankList .sidelist__item').forEach(i => i.setAttribute('aria-selected', i.dataset.key === bank ? 'true' : 'false'));
    const t = state.data.bankTotals.find(b => b.bank === bank);
    const idx = state.data.bankTotals.findIndex(b => b.bank === bank);
    $('#bankIdx').textContent = String(idx + 1).padStart(2, '0') + ' · Bank';
    $('#bankTitle').textContent = bank;
    $('#bankMeta').innerHTML = `<strong style="color:var(--text)">${fmtINR(t?.amount || 0)}</strong> · ${t?.count || 0} transactions`;
    const byDay = {};
    state.data.transactions.forEach(x => { if (x.bank === bank) byDay[x.date] = (byDay[x.date] || 0) + x.amount; });
    const labels = state.data.dailyTotals.map(d => d.day);
    const values = state.data.dailyTotals.map(d => byDay[d.date] || 0);
    window.Charts.trend($('#chartBankTrend'), labels, values, 'bankTrend', { seriesLabel: bank });
    renderBankTable();
  }

  function renderBankTable() {
    if (!state.bank) return;
    const q = ($('#bankFilter').value || '').toLowerCase().trim();
    const rows = state.data.transactions.filter(t => t.bank === state.bank)
      .filter(t => !q || (t.particulars + ' ' + (t.category || '')).toLowerCase().includes(q))
      .sort((a, b) => b.amount - a.amount);
    $('#bankTable tbody').innerHTML = rows.length
      ? rows.map(t => `<tr><td class="c-date">${fmtDate(t.date)}</td><td class="particulars">${esc(truncate(t.particulars, 130))}</td><td><span class="pill ${t.category === 'Uncategorized' ? 'pill--warn' : ''}">${esc(t.category || 'Uncategorized')}</span></td><td class="num">${fmtINR(t.amount)}</td></tr>`).join('')
      : `<tr><td colspan="4"><div class="empty"><strong>No transactions</strong></div></td></tr>`;
  }

  /* ---------- Transactions ---------- */
  function setupTransactions() {
    const banks = state.data.bankTotals.map(b => b.bank);
    const cats = state.data.categoryTotals.map(c => c.category);
    $('#txnBank').innerHTML = `<option value="">All banks</option>` + banks.map(b => `<option>${esc(b)}</option>`).join('');
    $('#txnCategory').innerHTML = `<option value="">All categories</option>` + cats.map(c => `<option>${esc(c)}</option>`).join('');

    const inputs = ['txnSearch', 'txnBank', 'txnCategory', 'txnFrom', 'txnTo', 'txnMin', 'txnMax'];
    inputs.forEach(id => $('#' + id).addEventListener('input', () => {
      const f = state.txn.filters;
      f.q = $('#txnSearch').value;
      f.bank = $('#txnBank').value;
      f.category = $('#txnCategory').value;
      f.from = $('#txnFrom').value;
      f.to = $('#txnTo').value;
      f.min = $('#txnMin').value;
      f.max = $('#txnMax').value;
      state.txn.page = 1;
      renderTxnTable();
    }));
    $('#txnReset').addEventListener('click', () => {
      inputs.forEach(id => $('#' + id).value = '');
      state.txn.filters = { q: '', bank: '', category: '', from: '', to: '', min: '', max: '' };
      state.txn.page = 1;
      renderTxnTable();
    });
    $$('#txnTable thead th[data-sort]').forEach(th => th.addEventListener('click', () => {
      const key = th.dataset.sort;
      const s = state.txn.sort;
      s.dir = (s.key === key && s.dir === 'asc') ? 'desc' : 'asc';
      s.key = key;
      renderTxnTable();
    }));
    $('#pagerPrev').addEventListener('click', () => { if (state.txn.page > 1) { state.txn.page--; renderTxnTable(); } });
    $('#pagerNext').addEventListener('click', () => { state.txn.page++; renderTxnTable(); });
  }

  function applyFilters() {
    const f = state.txn.filters;
    const q = f.q.toLowerCase().trim();
    const min = f.min === '' ? -Infinity : +f.min;
    const max = f.max === '' ? Infinity : +f.max;
    return state.data.transactions.filter(t => {
      if (f.bank && t.bank !== f.bank) return false;
      if (f.category && (t.category || 'Uncategorized') !== f.category) return false;
      if (f.from && t.date < f.from) return false;
      if (f.to && t.date > f.to) return false;
      if (t.amount < min || t.amount > max) return false;
      if (q && !((t.particulars + ' ' + t.bank + ' ' + (t.category || '')).toLowerCase().includes(q))) return false;
      return true;
    });
  }

  function renderTxnTable() {
    const rows = applyFilters();
    const s = state.txn.sort;
    rows.sort((a, b) => {
      let va = a[s.key], vb = b[s.key];
      if (s.key === 'amount') { va = +va; vb = +vb; }
      else { va = String(va || '').toLowerCase(); vb = String(vb || '').toLowerCase(); }
      if (va < vb) return s.dir === 'asc' ? -1 : 1;
      if (va > vb) return s.dir === 'asc' ? 1 : -1;
      return 0;
    });
    const total = rows.length;
    const totalAmt = rows.reduce((a, r) => a + r.amount, 0);
    $('#txnCountLabel').innerHTML = `${total.toLocaleString('en-IN')} transactions · <strong style="color:var(--text)">${fmtINR(totalAmt)}</strong>`;

    const pageSize = state.txn.pageSize;
    const pages = Math.max(1, Math.ceil(total / pageSize));
    if (state.txn.page > pages) state.txn.page = pages;
    const start = (state.txn.page - 1) * pageSize;
    const slice = rows.slice(start, start + pageSize);

    $('#txnTable tbody').innerHTML = slice.length
      ? slice.map(t => txnRow(t)).join('')
      : `<tr><td colspan="5"><div class="empty"><strong>No matches</strong>Clear filters to see all transactions.</div></td></tr>`;

    $$('#txnTable thead th').forEach(th => {
      th.classList.remove('is-sorted', 'desc');
      if (th.dataset.sort === s.key) { th.classList.add('is-sorted'); if (s.dir === 'desc') th.classList.add('desc'); }
    });

    $('#pagerInfo').textContent = total
      ? `${(start + 1).toLocaleString('en-IN')}–${Math.min(start + pageSize, total).toLocaleString('en-IN')} of ${total.toLocaleString('en-IN')}`
      : 'No results';
    $('#pagerPrev').disabled = state.txn.page <= 1;
    $('#pagerNext').disabled = state.txn.page >= pages;
  }

  /* ---------- Schedules ---------- */
  const SCHEDULES = [
    { key: 'conso',         label: 'Consolidated' },
    { key: 'fundPlan',      label: 'Fund Plan' },
    { key: 'finalSheet',    label: 'Final Sheet' },
    { key: 'esafDetail',    label: 'ESAF Detail' },
    { key: 'advCommission', label: 'Adv Commission' },
    { key: 'planSummary',   label: 'Plan Summary' }
  ];

  const isEmptyCell = (v) => v === null || v === undefined || (typeof v === 'string' && v.trim() === '');
  const nonEmptyCount = (row) => Array.isArray(row) ? row.filter(c => !isEmptyCell(c)).length : 0;
  const isExcelDate = (v) => typeof v === 'number' && v >= 40000 && v <= 60000 && Number.isFinite(v);
  const excelToDate = (v) => {
    const ms = Math.round((v - 25569) * 86400 * 1000);
    const d = new Date(ms);
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' });
  };
  const fmtCell = (v) => {
    if (isEmptyCell(v)) return '';
    if (typeof v === 'number') {
      if (isExcelDate(v)) return excelToDate(v);
      if (Math.abs(v) >= 1000) return v.toLocaleString('en-IN', { maximumFractionDigits: 2 });
      if (!Number.isInteger(v)) return v.toFixed(2);
      return String(v);
    }
    return String(v);
  };
  const isNumericCell = (v) => typeof v === 'number' && !isExcelDate(v);

  function schedSheet(key) {
    const s = state.data.schedules && state.data.schedules[key];
    if (s && Array.isArray(s.columns) && Array.isArray(s.rows)) return s;
    // Fallback: raw rows-array from march.json, synthesised into the same shape.
    const arr = state.data[key];
    if (!Array.isArray(arr)) return null;
    const rows = arr.filter(r => Array.isArray(r) && nonEmptyCount(r) > 0);
    if (!rows.length) return { label: key, columns: [], rows: [] };
    const maxLen = rows.reduce((m, r) => Math.max(m, r.length), 0);
    let a = 0; while (a < maxLen && rows.every(r => isEmptyCell(r[a]))) a++;
    let b = maxLen - 1; while (b > a && rows.every(r => isEmptyCell(r[b]))) b--;
    let headerIdx = rows.findIndex(r => nonEmptyCount(r) >= 2); if (headerIdx < 0) headerIdx = 0;
    const hdr = rows[headerIdx] || [];
    const body = rows.filter((_, i) => i !== headerIdx);
    const columns = [];
    for (let c = a; c <= b; c++) {
      let num = 0, nonEmpty = 0;
      body.forEach(r => { const v = r[c]; if (!isEmptyCell(v)) { nonEmpty++; if (isNumericCell(v)) num++; } });
      const isNumeric = nonEmpty > 0 && num / nonEmpty >= 0.6;
      columns.push({ key: 'c' + c, label: fmtCell(hdr[c]) || '', align: isNumeric ? 'right' : 'left', isNumeric, isDate: false });
    }
    const rowsOut = body.map(r => {
      if (nonEmptyCount(r) === 1) {
        return { _type: 'section', label: fmtCell(r.find(c => !isEmptyCell(c))) };
      }
      const o = { _type: 'data' };
      for (let c = a; c <= b; c++) o['c' + c] = r[c];
      return o;
    });
    return { label: key, columns, rows: rowsOut };
  }

  function setupSchedules() {
    const list = $('#schedList');
    if (!list) return;
    list.innerHTML = SCHEDULES.map((s, i) => {
      const sheet = schedSheet(s.key);
      const rc = sheet ? sheet.rows.length : 0;
      return `<button class="sidelist__item" role="option" data-key="${s.key}" aria-selected="false">
        <span class="sidelist__name">${esc(sheet?.label || s.label)}</span>
        <span class="sidelist__amt">${rc}</span>
        <span class="sidelist__meta">${String(i + 1).padStart(2, '0')} · ${rc} rows</span>
      </button>`;
    }).join('');
    list.addEventListener('click', (e) => {
      const b = e.target.closest('.sidelist__item'); if (b) selectSchedule(b.dataset.key);
    });
  }

  function selectSchedule(key) {
    state.schedule = key;
    $$('#schedList .sidelist__item').forEach(i => i.setAttribute('aria-selected', i.dataset.key === key ? 'true' : 'false'));
    const sheet = schedSheet(key);
    const idx = SCHEDULES.findIndex(s => s.key === key);
    const label = sheet?.label || SCHEDULES[idx]?.label || key;
    $('#schedIdx').textContent = String(idx + 1).padStart(2, '0') + ' · Sheet';
    $('#schedTitle').textContent = label;
    $('#schedMeta').innerHTML = `<strong style="color:var(--text)">${sheet ? sheet.rows.length : 0}</strong> rows`;
    renderScheduleTable(sheet);
  }

  function renderScheduleTable(sheet) {
    const thead = document.querySelector('#schedTable thead tr');
    const tbody = document.querySelector('#schedTable tbody');
    if (!thead || !tbody) return;

    if (!sheet || !sheet.columns.length || !sheet.rows.length) {
      thead.innerHTML = '';
      tbody.innerHTML = `<tr><td><div class="empty"><strong>Empty sheet</strong>No data to display.</div></td></tr>`;
      return;
    }

    const cols = sheet.columns;
    const colCount = cols.length;

    thead.innerHTML = cols.map(c => {
      const cls = c.align === 'right' ? ' class="num"' : '';
      return `<th${cls}>${esc(c.label || '')}</th>`;
    }).join('');

    tbody.innerHTML = sheet.rows.map(r => {
      if (r._type === 'section') {
        return `<tr class="sheet-subhead"><td colspan="${colCount}">${esc(r.label || '')}</td></tr>`;
      }
      const rowCls = r._type === 'total' ? ' class="sheet-total"' : '';
      const cells = cols.map(c => {
        const v = r[c.key];
        const right = c.align === 'right';
        const isNum = right && typeof v === 'number';
        const cls = isNum ? ' class="num mono"' : (right ? ' class="num"' : '');
        return `<td${cls}>${esc(fmtCell(v))}</td>`;
      }).join('');
      return `<tr${rowCls}>${cells}</tr>`;
    }).join('');
  }

  /* ---------- Palette ---------- */
  function setupPalette() {
    $('#openSearch').addEventListener('click', openPalette);
    $$('#palette [data-close]').forEach(el => el.addEventListener('click', closePalette));
    const input = $('#paletteInput');
    input.addEventListener('input', updatePaletteResults);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); state.palette.idx = Math.min(state.palette.results.length - 1, state.palette.idx + 1); renderPaletteResults(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); state.palette.idx = Math.max(0, state.palette.idx - 1); renderPaletteResults(); }
      else if (e.key === 'Enter') { e.preventDefault(); activatePaletteResult(state.palette.idx); }
    });
  }
  function openPalette() {
    $('#palette').hidden = false;
    state.palette.open = true;
    state.palette.idx = 0;
    $('#paletteInput').value = '';
    updatePaletteResults();
    setTimeout(() => $('#paletteInput').focus(), 10);
  }
  function closePalette() { $('#palette').hidden = true; state.palette.open = false; }

  function updatePaletteResults() {
    const q = $('#paletteInput').value.toLowerCase().trim();
    let results = [];
    if (!q) {
      results = [
        ...state.data.categoryTotals.slice(0, 3).map(c => ({ kind: 'CAT', label: c.category, meta: `${c.count} txns`, amt: fmtCompact(c.amount), target: { type: 'category', key: c.category } })),
        ...state.data.bankTotals.slice(0, 3).map(b => ({ kind: 'BANK', label: b.bank, meta: `${b.count} txns`, amt: fmtCompact(b.amount), target: { type: 'bank', key: b.bank } })),
        ...[...state.data.transactions].sort((a, b) => b.amount - a.amount).slice(0, 4)
          .map(t => ({ kind: 'TXN', label: truncate(t.particulars, 70), meta: `${fmtDate(t.date)} · ${truncate(t.bank, 20)}`, amt: fmtINR(t.amount), target: { type: 'txn', id: t.id } }))
      ];
    } else {
      const c = state.data.categoryTotals.filter(c => c.category.toLowerCase().includes(q))
        .map(c => ({ kind: 'CAT', label: c.category, meta: `${c.count} txns`, amt: fmtCompact(c.amount), target: { type: 'category', key: c.category } }));
      const b = state.data.bankTotals.filter(b => b.bank.toLowerCase().includes(q))
        .map(b => ({ kind: 'BANK', label: b.bank, meta: `${b.count} txns`, amt: fmtCompact(b.amount), target: { type: 'bank', key: b.bank } }));
      const t = state.data.transactions
        .filter(t => (t.particulars + ' ' + t.bank + ' ' + (t.category || '')).toLowerCase().includes(q))
        .slice(0, 20)
        .map(t => ({ kind: 'TXN', label: truncate(t.particulars, 70), meta: `${fmtDate(t.date)} · ${truncate(t.bank, 20)}`, amt: fmtINR(t.amount), target: { type: 'txn', id: t.id } }));
      results = [...c.slice(0, 4), ...b.slice(0, 4), ...t];
    }
    state.palette.results = results;
    state.palette.idx = 0;
    renderPaletteResults();
  }

  function renderPaletteResults() {
    const ul = $('#paletteResults');
    if (!state.palette.results.length) { ul.innerHTML = `<li class="empty">No matches.</li>`; return; }
    ul.innerHTML = state.palette.results.map((r, i) => `
      <li class="palette__result" role="option" data-idx="${i}" aria-selected="${i === state.palette.idx}">
        <span class="palette__kind">${r.kind}</span>
        <span class="palette__title">${esc(r.label)}</span>
        <span class="palette__amt">${r.amt}</span>
        <span class="palette__meta">${esc(r.meta)}</span>
      </li>`).join('');
    $$('.palette__result', ul).forEach(el => {
      el.addEventListener('mouseenter', () => { state.palette.idx = +el.dataset.idx; renderPaletteResults(); });
      el.addEventListener('click', () => activatePaletteResult(+el.dataset.idx));
    });
    const active = ul.querySelector('[aria-selected="true"]');
    if (active) active.scrollIntoView({ block: 'nearest' });
  }

  function activatePaletteResult(i) {
    const r = state.palette.results[i];
    if (!r) return;
    closePalette();
    if (r.target.type === 'category') { selectCategory(r.target.key); go('categories'); }
    else if (r.target.type === 'bank') { selectBank(r.target.key); go('banks'); }
    else if (r.target.type === 'txn') {
      const t = state.data.transactions.find(x => x.id === r.target.id);
      if (t) { selectDay(t.date); go('daily'); setTimeout(() => highlight(t.id), 60); }
    }
  }

  function highlight(id) {
    const row = document.querySelector(`#dayTable tr[data-id="${id}"]`);
    if (!row) return;
    row.scrollIntoView({ block: 'center', behavior: 'smooth' });
    row.style.transition = 'background-color 600ms ease';
    row.style.backgroundColor = 'rgba(79,70,229,0.12)';
    setTimeout(() => row.style.backgroundColor = '', 1400);
  }

  /* ---------- Help & Keyboard ---------- */
  function setupHelp() {
    $('#openHelp').addEventListener('click', () => $('#help').hidden = false);
    $$('#help [data-close]').forEach(el => el.addEventListener('click', () => $('#help').hidden = true));
  }

  function setupKeyboard() {
    window.addEventListener('keydown', (e) => {
      const tag = (e.target.tagName || '').toLowerCase();
      const inField = tag === 'input' || tag === 'textarea' || tag === 'select';
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openPalette(); return; }
      if (e.key === 'Escape') {
        if (state.palette.open) closePalette();
        if (!$('#help').hidden) $('#help').hidden = true;
        return;
      }
      if (inField) return;
      if (e.key === '?') { e.preventDefault(); $('#help').hidden = false; return; }
      if (e.key === 'g') { state.keyBuf = 'g'; setTimeout(() => { if (state.keyBuf === 'g') state.keyBuf = ''; }, 900); return; }
      if (state.keyBuf === 'g') {
        const map = { o: 'overview', d: 'daily', c: 'categories', b: 'banks', t: 'transactions', s: 'schedules' };
        const r = map[e.key.toLowerCase()];
        if (r) { go(r); state.keyBuf = ''; e.preventDefault(); }
      }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
