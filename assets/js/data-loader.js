/* Loads data/march.json locally, or pulls from Supabase when window.SUPABASE_URL + window.SUPABASE_ANON_KEY are defined. */
(function () {
  const DataLoader = {
    async load() {
      let core;
      if (window.SUPABASE_URL && window.SUPABASE_ANON_KEY) {
        try { core = await this.fromSupabase(); }
        catch (err) { console.warn('Supabase fetch failed, falling back to march.json', err); }
      }
      if (!core) core = await this.fromJson();
      try {
        const r = await fetch('data/insights.json', { cache: 'no-cache' });
        if (r.ok) core.insights = await r.json();
      } catch (_) { /* insights are optional */ }
      try {
        const r = await fetch('data/schedules.json', { cache: 'no-cache' });
        if (r.ok) core.schedules = await r.json();
      } catch (_) { /* schedules are optional */ }
      return core;
    },

    async fromJson() {
      const res = await fetch('data/march.json', { cache: 'no-cache' });
      if (!res.ok) throw new Error('Failed to load data/march.json: ' + res.status);
      return res.json();
    },

    async fromSupabase() {
      const base = window.SUPABASE_URL.replace(/\/+$/, '');
      const key = window.SUPABASE_ANON_KEY;
      const headers = { apikey: key, Authorization: 'Bearer ' + key };

      const [sRes, cRes, bRes, dRes, tRes] = await Promise.all([
        fetch(`${base}/rest/v1/march_summary?select=*&limit=1`, { headers }),
        fetch(`${base}/rest/v1/march_category_totals?select=*&order=amount.desc`, { headers }),
        fetch(`${base}/rest/v1/march_bank_totals?select=*&order=amount.desc`, { headers }),
        fetch(`${base}/rest/v1/march_daily_totals?select=*&order=date.asc`, { headers }),
        fetch(`${base}/rest/v1/march_transactions?select=*&order=id.asc`, { headers })
      ]);
      const [summaryArr, categoryTotals, bankTotals, dailyTotalsRaw, transactions] =
        await Promise.all([sRes.json(), cRes.json(), bRes.json(), dRes.json(), tRes.json()]);
      const dailyTotals = dailyTotalsRaw.map(d => ({
        ...d,
        byCategory: typeof d.byCategory === 'string' ? JSON.parse(d.byCategory) : (d.byCategory || {})
      }));
      return {
        month: 'March 2026',
        summary: summaryArr[0] || {},
        categoryTotals, bankTotals, dailyTotals, transactions
      };
    }
  };

  window.DataLoader = DataLoader;
})();
