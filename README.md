# Accounts

A single-month treasury ledger for an NBFC. Static site. No framework.

March 2026 — ₹ 88.95 Cr of outflow across 1,049 transactions, 37 bank accounts, 31 active days.

## Stack

- Plain HTML/CSS/JS. Chart.js via CDN.
- `data/march.json` — canonical dataset (source of truth).
- `data/insights.json` — derived CEO insights (top-5, anomalies, concentration, weekly rhythm, uncategorized flag, extreme days).
- Supabase-ready: set `window.SUPABASE_URL` + `window.SUPABASE_ANON_KEY` and the loader reads from REST views instead.

## Run

```sh
python3 -m http.server 8765
# then open http://localhost:8765
```

`file://` will not work — the page fetches JSON, which requires an HTTP origin.

## Structure

```
index.html
assets/
  css/style.css        design tokens, layout, table, calendar, palette
  js/data-loader.js    march.json + insights.json loader (+ Supabase fallback)
  js/charts.js         Chart.js — single emerald series, thin gridlines, no legends
  js/app.js            routing, state, tables, filters, command palette, keyboard
data/
  march.json
  insights.json
  seed.sql             Supabase seed
  supabase_schema.sql  Supabase views used when SUPABASE_URL is set
```

## Design

Editorial finance: Bloomberg Terminal × Financial Times × Linear.

- Background `#0B0B0F` · surface `#14141A` · rule `#1D1D24` · strong rule `#2A2A32`.
- Text `#EDEDEE` / muted `#8B8B94` / faint `#5A5A62`.
- One signal color: emerald `#10B981`. Amber / rose only for caution and anomalies.
- **Fraunces** (display & section titles, tabular-nums) paired with **Inter** (UI/body) and **JetBrains Mono** (labels, column headers, keys).
- 240 px left rail navigation; 12-col stage; max width 1400 px.
- Thin hairline dividers instead of stacked card chrome.
- Tables: 44 px rows, 10 px uppercase mono column headers, sticky header, right-aligned numerics.
- Calendar: 7×5 grid, day number in Fraunces, outflow sparkbar at cell bottom.
- Hero number ₹88.95 Cr in 72 px Fraunces 300 weight, letter-spacing −.035em.

## Sections

1. **Overview** — hero total, 5-column stat strip, daily outflow line, category ledger, bank concentration bar, ten largest transactions, insights (weekly rhythm, concentration gauges, extreme days, top-5, anomalies, day-over-day jumps, uncategorized action callout).
2. **Daily** — 7×5 calendar, click a cell to drill into the day's transactions (filterable).
3. **Categories** — left list, detail shows daily trend + transactions.
4. **Banks** — left list, detail shows daily trend + transactions.
5. **Transactions** — full-text search, bank / category / date-range / amount filters, sortable columns, 50 / page pagination.

## Interactions

- `⌘K` / `Ctrl-K` — global search across transactions, banks, categories.
- `g o` Overview · `g d` Daily · `g c` Categories · `g b` Banks · `g t` Transactions.
- `?` help overlay · `esc` closes overlays.

## Data shape (march.json)

```
month, summary, categoryTotals[], bankTotals[],
dailyTotals[{date, day, total, count, byCategory}],
transactions[{id, date, day, bank, particulars, amount, category}]
```

## Supabase

Views expected: `march_summary`, `march_category_totals`, `march_bank_totals`, `march_daily_totals`, `march_transactions`. See `data/supabase_schema.sql`.
