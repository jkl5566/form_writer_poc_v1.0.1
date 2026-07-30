#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""盤點監造計畫／應用表單 Word。

目標不是自動判定工程規則，而是可靠產生：
- 表單標題與來源位置
- Word 表格尺寸與文字矩陣
- 可供人工覆核的 archetype 建議

用法：
    python tools/inventory_docx.py input.docx --out generated/form_inventory.json
"""
from __future__ import annotations

import argparse
import csv
import json
import re
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Iterable, Iterator, Union

from docx import Document
from docx.document import Document as _Document
from docx.table import Table
from docx.text.paragraph import Paragraph
from docx.oxml.table import CT_Tbl
from docx.oxml.text.paragraph import CT_P

CAPTION_RE = re.compile(
    r"表\s*7\s*-\s*(\d+)(?:\s*-\s*(\d+))?\s*([^\r\n]*)",
    re.IGNORECASE,
)


def norm(text: str) -> str:
    return re.sub(r"\s+", " ", text.replace("\u3000", " ")).strip()


def iter_block_items(parent: _Document) -> Iterator[Union[Paragraph, Table]]:
    """依 OOXML 實際順序走訪段落與表格。"""
    parent_elm = parent.element.body
    for child in parent_elm.iterchildren():
        if isinstance(child, CT_P):
            yield Paragraph(child, parent)
        elif isinstance(child, CT_Tbl):
            yield Table(child, parent)


def unique_row_texts(table: Table) -> list[list[str]]:
    rows: list[list[str]] = []
    for row in table.rows:
        values = [norm(cell.text) for cell in row.cells]
        rows.append(values)
    return rows


def suggest_archetype(cells: list[list[str]], title: str) -> str:
    flat = " ".join(x for row in cells for x in row)
    if any(k in flat for k in ("粘滯性", "黏滯性", "含砂量", "濾過度", "取樣深度")):
        return "measurement_grid"
    if "是" in flat and "否" in flat and ("抽查項目" in flat or "說明" in flat):
        return "decision_matrix"
    if any(k in title for k in ("穩定液", "試驗紀錄", "測試紀錄")) and len(cells) > 10:
        return "measurement_grid"
    return "inspection_checklist"


@dataclass
class FormInventory:
    form_code: str
    caption: str
    title: str
    sequence: int
    table_index: int
    rows: int
    columns: int
    archetype: str
    has_hold_point: bool
    has_defect_review: bool
    has_signature: bool
    cells: list[list[str]]


def parse_forms(path: Path) -> list[FormInventory]:
    doc = Document(path)
    result: list[FormInventory] = []
    pending: dict | None = None
    nearby_paragraphs: list[str] = []
    table_index = -1
    sequence = 0

    for block in iter_block_items(doc):
        if isinstance(block, Paragraph):
            text = norm(block.text)
            if not text:
                continue
            matches = list(CAPTION_RE.finditer(text))
            if matches:
                # 同一段可能包含上一表簽名文字與下一表 caption，採最後一個 caption。
                m = matches[-1]
                major = m.group(1)
                minor = m.group(2)
                suffix = norm(m.group(3))
                fraction = re.search(r"\((\d+)\s*/\s*(\d+)\)", suffix)
                derived_minor = minor or (fraction.group(1) if fraction else None)
                code = f"T7-{int(major):02d}" + (f"-{int(derived_minor):02d}" if derived_minor else "")
                pending = {
                    "form_code": code,
                    "caption": norm(m.group(0)),
                    "suffix": suffix,
                }
                nearby_paragraphs = []
            elif pending is not None:
                nearby_paragraphs.append(text)
        else:
            table_index += 1
            if pending is None:
                continue
            sequence += 1
            cells = unique_row_texts(block)
            title_candidates = [p for p in nearby_paragraphs if "表" in p or "紀錄" in p or "記錄" in p]
            title = title_candidates[0] if title_candidates else pending["suffix"] or pending["caption"]
            columns = max((len(r) for r in cells), default=0)
            flat = " ".join(x for row in cells for x in row)
            result.append(
                FormInventory(
                    form_code=pending["form_code"],
                    caption=pending["caption"],
                    title=title,
                    sequence=sequence,
                    table_index=table_index,
                    rows=len(cells),
                    columns=columns,
                    archetype=suggest_archetype(cells, title),
                    has_hold_point=("檢驗停留點" in flat or "停留點" in flat),
                    has_defect_review=("缺失複查" in flat or "缺點改進" in flat),
                    has_signature=("監造工務所" in flat or "簽章" in flat or "簽名" in flat),
                    cells=cells,
                )
            )
            pending = None
            nearby_paragraphs = []

    return result


def main() -> None:
    parser = argparse.ArgumentParser(description="盤點 Word 中的第七章應用表單")
    parser.add_argument("input", type=Path)
    parser.add_argument("--out", type=Path, default=Path("generated/form_inventory.json"))
    parser.add_argument("--csv", type=Path, default=None)
    args = parser.parse_args()

    forms = parse_forms(args.input)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "source_file": args.input.name,
        "form_count": len(forms),
        "forms": [asdict(f) for f in forms],
    }
    args.out.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

    csv_path = args.csv or args.out.with_suffix(".csv")
    with csv_path.open("w", encoding="utf-8-sig", newline="") as fh:
        writer = csv.DictWriter(
            fh,
            fieldnames=[
                "sequence", "form_code", "caption", "title", "table_index",
                "rows", "columns", "archetype", "has_hold_point",
                "has_defect_review", "has_signature",
            ],
        )
        writer.writeheader()
        for f in forms:
            row = asdict(f)
            row.pop("cells")
            writer.writerow(row)

    print(f"完成：辨識 {len(forms)} 份表單")
    print(f"JSON：{args.out}")
    print(f"CSV ：{csv_path}")


if __name__ == "__main__":
    main()
