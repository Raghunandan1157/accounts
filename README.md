# March 2026 Accounts — CEO Dashboard

An executive dashboard summarising the company's March 2026 bank payment
activity. The source is a 32-sheet Excel workbook (`sheet_full.xlsx`) covering
the monthly overview and per-day transaction detail for 01–31 March. The
workbook is parsed into structured JSON, surfaced through a static web
dashboard, and optionally persisted in Supabase for richer querying.

## At a glance

| Metric | Value |
| --- | --- |
| Month | March 2026 |
| Transactions | 1,049 |
| Total payments | ₹88,95,35,348.36 (~₹88.95 Cr) |
| Banks | 37 |
| Days with activity | 31 / 31 |
| Top category | BC (₹39.84 Cr, 44.8%) |
| Top bank | ESAF Small Finance Bank (₹29.90 Cr) |
| Uncategorized | 208 txns, ₹6.26 Cr (7.04%) — flagged for review |

## Tech stack

- **Frontend:** HTML, CSS, vanilla JavaScript, Chart.js
- **Data layer (optional):** Supabase (Postgres + REST + full-text search RPC)
- **Hosting:** Vercel (static)
- **Data pipeline:** Python 3 + openpyxl

## Repository layout

```
.
├── index.html                  # dashboard entry point
├── assets/                     # css, js, chart config
├── data/
│   ├── march.json              # full parsed dataset (source of truth for UI)
│   ├── insights.json           # CEO-level findings (top txns, anomalies, etc.)
│   ├── supabase_schema.sql     # transactions table + indexes
│   ├── supabase_views.sql      # views + search_transactions RPC
│   └── seed.sql                # 1,049 INSERT statements
├── parse_data.py               # xlsx -> data/march.json, schema.sql, seed.sql
├── generate_insights.py        # data/march.json -> data/insights.json
├── sheet_full.xlsx             # source workbook (input, not committed if large)
└── README.md
```

## Running locally

```bash
# open the dashboard
open index.html
```

No build step. `index.html` fetches `data/march.json` and
`data/insights.json` directly.

## Regenerating data

If the source workbook changes, re-run the pipeline:

```bash
pip3 install openpyxl
python3 parse_data.py          # rebuilds data/march.json, schema.sql, seed.sql
python3 generate_insights.py   # rebuilds data/insights.json
```

## Supabase setup

Run the SQL files in order via the Supabase SQL editor or `psql`:

```bash
psql "$SUPABASE_DB_URL" -f data/supabase_schema.sql
psql "$SUPABASE_DB_URL" -f data/seed.sql
psql "$SUPABASE_DB_URL" -f data/supabase_views.sql
```

This provisions:

- `transactions` — primary table
- `v_daily_summary`, `v_category_totals`, `v_bank_totals`, `v_uncategorized` — views
- `search_transactions(query text)` — full-text search RPC over particulars

## Deployment

- **Vercel:** `https://<project>.vercel.app` (set after first deploy)
- **Supabase project URL:** `https://<ref>.supabase.co`
- **Supabase anon key:** stored in Vercel env as `SUPABASE_ANON_KEY`

Environment variables expected by the frontend:

| Variable | Purpose |
| --- | --- |
| `SUPABASE_URL` | Supabase project REST endpoint |
| `SUPABASE_ANON_KEY` | Public anon key for read-only queries |

## Data model

Each transaction row contains: `id`, `txn_date`, `day`, `bank`, `particulars`,
`amount`, `category`. Categories are assigned by matching the first non-zero
category column in the source sheet (Fund Transfer, BC, Bank Repayment, Bank
charges, Admin Dept, HR Dept, IT Dept, Accounts, Finance Payments, MIS,
FLDG-ESAF, Short Term FD, Unplanned Payments); rows with an amount but no
category flag are tagged `Uncategorized`.

## Credits

Prepared for the CEO review cycle — March 2026 close.
