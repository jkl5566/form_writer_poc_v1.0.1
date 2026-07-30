import json
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]

def test_inventory_count_and_unique_codes():
    data=json.loads((ROOT/'generated/form_inventory.json').read_text(encoding='utf-8'))
    assert data['form_count']==81
    codes=[f['form_code'] for f in data['forms']]
    assert len(codes)==len(set(codes))
    assert {'T7-01','T7-04-01','T7-04-04','T7-07','T7-10'}.issubset(codes)

def test_archetypes_present():
    data=json.loads((ROOT/'generated/form_inventory.json').read_text(encoding='utf-8'))
    kinds={f['archetype'] for f in data['forms']}
    assert 'inspection_checklist' in kinds
    assert 'measurement_grid' in kinds
    assert 'decision_matrix' in kinds
