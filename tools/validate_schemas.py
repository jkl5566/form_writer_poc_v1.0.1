#!/usr/bin/env python3
from __future__ import annotations
import argparse, json
from pathlib import Path
from jsonschema import Draft202012Validator


def main():
    p=argparse.ArgumentParser(description='驗證 PoC Schema 與 catalog')
    p.add_argument('--schema-dir',type=Path,default=Path('schema'))
    args=p.parse_args()
    meta=json.loads((args.schema_dir/'form.schema.json').read_text(encoding='utf-8'))
    validator=Draft202012Validator(meta)
    catalog=json.loads((args.schema_dir/'catalog.json').read_text(encoding='utf-8'))
    errors=[]
    seen=set()
    for entry in catalog['forms']:
        code=entry['form_code']
        if code in seen: errors.append(f'catalog 重複：{code}')
        seen.add(code)
        path=args.schema_dir/f'{code}.json'
        if not path.exists(): errors.append(f'缺少 Schema：{path}'); continue
        data=json.loads(path.read_text(encoding='utf-8'))
        if data.get('form_code')!=code: errors.append(f'{path}: form_code 不一致')
        for err in validator.iter_errors(data): errors.append(f'{path}: {err.json_path}: {err.message}')
        ids=[s['id'] for s in data.get('sections',[])]
        if len(ids)!=len(set(ids)): errors.append(f'{path}: section id 重複')
        if not any(s.get('type')=='signatures' for s in data.get('sections',[])): errors.append(f'{path}: 缺少 signatures section')
    if errors:
        print('\n'.join('ERROR '+e for e in errors)); raise SystemExit(1)
    print(f'OK：{len(seen)} 份正式 PoC Schema 全數通過驗證')

if __name__=='__main__': main()
