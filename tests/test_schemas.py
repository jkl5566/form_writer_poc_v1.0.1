import json
from pathlib import Path
from jsonschema import Draft202012Validator

ROOT=Path(__file__).resolve().parents[1]

def test_catalog_schemas_valid():
    schema_dir=ROOT/'schema'
    meta=json.loads((schema_dir/'form.schema.json').read_text(encoding='utf-8'))
    validator=Draft202012Validator(meta)
    catalog=json.loads((schema_dir/'catalog.json').read_text(encoding='utf-8'))
    assert len(catalog['forms'])==5
    for entry in catalog['forms']:
        data=json.loads((schema_dir/f"{entry['form_code']}.json").read_text(encoding='utf-8'))
        assert not list(validator.iter_errors(data))
        assert data['form_code']==entry['form_code']
        assert any(sec['type']=='signatures' for sec in data['sections'])
