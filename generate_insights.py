import json, math
from collections import defaultdict
from datetime import date, timedelta

with open('data/march.json') as f:
    data = json.load(f)

txns = data['transactions']
daily = data['dailyTotals']

# 1. Top 5 largest transactions
top5 = sorted(txns, key=lambda t: -t['amount'])[:5]

# 2. Anomalies: > mean + 3*std within category
by_cat = defaultdict(list)
for t in txns:
    by_cat[t['category']].append(t)

anomalies = []
for cat, items in by_cat.items():
    if len(items) < 5:
        continue
    amts = [t['amount'] for t in items]
    mean = sum(amts) / len(amts)
    var = sum((a - mean) ** 2 for a in amts) / len(amts)
    std = math.sqrt(var)
    threshold = mean + 3 * std
    for t in items:
        if t['amount'] > threshold and std > 0:
            anomalies.append({
                **t,
                'categoryMean': round(mean, 2),
                'categoryStd': round(std, 2),
                'zScore': round((t['amount'] - mean) / std, 2),
                'threshold': round(threshold, 2),
            })
anomalies.sort(key=lambda x: -x['zScore'])

# 3. Busiest / slowest day by amount and count (exclude zero-activity days)
active = [d for d in daily if d['count'] > 0]
busiest_amt = max(active, key=lambda d: d['total'])
slowest_amt = min(active, key=lambda d: d['total'])
busiest_cnt = max(active, key=lambda d: d['count'])
slowest_cnt = min(active, key=lambda d: d['count'])

# 4. Week summaries (ISO-ish: week 1 = days 1-7, 2 = 8-14, 3 = 15-21, 4 = 22-28, 5 = 29-31)
weeks = []
week_ranges = [(1, 7), (8, 14), (15, 21), (22, 28), (29, 31)]
for wi, (a, b) in enumerate(week_ranges, 1):
    week_txns = [t for t in txns if a <= t['day'] <= b]
    total = sum(t['amount'] for t in week_txns)
    cnt = len(week_txns)
    cat_agg = defaultdict(float)
    for t in week_txns:
        cat_agg[t['category']] += t['amount']
    top_cat = max(cat_agg.items(), key=lambda x: x[1])[0] if cat_agg else None
    weeks.append({
        'week': wi,
        'dateRange': f'2026-03-{a:02d} to 2026-03-{b:02d}',
        'total': round(total, 2),
        'count': cnt,
        'topCategory': top_cat,
        'topCategoryAmount': round(cat_agg.get(top_cat, 0), 2) if top_cat else 0,
    })

# 5. Category concentration
total_amt = sum(t['amount'] for t in txns)
cat_totals = data['categoryTotals']
top3_cat_share = round(100 * sum(c['amount'] for c in cat_totals[:3]) / total_amt, 2)
hhi_cat = round(sum((c['amount'] / total_amt * 100) ** 2 for c in cat_totals), 2)
category_concentration = {
    'top3SharePct': top3_cat_share,
    'top1SharePct': round(100 * cat_totals[0]['amount'] / total_amt, 2),
    'hhi': hhi_cat,
    'interpretation': (
        'Highly concentrated' if hhi_cat > 2500 else
        'Moderately concentrated' if hhi_cat > 1500 else
        'Unconcentrated'
    ),
}

# 6. Bank concentration
bank_totals = data['bankTotals']
top3_bank_share = round(100 * sum(b['amount'] for b in bank_totals[:3]) / total_amt, 2)
hhi_bank = round(sum((b['amount'] / total_amt * 100) ** 2 for b in bank_totals), 2)
bank_concentration = {
    'top3SharePct': top3_bank_share,
    'top1SharePct': round(100 * bank_totals[0]['amount'] / total_amt, 2),
    'hhi': hhi_bank,
    'interpretation': (
        'Highly concentrated' if hhi_bank > 2500 else
        'Moderately concentrated' if hhi_bank > 1500 else
        'Unconcentrated'
    ),
}

# 7. Uncategorized breakdown
uncat = [t for t in txns if t['category'] == 'Uncategorized']
uncat_by_bank = defaultdict(lambda: {'amount': 0.0, 'count': 0})
for t in uncat:
    uncat_by_bank[t['bank']]['amount'] += t['amount']
    uncat_by_bank[t['bank']]['count'] += 1
uncat_banks = sorted(
    [{'bank': k, 'amount': round(v['amount'], 2), 'count': v['count']}
     for k, v in uncat_by_bank.items()],
    key=lambda x: -x['amount'])
uncategorized_flag = {
    'totalCount': len(uncat),
    'totalAmount': round(sum(t['amount'] for t in uncat), 2),
    'sharePct': round(100 * sum(t['amount'] for t in uncat) / total_amt, 2),
    'byBank': uncat_banks,
    'sampleTxns': [
        {'id': t['id'], 'date': t['date'], 'bank': t['bank'],
         'particulars': t['particulars'][:120], 'amount': t['amount']}
        for t in sorted(uncat, key=lambda t: -t['amount'])[:10]
    ],
}

# 8. Day-over-day biggest jumps (by absolute % change)
jumps = []
for i in range(1, len(daily)):
    prev = daily[i - 1]
    cur = daily[i]
    if prev['total'] == 0:
        continue
    pct = (cur['total'] - prev['total']) / prev['total'] * 100
    jumps.append({
        'date': cur['date'],
        'day': cur['day'],
        'prevDate': prev['date'],
        'prevTotal': prev['total'],
        'currTotal': cur['total'],
        'pctChange': round(pct, 2),
        'absChange': round(cur['total'] - prev['total'], 2),
        'direction': 'up' if pct >= 0 else 'down',
    })
jumps_top = sorted(jumps, key=lambda j: -abs(j['pctChange']))[:5]

insights = {
    'month': 'March 2026',
    'generatedFor': 'CEO Dashboard',
    'top5LargestTransactions': top5,
    'anomalies': anomalies[:20],
    'anomalyCount': len(anomalies),
    'extremeDays': {
        'busiestByAmount': busiest_amt,
        'slowestByAmount': slowest_amt,
        'busiestByCount': busiest_cnt,
        'slowestByCount': slowest_cnt,
    },
    'weekSummaries': weeks,
    'categoryConcentration': category_concentration,
    'bankConcentration': bank_concentration,
    'uncategorizedFlag': uncategorized_flag,
    'dayOverDayBiggestJumps': jumps_top,
}

with open('data/insights.json', 'w') as f:
    json.dump(insights, f, indent=2)

# Headline findings
print('=== HEADLINE FINDINGS ===')
print(f"Largest single txn: ₹{top5[0]['amount']:,.0f} — {top5[0]['bank']} on {top5[0]['date']}")
print(f"Anomalies flagged: {len(anomalies)} (>3 std dev in category)")
print(f"Busiest day (amt): {busiest_amt['date']} — ₹{busiest_amt['total']:,.0f} ({busiest_amt['count']} txns)")
print(f"Slowest active day: {slowest_amt['date']} — ₹{slowest_amt['total']:,.0f}")
print(f"Top category concentration: top-3 = {top3_cat_share}%, HHI = {hhi_cat} ({category_concentration['interpretation']})")
print(f"Top bank concentration: top-3 = {top3_bank_share}%, HHI = {hhi_bank} ({bank_concentration['interpretation']})")
print(f"Uncategorized: {len(uncat)} txns, ₹{uncategorized_flag['totalAmount']:,.0f} ({uncategorized_flag['sharePct']}% of spend)")
print(f"Biggest day-over-day jump: {jumps_top[0]['date']} — {jumps_top[0]['pctChange']}% {jumps_top[0]['direction']}")
print('Weekly totals:')
for w in weeks:
    print(f"  Week {w['week']} ({w['dateRange']}): ₹{w['total']:,.0f} — {w['count']} txns — top: {w['topCategory']}")
