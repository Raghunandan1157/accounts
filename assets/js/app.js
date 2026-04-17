/* Dashboard app: routing, state, interactions, search. */
(function () {
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

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
  const dow = (iso) => new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short' });

  function pillClass(cat) {
    const key = (cat || '').toLowerCase();
    if (!cat || key === 'uncategorized') return 'pill pill--uncat';
    if (key === 'bc') return 'pill pill--cat-bc';
    if (key === 'fund transfer') return 'pill pill--cat-ft';
    if (key === 'hr dept') return 'pill pill--cat-hr';
    if (key === 'bank repayment') return 'pill pill--cat-br';
    return 'pill';
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /* ---------- Init ---------- */
  async function init() {
    try {
      state.data = await window.DataLoader.load();
    } catch (err) {
      console.error(err);
      document.body.innerHTML = `<div class="empty" style="padding:80px"><strong>Could not load data</strong>${err.message}</div>`;
      return;
    }
    $('#brand-period').textContent = state.data.month;
    renderOverview();
    setupRouting();
    setupCalendar();
    setupCategoriesList();
    setupBanksList();
    setupTransactions();
    setupPalette();
    setupKeyboard();
    setupHelp();
    setupDQBanner();
    const hash = location.hash.replace('#', '') || 'overview';
    go(hash);
  }

  /* ---------- Overview ---------- */
  function renderOverview() {
    const { summary, categoryTotals, bankTotals, dailyTotals, transactions } = state.data;
    const kpis = [
      { label: 'Total Payments', value: fmtINR(summary.totalPayments), sub: 'March 2026', hero: true },
      { label: 'Transactions', value: summary.transactionCount.toLocaleString('en-IN'), sub: `${summary.bankCount} accounts` },
      { label: 'Active Days', value: summary.daysWithActivity + ' / 31', sub: 'days with activity' },
      { label: 'Top Category', value: summary.topCategory, sub: fmtCompact(categoryTotals[0]?.amount) + ' • ' + (categoryTotals[0]?.count || 0) + ' txns' },
      { label: 'Top Bank', value: truncate(summary.topBank, 22), sub: fmtCompact(bankTotals[0]?.amount) + ' • ' + (bankTotals[0]?.count || 0) + ' txns' }
    ];
    $('#kpiGrid').innerHTML = kpis.map(k =>
      `<div class="kpi ${k.hero ? 'kpi--hero' : ''}">
        <div class="kpi__label">${escapeHtml(k.label)}</div>
        <div class="kpi__value" title="${escapeHtml(k.value)}">${escapeHtml(k.value)}</div>
        <div class="kpi__sub">${escapeHtml(k.sub)}</div>
      </div>`).join('');

    $('#catCount').textContent = `${categoryTotals.length} categories`;
    $('#bankCount').textContent = `${bankTotals.length} accounts`;

    // Data-quality banner
    const uncat = categoryTotals.find(c => c.category === 'Uncategorized');
    if (uncat) {
      const pct = ((uncat.count / summary.transactionCount) * 100).toFixed(1);
      $('#dqCount').textContent = uncat.count;
      $('#dqPct').textContent = pct + '%';
      $('#dqAmt').textContent = fmtCompact(uncat.amount);
      $('#dqBanner').hidden = false;
    }

    // Charts
    window.Charts.category($('#chartCategory'), categoryTotals);
    window.Charts.daily($('#chartDaily'), dailyTotals);
    window.Charts.banks($('#chartBanks'), bankTotals, 10);

    // Top 10
    const top = [...transactions].sort((a, b) => b.amount - a.amount).slice(0, 10);
    $('#topTxnTable tbody').innerHTML = top.map(t => txnRow(t, { showDate: true, showBank: true, showCategory: true })).join('');
  }

  function truncate(s, n) { s = s || ''; return s.length > n ? s.slice(0, n - 1) + '…' : s; }

  function txnRow(t, opts = {}) {
    const particulars = `<div class="particulars">${escapeHtml(truncate(t.particulars, 140))}</div>`;
    return `<tr data-id="${t.id}">
      ${opts.showDate !== false ? `<td>${fmtDate(t.date)}</td>` : ''}
      <td>${particulars}</td>
      ${opts.showBank !== false ? `<td><span class="pill">${escapeHtml(truncate(t.bank, 28))}</span></td>` : ''}
      ${opts.showCategory !== false ? `<td><span class="${pillClass(t.category)}">${escapeHtml(t.category || 'Uncategorized')}</span></td>` : ''}
      <td class="num">${fmtINR(t.amount)}</td>
    </tr>`;
  }

  /* ---------- Routing ---------- */
  function setupRouting() {
    $$('.tab').forEach(btn => btn.addEventListener('click', () => go(btn.dataset.route)));
    window.addEventListener('hashchange', () => go(location.hash.replace('#', '') || 'overview'));
  }
  function go(route) {
    if (!['overview', 'daily', 'categories', 'banks', 'transactions'].includes(route)) route = 'overview';
    state.route = route;
    location.hash = route;
    $$('.tab').forEach(t => t.setAttribute('aria-selected', t.dataset.route === route ? 'true' : 'false'));
    $$('.view').forEach(v => v.hidden = v.dataset.view !== route);
    if (route === 'daily' && state.day == null) selectDay(state.data.dailyTotals[0].date);
    if (route === 'categories' && !state.category) selectCategory(state.data.categoryTotals[0].category);
    if (route === 'banks' && !state.bank) selectBank(state.data.bankTotals[0].bank);
    if (route === 'transactions') renderTxnTable();
  }

  /* ---------- Daily ---------- */
  function setupCalendar() {
    const strip = $('#calendarStrip');
    const dailies = state.data.dailyTotals;
    const max = Math.max(...dailies.map(d => d.total));
    strip.innerHTML = dailies.map(d => {
      const w = max ? Math.round((d.total / max) * 100) : 0;
      return `<button class="day-pill" role="tab" data-date="${d.date}" aria-selected="false">
        <span class="day-pill__dow">${dow(d.date)}</span>
        <span class="day-pill__num">${d.day}</span>
        <span class="day-pill__amt">${fmtCompact(d.total)}</span>
        <span class="day-pill__bar" style="--w:${w}%"></span>
      </button>`;
    }).join('');
    strip.addEventListener('click', (e) => {
      const btn = e.target.closest('.day-pill');
      if (btn) selectDay(btn.dataset.date);
    });
    $('#dayFilter').addEventListener('input', () => renderDayTable());
  }

  function selectDay(date) {
    state.day = date;
    $$('#calendarStrip .day-pill').forEach(p => p.setAttribute('aria-selected', p.dataset.date === date ? 'true' : 'false'));
    const d = state.data.dailyTotals.find(x => x.date === date);
    $('#dayTitle').textContent = `Transactions — ${new Date(date + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'long' })}`;
    const topCats = Object.entries(d.byCategory || {}).sort((a, b) => b[1] - a[1]).slice(0, 3)
      .map(([k, v]) => `${k} ${fmtCompact(v)}`).join(' • ') || '—';
    $('#daySummary').innerHTML = `
      <div class="kpi"><div class="kpi__label">Day Total</div><div class="kpi__value">${fmtINR(d.total)}</div><div class="kpi__sub">${dow(date)} · ${new Date(date + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</div></div>
      <div class="kpi"><div class="kpi__label">Transactions</div><div class="kpi__value">${d.count}</div><div class="kpi__sub">&nbsp;</div></div>
      <div class="kpi"><div class="kpi__label">Top Buckets</div><div class="kpi__value" style="font-size:14px;font-weight:500;line-height:1.4">${escapeHtml(topCats)}</div><div class="kpi__sub">by amount</div></div>
    `;
    renderDayTable();
  }

  function renderDayTable() {
    const q = ($('#dayFilter').value || '').toLowerCase().trim();
    const rows = state.data.transactions.filter(t => t.date === state.day)
      .filter(t => !q || (t.particulars + ' ' + t.bank + ' ' + (t.category || '')).toLowerCase().includes(q))
      .sort((a, b) => b.amount - a.amount);
    const tbody = $('#dayTable tbody');
    tbody.innerHTML = rows.length ? rows.map(t => txnRow(t)).join('')
      : `<tr><td colspan="5"><div class="empty"><strong>No transactions</strong>${q ? 'Try a different filter.' : 'No activity on this day.'}</div></td></tr>`;
  }

  /* ---------- Categories ---------- */
  function setupCategoriesList() {
    const cats = state.data.categoryTotals;
    const list = $('#categoryList');
    list.innerHTML = cats.map(c => {
      const spark = buildSpark(c.category, 'category');
      return `<button class="list-item" role="option" data-key="${escapeHtml(c.category)}" aria-selected="false">
        <span class="list-item__name">${escapeHtml(c.category)}</span>
        <span class="list-item__amt">${fmtCompact(c.amount)}</span>
        <span class="list-item__meta"><span>${c.count} txns</span><span>${((c.amount / state.data.summary.totalPayments) * 100).toFixed(1)}%</span></span>
        <span class="list-item__spark">${spark}</span>
      </button>`;
    }).join('');
    list.addEventListener('click', (e) => {
      const btn = e.target.closest('.list-item');
      if (btn) selectCategory(btn.dataset.key);
    });
    $('#categoryFilter').addEventListener('input', renderCategoryTable);
  }

  function buildSpark(key, kind) {
    const daily = state.data.dailyTotals;
    const bars = daily.map(d => {
      let v = 0;
      if (kind === 'category') v = (d.byCategory && d.byCategory[key]) || 0;
      return v;
    });
    const max = Math.max(...bars) || 1;
    return `<div class="spark" aria-hidden="true">${bars.map(b => `<span style="height:${Math.max(1, (b / max) * 18)}px"></span>`).join('')}</div>`;
  }

  function selectCategory(cat) {
    state.category = cat;
    $$('#categoryList .list-item').forEach(i => i.setAttribute('aria-selected', i.dataset.key === cat ? 'true' : 'false'));
    const total = state.data.categoryTotals.find(c => c.category === cat);
    $('#categoryDetailTitle').textContent = cat;
    $('#categoryDetailMeta').textContent = `${fmtINR(total?.amount || 0)} · ${total?.count || 0} transactions`;
    const labels = state.data.dailyTotals.map(d => d.day);
    const values = state.data.dailyTotals.map(d => (d.byCategory && d.byCategory[cat]) || 0);
    window.Charts.dayTrend($('#chartCategoryTrend'), labels, values, 'categoryTrend');
    renderCategoryTable();
  }

  function renderCategoryTable() {
    const q = ($('#categoryFilter').value || '').toLowerCase().trim();
    const rows = state.data.transactions
      .filter(t => (t.category || 'Uncategorized') === state.category)
      .filter(t => !q || (t.particulars + ' ' + t.bank).toLowerCase().includes(q))
      .sort((a, b) => b.amount - a.amount);
    $('#categoryTable tbody').innerHTML = rows.length
      ? rows.map(t => `<tr><td>${fmtDate(t.date)}</td><td><div class="particulars">${escapeHtml(truncate(t.particulars, 140))}</div></td><td><span class="pill">${escapeHtml(truncate(t.bank, 28))}</span></td><td class="num">${fmtINR(t.amount)}</td></tr>`).join('')
      : `<tr><td colspan="4"><div class="empty"><strong>No transactions</strong></div></td></tr>`;
  }

  /* ---------- Banks ---------- */
  function setupBanksList() {
    const banks = state.data.bankTotals;
    const list = $('#bankList');
    list.innerHTML = banks.map(b => {
      return `<button class="list-item" role="option" data-key="${escapeHtml(b.bank)}" aria-selected="false">
        <span class="list-item__name">${escapeHtml(b.bank)}</span>
        <span class="list-item__amt">${fmtCompact(b.amount)}</span>
        <span class="list-item__meta"><span>${b.count} txns</span><span>${((b.amount / state.data.summary.totalPayments) * 100).toFixed(1)}%</span></span>
      </button>`;
    }).join('');
    list.addEventListener('click', (e) => {
      const btn = e.target.closest('.list-item');
      if (btn) selectBank(btn.dataset.key);
    });
    $('#bankFilter').addEventListener('input', renderBankTable);
  }

  function selectBank(bank) {
    state.bank = bank;
    $$('#bankList .list-item').forEach(i => i.setAttribute('aria-selected', i.dataset.key === bank ? 'true' : 'false'));
    const total = state.data.bankTotals.find(b => b.bank === bank);
    $('#bankDetailTitle').textContent = bank;
    $('#bankDetailMeta').textContent = `${fmtINR(total?.amount || 0)} · ${total?.count || 0} transactions`;

    // Build daywise totals for this bank from transactions
    const byDay = {};
    state.data.transactions.forEach(t => { if (t.bank === bank) byDay[t.date] = (byDay[t.date] || 0) + t.amount; });
    const labels = state.data.dailyTotals.map(d => d.day);
    const values = state.data.dailyTotals.map(d => byDay[d.date] || 0);
    window.Charts.dayTrend($('#chartBankTrend'), labels, values, 'bankTrend');
    renderBankTable();
  }

  function renderBankTable() {
    const q = ($('#bankFilter').value || '').toLowerCase().trim();
    const rows = state.data.transactions.filter(t => t.bank === state.bank)
      .filter(t => !q || (t.particulars + ' ' + (t.category || '')).toLowerCase().includes(q))
      .sort((a, b) => b.amount - a.amount);
    $('#bankTable tbody').innerHTML = rows.length
      ? rows.map(t => `<tr><td>${fmtDate(t.date)}</td><td><div class="particulars">${escapeHtml(truncate(t.particulars, 140))}</div></td><td><span class="${pillClass(t.category)}">${escapeHtml(t.category || 'Uncategorized')}</span></td><td class="num">${fmtINR(t.amount)}</td></tr>`).join('')
      : `<tr><td colspan="4"><div class="empty"><strong>No transactions</strong></div></td></tr>`;
  }

  /* ---------- Transactions (global) ---------- */
  function setupTransactions() {
    const banks = state.data.bankTotals.map(b => b.bank);
    const cats = state.data.categoryTotals.map(c => c.category);
    $('#txnBank').innerHTML = `<option value="">All banks</option>` + banks.map(b => `<option>${escapeHtml(b)}</option>`).join('');
    $('#txnCategory').innerHTML = `<option value="">All categories</option>` + cats.map(c => `<option>${escapeHtml(c)}</option>`).join('');

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

  function applyTxnFilters() {
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
    const rows = applyTxnFilters();
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
    $('#txnCountLabel').textContent = `${total.toLocaleString('en-IN')} transactions · ${fmtINR(totalAmt)}`;

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
      ? `Showing ${start + 1}–${Math.min(start + pageSize, total)} of ${total.toLocaleString('en-IN')}`
      : 'No results';
    $('#pagerPrev').disabled = state.txn.page <= 1;
    $('#pagerNext').disabled = state.txn.page >= pages;
  }

  /* ---------- DQ banner ---------- */
  function setupDQBanner() {
    $('#dqBanner').addEventListener('click', (e) => {
      if (e.target.matches('[data-goto]') || e.currentTarget === e.target || e.target.closest('.dq-banner__cta')) {
        $('#txnCategory').value = 'Uncategorized';
        $('#txnCategory').dispatchEvent(new Event('input', { bubbles: true }));
        go('transactions');
      }
    });
  }

  /* ---------- Command palette ---------- */
  function setupPalette() {
    $('#openSearch').addEventListener('click', () => openPalette());
    $$('#palette [data-close]').forEach(el => el.addEventListener('click', closePalette));
    $('#paletteInput').addEventListener('input', updatePaletteResults);
    $('#paletteInput').addEventListener('keydown', (e) => {
      const results = state.palette.results;
      if (e.key === 'ArrowDown') { e.preventDefault(); state.palette.idx = Math.min(results.length - 1, state.palette.idx + 1); renderPaletteResults(); }
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
        ...state.data.categoryTotals.slice(0, 3).map(c => ({ kind: 'category', label: c.category, meta: `${c.count} txns`, amt: fmtCompact(c.amount), target: { type: 'category', key: c.category } })),
        ...state.data.bankTotals.slice(0, 3).map(b => ({ kind: 'bank', label: b.bank, meta: `${b.count} txns`, amt: fmtCompact(b.amount), target: { type: 'bank', key: b.bank } })),
        ...[...state.data.transactions].sort((a, b) => b.amount - a.amount).slice(0, 4)
          .map(t => ({ kind: 'txn', label: truncate(t.particulars, 70), meta: `${fmtDate(t.date)} · ${truncate(t.bank, 20)}`, amt: fmtINR(t.amount), target: { type: 'txn', id: t.id } }))
      ];
    } else {
      const matchCats = state.data.categoryTotals.filter(c => c.category.toLowerCase().includes(q))
        .map(c => ({ kind: 'category', label: c.category, meta: `${c.count} txns`, amt: fmtCompact(c.amount), target: { type: 'category', key: c.category } }));
      const matchBanks = state.data.bankTotals.filter(b => b.bank.toLowerCase().includes(q))
        .map(b => ({ kind: 'bank', label: b.bank, meta: `${b.count} txns`, amt: fmtCompact(b.amount), target: { type: 'bank', key: b.bank } }));
      const matchTxns = state.data.transactions
        .filter(t => (t.particulars + ' ' + t.bank + ' ' + (t.category || '')).toLowerCase().includes(q))
        .slice(0, 20)
        .map(t => ({ kind: 'txn', label: truncate(t.particulars, 70), meta: `${fmtDate(t.date)} · ${truncate(t.bank, 20)}`, amt: fmtINR(t.amount), target: { type: 'txn', id: t.id } }));
      results = [...matchCats.slice(0, 4), ...matchBanks.slice(0, 4), ...matchTxns];
    }
    state.palette.results = results;
    state.palette.idx = 0;
    renderPaletteResults();
  }

  function renderPaletteResults() {
    const ul = $('#paletteResults');
    if (!state.palette.results.length) { ul.innerHTML = `<li class="empty" style="padding:24px 12px">No matches.</li>`; return; }
    ul.innerHTML = state.palette.results.map((r, i) => `
      <li class="palette__result" data-idx="${i}" role="option" aria-selected="${i === state.palette.idx}">
        <span class="palette__result__title">${escapeHtml(r.label)} <span class="kind" style="color:var(--text-faint);font-size:11px;margin-left:6px">${r.kind}</span></span>
        <span class="palette__result__amt">${r.amt}</span>
        <span class="palette__result__meta">${escapeHtml(r.meta)}</span>
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
      if (t) { selectDay(t.date); go('daily'); setTimeout(() => highlightRow(t.id), 60); }
    }
  }

  function highlightRow(id) {
    const row = document.querySelector(`#dayTable tr[data-id="${id}"]`);
    if (!row) return;
    row.scrollIntoView({ block: 'center', behavior: 'smooth' });
    row.style.transition = 'background .6s ease';
    row.style.background = 'rgba(212,168,87,.18)';
    setTimeout(() => row.style.background = '', 1400);
  }

  /* ---------- Help ---------- */
  function setupHelp() {
    $('#openHelp').addEventListener('click', openHelp);
    $$('#help [data-close]').forEach(el => el.addEventListener('click', closeHelp));
  }
  function openHelp() { $('#help').hidden = false; }
  function closeHelp() { $('#help').hidden = true; }

  /* ---------- Keyboard ---------- */
  function setupKeyboard() {
    window.addEventListener('keydown', (e) => {
      const tag = (e.target.tagName || '').toLowerCase();
      const inField = tag === 'input' || tag === 'textarea' || tag === 'select';

      // Cmd/Ctrl+K
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault(); openPalette(); return;
      }
      // Esc closes overlays
      if (e.key === 'Escape') {
        if (state.palette.open) closePalette();
        if (!$('#help').hidden) closeHelp();
        return;
      }
      if (inField) return;
      if (e.key === '?') { e.preventDefault(); openHelp(); return; }

      // g-prefix shortcuts
      if (e.key === 'g') { state.keyBuf = 'g'; setTimeout(() => { if (state.keyBuf === 'g') state.keyBuf = ''; }, 900); return; }
      if (state.keyBuf === 'g') {
        const map = { o: 'overview', d: 'daily', c: 'categories', b: 'banks', t: 'transactions' };
        const r = map[e.key.toLowerCase()];
        if (r) { go(r); state.keyBuf = ''; e.preventDefault(); }
      }
    });
  }

  /* ---------- Boot ---------- */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
