# Builds the answer keys from content/source (the admin export of the IELTS test bank):
#   content/keys/<id>.json — {itemId: {answer, acceptable, explanation, quote, trap, ...}}
# The keys are read only by server.js to check answers; they are never served as files.
# Students' documents stay in content/tests (the student-facing copy, with media URLs).
#   python scripts/build-content.py
import json, os

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'content')
SRC = os.path.join(ROOT, 'source', 'tests')
KEYS = os.path.join(ROOT, 'keys')
# item fields that hold the answer or its explanation
KEY_FIELDS = ['answer', 'acceptable', 'explanation', 'quote', 'trap', 'keywords', 'textAnchor', 'spoken', 'targetBand', 'line', 'audioStart', 'audioEnd', 'pairGroup']

def groups(doc):
    doc = doc or {}
    return [g for p in doc.get('parts') or [] for g in p.get('groups') or []] + (doc.get('groups') or [])

os.makedirs(KEYS, exist_ok=True)
n_tests = n_items = 0
for fn in sorted(os.listdir(SRC)):
    src = json.load(open(os.path.join(SRC, fn), encoding='utf-8'))
    keys = {it['id']: {f: it[f] for f in KEY_FIELDS if f in it}
            for g in groups(src.get('document')) for it in g.get('items') or [] if 'answer' in it}
    if not keys:
        continue
    with open(os.path.join(KEYS, fn), 'w', encoding='utf-8') as f:
        json.dump(keys, f, ensure_ascii=False, separators=(',', ':'))
    n_tests += 1; n_items += len(keys)
print(f'keys: {n_tests} tests, {n_items} items')
