import json, os
from collections import defaultdict
import xlrd

WB = xlrd.open_workbook('source.xls')

# Daily sheet column map (0-indexed)
# Row 2 is header, rows 3..N are bank rows, a later "Total" row marks end of bank block
RECEIPT_COLS = [
    (3, 'Collection Deposited'),
    (4, 'BC Commission'),
    (5, 'Bank Loan'),
    (6, 'Accounts (R)'),
    (7, 'HR (R)'),
    (8, 'Admin (R)'),
    (9, 'Unplanned Receipts'),
    (10, 'Fund Trs (R)'),
    (11, 'Suspense'),
]
PAYMENT_COLS = [
    (13, 'Fund Transfer'),
    (14, 'BC'),
    (15, 'Bank Repayment'),
    (16, 'Bank charges'),
    (17, 'Admin Dept'),
    (18, 'HR Dept'),
    (19, 'IT Dept'),
    (20, 'Accounts'),
    (21, 'Finance Payments'),
    (22, 'MIS'),
    (23, 'FLDG-ESAF'),
    (24, 'Short Term FD'),
    (25, 'Unplanned Payments'),
]
TOTAL_PAY_COL = 26

def n(v):
    if v in (None, ''): return 0.0
    try: return float(v)
    except Exception: return 0.0

def is_bank_row(row):
    bank = str(row[1]).strip() if len(row) > 1 else ''
    if not bank: return False
    low = bank.lower()
    if low in ('total', "bc's", 'bank name'): return False
    return True

def iter_bank_rows(sheet):
    """Yield bank rows from the top section only (stop at first Total row)."""
    for r in range(3, sheet.nrows):
        row = sheet.row_values(r)
        bank = str(row[1]).strip() if len(row) > 1 else ''
        if bank.lower() == 'total':
            return
        if is_bank_row(row):
            yield row

transactions = []
daily_totals = {}
tid = 0
discovered_cats = set()

for d in range(1, 32):
    name = str(d)
    if name not in WB.sheet_names(): continue
    ws = WB.sheet_by_name(name)
    date_str = f'2026-03-{d:02d}'
    day_total = 0.0
    day_count = 0
    by_cat = defaultdict(float)
    for row in iter_bank_rows(ws):
        bank = str(row[1]).strip()
        for idx, label in PAYMENT_COLS:
            if idx >= len(row): continue
            amt = n(row[idx])
            if amt <= 0: continue
            discovered_cats.add(label)
            tid += 1
            transactions.append({
                'id': tid,
                'date': date_str,
                'day': d,
                'bank': bank,
                'particulars': label,
                'amount': round(amt, 2),
                'category': label,
            })
            day_total += amt
            day_count += 1
            by_cat[label] += amt
    daily_totals[d] = {
        'date': date_str,
        'day': d,
        'total': round(day_total, 2),
        'count': day_count,
        'byCategory': {k: round(v, 2) for k, v in by_cat.items()},
    }

# Aggregates
cat_agg = defaultdict(lambda: {'amount': 0.0, 'count': 0})
bank_agg = defaultdict(lambda: {'amount': 0.0, 'count': 0})
for t in transactions:
    cat_agg[t['category']]['amount'] += t['amount']
    cat_agg[t['category']]['count'] += 1
    bank_agg[t['bank']]['amount'] += t['amount']
    bank_agg[t['bank']]['count'] += 1

cat_totals = sorted(
    [{'category': k, 'amount': round(v['amount'], 2), 'count': v['count']} for k, v in cat_agg.items()],
    key=lambda x: -x['amount'])
bank_totals = sorted(
    [{'bank': k, 'amount': round(v['amount'], 2), 'count': v['count']} for k, v in bank_agg.items()],
    key=lambda x: -x['amount'])

total_amt = sum(t['amount'] for t in transactions)
days_with_activity = sum(1 for d in daily_totals.values() if d['count'] > 0)

summary = {
    'totalPayments': round(total_amt, 2),
    'transactionCount': len(transactions),
    'daysWithActivity': days_with_activity,
    'bankCount': len(bank_agg),
    'topCategory': cat_totals[0]['category'] if cat_totals else None,
    'topBank': bank_totals[0]['bank'] if bank_totals else None,
}

daily_list = [daily_totals[d] for d in sorted(daily_totals)]

def dump_sheet(sheet_name):
    if sheet_name not in WB.sheet_names(): return []
    s = WB.sheet_by_name(sheet_name)
    out = []
    for r in range(s.nrows):
        out.append(s.row_values(r))
    return out

extra = {
    'fundPlan': dump_sheet('Fund Plan'),
    'finalSheet': dump_sheet('Final Sheet'),
    'conso': dump_sheet('Conso'),
    'esafDetail': dump_sheet('ESAF'),
    'advCommission': dump_sheet('Adv Commission'),
    'planSummary': dump_sheet('Plan'),
}

out = {
    'month': 'March 2026',
    'source': 'source.xls',
    'summary': summary,
    'categoryTotals': cat_totals,
    'bankTotals': bank_totals,
    'dailyTotals': daily_list,
    'transactions': transactions,
    **extra,
}

os.makedirs('data', exist_ok=True)
with open('data/march.json', 'w') as f:
    json.dump(out, f, indent=2, default=str)

def esc(s):
    if s is None: return ''
    return str(s).replace("'", "''")

with open('data/seed.sql', 'w') as f:
    f.write('-- Seed data for transactions (March 2026 — source.xls)\n')
    f.write('truncate table transactions restart identity;\n')
    for t in transactions:
        f.write(
            f"insert into transactions (txn_date, day, bank, particulars, amount, category) values "
            f"('{t['date']}', {t['day']}, '{esc(t['bank'])}', '{esc(t['particulars'])}', {t['amount']}, '{esc(t['category'])}');\n"
        )

print('Transactions:', len(transactions))
print('Total amount:', round(total_amt, 2))
print('Days with activity:', days_with_activity)
print('Banks:', len(bank_agg))
print('Categories discovered:', sorted(discovered_cats))
print('Top 5 categories:')
for c in cat_totals[:5]: print(' ', c)
print('Top 5 banks:')
for b in bank_totals[:5]: print(' ', b)
print('Extra sections included: fundPlan, finalSheet, conso, esafDetail, advCommission, planSummary')
