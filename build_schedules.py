import json
from datetime import datetime, timedelta

with open('data/march.json') as f:
    raw = json.load(f)

SHEETS = [
    ('conso',         'Consolidated',         2),   # header row index hint
    ('fundPlan',      'Fund Plan',            3),
    ('finalSheet',    'Final Sheet',          2),
    ('esafDetail',    'ESAF Detail',          2),
    ('advCommission', 'Advance Commission',   1),
    ('planSummary',   'Plan Summary',         2),
]

EXCEL_EPOCH = datetime(1899, 12, 30)

def is_excel_date(v):
    if not isinstance(v, (int, float)): return False
    if isinstance(v, bool): return False
    return 40000 <= v <= 50000  # 2009..2036 range

def to_date_str(v):
    try:
        return (EXCEL_EPOCH + timedelta(days=float(v))).strftime('%Y-%m-%d')
    except Exception:
        return str(v)

def is_empty(v):
    return v is None or (isinstance(v, str) and not v.strip())

def to_cell(v):
    if is_empty(v): return None
    if isinstance(v, str):
        s = v.strip()
        return s if s else None
    if isinstance(v, float):
        # drop trailing .0 for integers
        if v.is_integer():
            return int(v)
        return round(v, 6)
    return v

def trim_trailing_empty_columns(rows):
    if not rows: return rows, 0
    max_len = max(len(r) for r in rows)
    # find last column that has any non-empty cell
    last_filled = -1
    for c in range(max_len):
        for r in rows:
            if c < len(r) and not is_empty(r[c]):
                last_filled = max(last_filled, c)
                break
    width = last_filled + 1
    return [r[:width] + [''] * (width - len(r)) for r in rows], width

def infer_alignment(col_values):
    nums = 0; texts = 0
    for v in col_values:
        if is_empty(v): continue
        if isinstance(v, (int, float)) and not isinstance(v, bool): nums += 1
        else: texts += 1
    if nums == 0 and texts == 0: return 'left'
    return 'right' if nums >= texts else 'left'

def looks_numeric_column(col_values):
    nums = 0; texts = 0
    for v in col_values:
        if is_empty(v): continue
        if isinstance(v, (int, float)) and not isinstance(v, bool): nums += 1
        else: texts += 1
    return nums > texts

def classify_row(cells):
    non_empty = [(i, c) for i, c in enumerate(cells) if not is_empty(c)]
    if not non_empty:
        return None
    # section: single cell filled (or two adjacent) and it's a string
    if len(non_empty) <= 2 and all(isinstance(c, str) for _, c in non_empty):
        label = ' '.join(str(c).strip() for _, c in non_empty)
        return {'_type': 'section', 'label': label}
    # total: any cell is "Total" (case-insensitive), and row has numeric cells
    has_total = any(isinstance(c, str) and c.strip().lower() == 'total' for _, c in non_empty)
    has_numeric = any(isinstance(c, (int, float)) and not isinstance(c, bool) for _, c in non_empty)
    if has_total and has_numeric:
        return {'_type': 'total'}
    return {'_type': 'data'}

def build_sheet(key, label, header_hint, rows_raw):
    # cellify + trim trailing empty columns
    cellified = [[to_cell(v) for v in r] for r in rows_raw]
    cellified, width = trim_trailing_empty_columns(cellified)

    # drop fully empty rows
    filtered_with_idx = [(i, r) for i, r in enumerate(cellified)
                         if any(not is_empty(c) for c in r)]

    # header = header_hint if within bounds and that row has ≥ 3 non-empty cells, else fall back
    header_row = None
    if header_hint is not None and header_hint < len(cellified):
        h = cellified[header_hint]
        if sum(1 for c in h if not is_empty(c)) >= 3:
            header_row = h
    if header_row is None:
        for _, r in filtered_with_idx:
            if sum(1 for c in r if not is_empty(c)) >= 3 and \
               sum(1 for c in r if isinstance(c, str)) >= 2:
                header_row = r
                break
    if header_row is None:
        header_row = [f'Col {chr(65 + i)}' for i in range(width)]

    # build column meta
    columns = []
    # gather column values (from rows that come AFTER header row)
    header_index_in_raw = None
    for i, r in enumerate(cellified):
        if r is header_row:
            header_index_in_raw = i
            break
    body_start = (header_index_in_raw + 1) if header_index_in_raw is not None else 0

    for c in range(width):
        col_vals = [cellified[i][c] for i in range(body_start, len(cellified))
                    if c < len(cellified[i])]
        raw_label = header_row[c] if c < len(header_row) else ''
        col_label = str(raw_label).strip() if not is_empty(raw_label) else f'Col {chr(65 + c)}'
        # detect date column
        is_date_col = (
            isinstance(raw_label, str) and raw_label.strip().lower() in ('date', 'month') and
            sum(1 for v in col_vals if is_excel_date(v)) >= 2
        )
        align = 'left' if is_date_col else infer_alignment(col_vals)
        columns.append({
            'key': f'c{c}',
            'label': col_label,
            'align': align,
            'isDate': is_date_col,
            'isNumeric': looks_numeric_column(col_vals) and not is_date_col,
        })

    # build rows (excluding the header row itself)
    out_rows = []
    for i, r in filtered_with_idx:
        if i == header_index_in_raw:
            continue
        klass = classify_row(r)
        if klass is None:
            continue
        if klass['_type'] == 'section':
            out_rows.append({'_type': 'section', 'label': klass['label']})
            continue
        obj = {'_type': klass['_type']}
        for c in range(width):
            v = r[c] if c < len(r) else None
            if columns[c]['isDate'] and is_excel_date(v):
                v = to_date_str(v)
            obj[f'c{c}'] = v
        out_rows.append(obj)

    return {
        'label': label,
        'rowCount': len(out_rows),
        'sourceRowCount': len(rows_raw),
        'columns': columns,
        'rows': out_rows,
    }

out = {}
for key, label, header_hint in SHEETS:
    out[key] = build_sheet(key, label, header_hint, raw.get(key, []))

with open('data/schedules.json', 'w') as f:
    json.dump(out, f, indent=2, default=str)

# Verify load
with open('data/schedules.json') as f:
    check = json.load(f)

print('=== schedules.json built ===')
for k, v in check.items():
    section_n = sum(1 for r in v['rows'] if r.get('_type') == 'section')
    total_n = sum(1 for r in v['rows'] if r.get('_type') == 'total')
    data_n = sum(1 for r in v['rows'] if r.get('_type') == 'data')
    print(f"  {k:14s} source={v['sourceRowCount']:3d} kept={v['rowCount']:3d} "
          f"(data={data_n}, section={section_n}, total={total_n}) "
          f"cols={len(v['columns'])}")
