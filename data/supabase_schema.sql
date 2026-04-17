create table if not exists transactions (
  id bigserial primary key,
  txn_date date not null,
  day int not null,
  bank text not null,
  particulars text,
  amount numeric(14,2) not null default 0,
  category text,
  created_at timestamptz default now()
);
create index if not exists idx_txn_date on transactions(txn_date);
create index if not exists idx_txn_bank on transactions(bank);
create index if not exists idx_txn_category on transactions(category);
