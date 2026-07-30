#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""將盤點結果轉成保守的 Schema 草稿。

注意：這只產生欄位候選，不推導工程允收規則；所有草稿均標記 needs_review=true。
"""
from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

GROUP_WORDS = {"施工前", "施工中", "施工後", "掘進管理", "背填灌漿"}
IGNORE = {
    "管理項目", "抽查標準", "抽查標準(定量定性)", "抽查標準（定性定量）",
    "實際抽查情形", "(敘述抽查值)", "抽查結果", "備註", "(抽查人員)",
}


def norm(s: str) -> str:
    return re.sub(r"\s+", " ", s).strip()


def keyify(text: str, index: int) -> str:
    # 中文欄位以穩定序號為 key，避免自動翻譯造成版本漂移。
    return f"item_{index:03d}"


def draft_from_form(form: dict) -> dict:
    archetype = form["archetype"]
    base = {
        "form_code": form["form_code"],
        "schema_version": "draft-0.1",
        "title": form["title"],
        "template_type": archetype,
        "needs_review": True,
        "source": {"caption": form["caption"], "table_index": form["table_index"]},
        "sections": [],
    }

    base["sections"].append({
        "id": "header",
        "type": "fields",
        "title": "基本資料",
        "fields": [
            {"key": "project_name", "label": "工程名稱", "type": "text", "required": True},
            {"key": "contractor", "label": "施工廠商", "type": "text", "required": True},
            {"key": "location", "label": "抽查位置", "type": "text", "required": True},
            {"key": "inspect_date", "label": "檢查日期", "type": "date", "required": True, "default": "today"},
        ],
    })

    if archetype == "decision_matrix":
        items = []
        seen = set()
        for row in form["cells"]:
            label = norm(row[0] if row else "")
            if not label or label in seen or label in IGNORE or len(label) < 3:
                continue
            if re.match(r"^\d+[、.]", label) or label.startswith("（"):
                seen.add(label)
                items.append({"key": keyify(label, len(items)+1), "label": label})
        base["sections"].append({
            "id": "decision",
            "type": "decision_matrix",
            "title": "抽查項目",
            "options": ["yes", "no", "na"],
            "items": items,
        })
    elif archetype == "measurement_grid":
        base["sections"].append({
            "id": "measurements",
            "type": "measurement_grid",
            "title": "量測紀錄",
            "repeatable": True,
            "min_rows": 1,
            "columns": [
                {"key": "time", "label": "試驗時間", "type": "time"},
                {"key": "depth", "label": "取樣深度", "type": "number", "unit": "m"},
                {"key": "value", "label": "量測值", "type": "text"},
            ],
        })
    else:
        groups = []
        current = {"id": "general", "label": "抽查項目", "items": []}
        groups.append(current)
        seen = set()
        idx = 0
        for row in form["cells"]:
            candidates = [norm(x) for x in row[:2] if norm(x)]
            for text in candidates:
                if text in GROUP_WORDS:
                    current = {"id": f"group_{len(groups)+1}", "label": text, "items": []}
                    groups.append(current)
                    break
                if text in IGNORE or text in seen or len(text) > 80:
                    continue
                if any(k in text for k in ("工程名稱", "施工廠商", "抽查位置", "檢查日期", "缺失複查")):
                    continue
                if len(text) >= 2:
                    idx += 1
                    seen.add(text)
                    current["items"].append({"key": keyify(text, idx), "label": text, "standard": "待人工覆核"})
                    break
        groups = [g for g in groups if g["items"]]
        base["sections"].append({
            "id": "inspection",
            "type": "checklist",
            "title": "抽查項目",
            "result_options": ["pass", "fail", "na"],
            "groups": groups,
        })

    base["sections"].append({"id": "defect", "type": "defect_review", "title": "缺失複查結果"})
    base["sections"].append({
        "id": "signatures", "type": "signatures", "title": "簽認",
        "slots": [
            {"key": "contractor_rep", "label": "施工廠商隨同人員", "required": True},
            {"key": "supervisor", "label": "監造工務所", "required": True},
        ],
    })
    return base


def main() -> None:
    p = argparse.ArgumentParser(description="由表單盤點結果產生 Schema 草稿")
    p.add_argument("inventory", type=Path)
    p.add_argument("--out-dir", type=Path, default=Path("generated/schema_drafts"))
    args = p.parse_args()
    data = json.loads(args.inventory.read_text(encoding="utf-8"))
    args.out_dir.mkdir(parents=True, exist_ok=True)
    for form in data["forms"]:
        draft = draft_from_form(form)
        path = args.out_dir / f"{form['form_code']}.draft.json"
        path.write_text(json.dumps(draft, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"完成：{len(data['forms'])} 份 Schema 草稿 -> {args.out_dir}")


if __name__ == "__main__":
    main()
