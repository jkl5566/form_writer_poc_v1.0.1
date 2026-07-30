#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""將 PoC 匯出的 record JSON 產製為結構化 PDF 樣張。

用法：
    python tools/render_record_pdf.py record.json schema/T7-01.json output.pdf
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, Image
)

FONT = "FormWriterCJK"
FONT_CANDIDATES = [
    "/System/Library/Fonts/PingFang.ttc",
    "/System/Library/Fonts/STHeiti Medium.ttc",
    "/System/Library/Fonts/Supplemental/Arial Unicode.ttf",
    "/usr/share/fonts/truetype/arphic-bkai00mp/bkai00mp.ttf",
    "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
]
_font_errors = []
for _font_path in FONT_CANDIDATES:
    if not Path(_font_path).exists():
        continue
    try:
        pdfmetrics.registerFont(TTFont(FONT, _font_path, subfontIndex=0))
        break
    except Exception as exc:
        _font_errors.append(f"{_font_path}: {exc}")
else:
    raise RuntimeError("找不到可嵌入的中文字型；請在 FONT_CANDIDATES 加入本機 TrueType 字型路徑\n" + "\n".join(_font_errors))


def esc(v) -> str:
    s = "" if v is None else str(v)
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\n", "<br/>")


def p(text, style):
    return Paragraph(esc(text), style)


def main() -> None:
    ap = argparse.ArgumentParser(description="產製表單 PDF 樣張")
    ap.add_argument("record", type=Path)
    ap.add_argument("schema", type=Path)
    ap.add_argument("output", type=Path)
    args = ap.parse_args()

    record = json.loads(args.record.read_text(encoding="utf-8"))
    schema = json.loads(args.schema.read_text(encoding="utf-8"))
    args.output.parent.mkdir(parents=True, exist_ok=True)

    styles = getSampleStyleSheet()
    normal = ParagraphStyle("CJK", parent=styles["Normal"], fontName=FONT, fontSize=9, leading=13)
    small = ParagraphStyle("CJKSmall", parent=normal, fontSize=8, leading=10)
    title = ParagraphStyle("CJKTitle", parent=styles["Title"], fontName=FONT, fontSize=16, leading=22, alignment=TA_CENTER)
    heading = ParagraphStyle("CJKHeading", parent=normal, fontSize=11, leading=15, spaceBefore=8, spaceAfter=5)

    doc = SimpleDocTemplate(
        str(args.output), pagesize=A4, rightMargin=14*mm, leftMargin=14*mm,
        topMargin=14*mm, bottomMargin=14*mm,
        title=schema.get("title", "表單"), author="form_writer PoC",
    )
    story = [Paragraph(esc(schema.get("org", "臺北市政府捷運工程局第一區工程處")), title),
             Paragraph(esc(schema["title"]), title), Spacer(1, 5*mm)]

    data = record.get("data", {})
    for sec in schema.get("sections", []):
        st = sec.get("type")
        if st == "fields":
            rows = []
            for f in sec.get("fields", []):
                if f.get("hidden_in_pdf"):
                    continue
                val = data.get(f["key"], "")
                if f.get("unit") and val not in ("", None):
                    val = f"{val} {f['unit']}"
                rows.append([p(f["label"], small), p(val, normal)])
            if rows:
                story.append(Paragraph(esc(sec.get("title", "基本資料")), heading))
                t = Table(rows, colWidths=[42*mm, 130*mm])
                t.setStyle(TableStyle([
                    ("FONTNAME", (0,0), (-1,-1), FONT), ("GRID", (0,0), (-1,-1), 0.35, colors.grey),
                    ("BACKGROUND", (0,0), (0,-1), colors.HexColor("#f1f1ec")),
                    ("VALIGN", (0,0), (-1,-1), "TOP"), ("LEFTPADDING", (0,0), (-1,-1), 5),
                    ("RIGHTPADDING", (0,0), (-1,-1), 5), ("TOPPADDING", (0,0), (-1,-1), 4),
                    ("BOTTOMPADDING", (0,0), (-1,-1), 4),
                ]))
                story.append(t)
        elif st == "checklist":
            story.append(Paragraph(esc(sec.get("title", "抽查項目")), heading))
            rows = [[p("階段／項目", small), p("抽查標準", small), p("實際抽查情形", small), p("結果", small), p("備註", small)]]
            cmap = {"pass": "○", "fail": "╳", "na": "／", None: ""}
            values = record.get("checklist", {}).get(sec["id"], {})
            for group in sec.get("groups", []):
                for item in group.get("items", []):
                    r = values.get(item["key"], {})
                    rows.append([
                        p(f"{group['label']}／{item['label']}", small),
                        p(item.get("standard", ""), small), p(r.get("actual", ""), small),
                        p(cmap.get(r.get("result"), r.get("result", "")), normal), p(r.get("note", ""), small),
                    ])
            t = Table(rows, repeatRows=1, colWidths=[42*mm, 50*mm, 48*mm, 14*mm, 22*mm])
            t.setStyle(TableStyle([
                ("FONTNAME", (0,0), (-1,-1), FONT), ("GRID", (0,0), (-1,-1), 0.3, colors.grey),
                ("BACKGROUND", (0,0), (-1,0), colors.HexColor("#dfe8e1")), ("VALIGN", (0,0), (-1,-1), "TOP"),
                ("ALIGN", (3,1), (3,-1), "CENTER"), ("LEFTPADDING", (0,0), (-1,-1), 3),
                ("RIGHTPADDING", (0,0), (-1,-1), 3), ("TOPPADDING", (0,0), (-1,-1), 3),
                ("BOTTOMPADDING", (0,0), (-1,-1), 3),
            ]))
            story.append(t)
        elif st == "measurement_grid":
            story.append(Paragraph(esc(sec.get("title", "量測紀錄")), heading))
            columns = sec.get("columns", [])
            rows = [[p(c["label"] + (f" ({c['unit']})" if c.get("unit") else ""), small) for c in columns]]
            for entry in record.get("grids", {}).get(sec["id"], []):
                rows.append([p(entry.get(c["key"], ""), small) for c in columns])
            widths = [176*mm/max(1,len(columns))] * len(columns)
            t = Table(rows, repeatRows=1, colWidths=widths)
            t.setStyle(TableStyle([
                ("FONTNAME", (0,0), (-1,-1), FONT), ("GRID", (0,0), (-1,-1), 0.3, colors.grey),
                ("BACKGROUND", (0,0), (-1,0), colors.HexColor("#dfe8e1")), ("VALIGN", (0,0), (-1,-1), "TOP"),
                ("LEFTPADDING", (0,0), (-1,-1), 3), ("RIGHTPADDING", (0,0), (-1,-1), 3),
            ]))
            story.append(t)
        elif st == "decision_matrix":
            story.append(Paragraph(esc(sec.get("title", "抽查項目")), heading))
            rows = [[p("抽查項目", small), p("結果", small), p("說明", small)]]
            values = record.get("decisions", {}).get(sec["id"], {})
            cmap = {"yes":"是", "no":"否", "na":"／"}
            for item in sec.get("items", []):
                r = values.get(item["key"], {})
                rows.append([p(item["label"], small), p(cmap.get(r.get("result"), ""), normal), p(r.get("explanation", ""), small)])
            t = Table(rows, repeatRows=1, colWidths=[120*mm, 16*mm, 40*mm])
            t.setStyle(TableStyle([
                ("FONTNAME", (0,0), (-1,-1), FONT), ("GRID", (0,0), (-1,-1), 0.3, colors.grey),
                ("BACKGROUND", (0,0), (-1,0), colors.HexColor("#dfe8e1")), ("VALIGN", (0,0), (-1,-1), "TOP"),
                ("ALIGN", (1,1), (1,-1), "CENTER"), ("LEFTPADDING", (0,0), (-1,-1), 3),
                ("RIGHTPADDING", (0,0), (-1,-1), 3),
            ]))
            story.append(t)
        elif st == "defect_review":
            defect = record.get("defect", {})
            story.append(Paragraph(esc(sec.get("title", "缺失複查結果")), heading))
            rows = [
                [p("狀態", small), p(defect.get("status", ""), normal)],
                [p("說明", small), p(defect.get("notes", ""), normal)],
                [p("複查日期", small), p(defect.get("review_date", ""), normal)],
                [p("複查人員", small), p(defect.get("reviewer", ""), normal)],
            ]
            t = Table(rows, colWidths=[42*mm, 130*mm])
            t.setStyle(TableStyle([
                ("FONTNAME", (0,0), (-1,-1), FONT), ("GRID", (0,0), (-1,-1), 0.35, colors.grey),
                ("BACKGROUND", (0,0), (0,-1), colors.HexColor("#f1f1ec")), ("VALIGN", (0,0), (-1,-1), "TOP"),
            ]))
            story.append(t)

    sig_rows = []
    for slot in schema.get("signature_slots", []):
        sig = record.get("signatures", {}).get(slot["key"], {})
        sig_rows.append([p(slot["label"], small), p(sig.get("signer_name", ""), normal), p(sig.get("signed_at", ""), small)])
    if sig_rows:
        story.append(Paragraph("簽認", heading))
        t = Table(sig_rows, colWidths=[48*mm, 60*mm, 68*mm])
        t.setStyle(TableStyle([
            ("FONTNAME", (0,0), (-1,-1), FONT), ("GRID", (0,0), (-1,-1), 0.35, colors.grey),
            ("BACKGROUND", (0,0), (0,-1), colors.HexColor("#f1f1ec")),
        ]))
        story.append(t)

    story.append(Spacer(1, 4*mm))
    story.append(Paragraph(f"表單代碼：{esc(schema['form_code'])}　Schema：{esc(schema.get('schema_version'))}　紀錄版本：{esc(record.get('version',1))}", small))
    doc.build(story)
    print(f"PDF 已產生：{args.output}")


if __name__ == "__main__":
    main()
