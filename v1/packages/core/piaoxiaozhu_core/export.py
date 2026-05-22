from __future__ import annotations

import csv
import io
from dataclasses import dataclass
from datetime import date
from typing import Optional

from openpyxl import Workbook

from piaoxiaozhu_core.report import (
    RestaurantPocReport,
    CATEGORY_NAMES,
    format_cents,
    format_percent,
)


@dataclass
class ExportRecord:
    name: Optional[str] = None
    merchant: Optional[str] = None
    total: Optional[int] = None
    type: Optional[str] = None
    category_code: Optional[str] = None
    category_l1: Optional[str] = None
    issued_at: Optional[date] = None
    note: Optional[str] = None
    tax_amount: Optional[int] = None
    raw_text: Optional[str] = None


_CSV_HEADERS = [
    "名称",
    "商户",
    "金额(元)",
    "类型",
    "分类编码",
    "分类名称",
    "日期",
    "税额(元)",
    "备注",
    "识别文本",
]


def export_csv(records: list[ExportRecord], project_name: str) -> str:
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(_CSV_HEADERS)
    for rec in records:
        writer.writerow([
            rec.name or "",
            rec.merchant or "",
            format_cents(rec.total) if rec.total is not None else "",
            rec.type or "",
            rec.category_code or "",
            CATEGORY_NAMES.get(rec.category_code, "") if rec.category_code else "",
            rec.issued_at.isoformat() if rec.issued_at else "",
            format_cents(rec.tax_amount) if rec.tax_amount is not None else "",
            rec.note or "",
            rec.raw_text or "",
        ])
    return buf.getvalue()


def export_excel(
    records: list[ExportRecord],
    project_name: str,
    report: RestaurantPocReport,
) -> bytes:
    wb = Workbook()

    ws_detail = wb.active
    ws_detail.title = "票据明细"
    ws_detail.append(_CSV_HEADERS)
    for rec in records:
        ws_detail.append([
            rec.name or "",
            rec.merchant or "",
            float(format_cents(rec.total)) if rec.total is not None else "",
            rec.type or "",
            rec.category_code or "",
            CATEGORY_NAMES.get(rec.category_code, "") if rec.category_code else "",
            rec.issued_at.isoformat() if rec.issued_at else "",
            float(format_cents(rec.tax_amount)) if rec.tax_amount is not None else "",
            rec.note or "",
            rec.raw_text or "",
        ])

    ws_summary = wb.create_sheet(title="经营汇总")
    ws_summary.append(["项目", "金额(元)"])
    ws_summary.append(["总收入", float(format_cents(report.total_income))])
    ws_summary.append(["总成本", float(format_cents(report.total_cost))])
    ws_summary.append(["毛利润", float(format_cents(report.gross_profit))])
    ws_summary.append(["毛利率", format_percent(report.gross_margin)])
    ws_summary.append([])
    ws_summary.append(["分类", "金额(元)"])
    for cat in report.cost_by_category:
        ws_summary.append([cat.name, float(format_cents(cat.amount))])

    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()
