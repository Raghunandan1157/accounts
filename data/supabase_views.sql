-- Supabase views & RPC for CEO dashboard
-- Run after supabase_schema.sql + seed.sql

-- Daily summary: one row per day with category breakdown as jsonb
create or replace view v_daily_summary as
select
  txn_date,
  extract(day from txn_date)::int as day,
  count(*)::int as txn_count,
  coalesce(sum(amount), 0)::numeric(16,2) as total,
  coalesce(
    jsonb_object_agg(category, cat_total)
      filter (where category is not null),
    '{}'::jsonb
  ) as by_category
from (
  select
    txn_date,
    category,
    sum(amount) as cat_total
  from transactions
  group by txn_date, category
) t
group by txn_date;

-- Category totals across the month
create or replace view v_category_totals as
select
  coalesce(category, 'Uncategorized') as category,
  count(*)::int as txn_count,
  coalesce(sum(amount), 0)::numeric(16,2) as total,
  round(
    100.0 * sum(amount) / nullif((select sum(amount) from transactions), 0),
    2
  ) as share_pct
from transactions
group by category
order by total desc;

-- Bank totals across the month
create or replace view v_bank_totals as
select
  bank,
  count(*)::int as txn_count,
  coalesce(sum(amount), 0)::numeric(16,2) as total,
  round(
    100.0 * sum(amount) / nullif((select sum(amount) from transactions), 0),
    2
  ) as share_pct
from transactions
group by bank
order by total desc;

-- All uncategorized transactions (CEO review surface)
create or replace view v_uncategorized as
select
  id,
  txn_date,
  day,
  bank,
  particulars,
  amount
from transactions
where category is null or category = 'Uncategorized'
order by amount desc;

-- Full-text search index on particulars
create index if not exists idx_txn_particulars_fts
  on transactions
  using gin (to_tsvector('simple', coalesce(particulars, '')));

-- RPC: full-text search across transaction particulars
create or replace function search_transactions(query text)
returns table (
  id bigint,
  txn_date date,
  day int,
  bank text,
  particulars text,
  amount numeric,
  category text,
  rank real
)
language sql
stable
as $$
  select
    t.id,
    t.txn_date,
    t.day,
    t.bank,
    t.particulars,
    t.amount,
    t.category,
    ts_rank(
      to_tsvector('simple', coalesce(t.particulars, '')),
      plainto_tsquery('simple', query)
    ) as rank
  from transactions t
  where to_tsvector('simple', coalesce(t.particulars, ''))
        @@ plainto_tsquery('simple', query)
  order by rank desc, t.amount desc
  limit 200;
$$;
