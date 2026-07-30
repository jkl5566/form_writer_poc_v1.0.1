#!/bin/bash
set -e
cd "$(dirname "$0")"
python3 tools/validate_schemas.py --schema-dir schema
python3 -m py_compile serve.py tools/*.py
node --check web/app.js
node --check web/storage.js
node --check web/sw.js
if python3 -c 'import pytest' >/dev/null 2>&1; then
  python3 -m pytest -q
else
  echo "pytest 未安裝，略過 Python 測試（可 pip install pytest）"
fi
echo "全部檢查完成。"
