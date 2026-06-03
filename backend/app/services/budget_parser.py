"""
Parses a Finance-uploaded budget Excel file into BudgetLine records.

Expected sheet format (header row, then data):
  Column A: Code       (e.g. "4100")
  Column B: Name       (e.g. "Travel & Accommodation")
  Column C: Amount     (numeric, e.g. 50000)

The header row is detected automatically — the first row where the first
cell value looks like a header label (non-numeric) is skipped.
"""
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation
from pathlib import Path

import openpyxl


@dataclass
class ParsedBudgetLine:
    code: str
    name: str
    allocated_amount: Decimal


def parse_budget_excel(file_path: str) -> list[ParsedBudgetLine]:
    wb = openpyxl.load_workbook(file_path, read_only=True, data_only=True)
    ws = wb.active

    lines: list[ParsedBudgetLine] = []
    header_skipped = False

    for row in ws.iter_rows(values_only=True):
        code_val, name_val, amount_val = (row[0], row[1], row[2]) if len(row) >= 3 else (None, None, None)

        if code_val is None and name_val is None:
            continue

        # Skip the header row (first non-empty row where code is not numeric)
        if not header_skipped:
            try:
                Decimal(str(code_val))
            except (InvalidOperation, TypeError):
                header_skipped = True
                continue

        code = str(code_val).strip() if code_val is not None else ""
        name = str(name_val).strip() if name_val is not None else ""

        if not code or not name:
            continue

        try:
            amount = Decimal(str(amount_val)).quantize(Decimal("0.01")) if amount_val is not None else Decimal("0")
        except InvalidOperation:
            amount = Decimal("0")

        lines.append(ParsedBudgetLine(code=code, name=name, allocated_amount=amount))

    wb.close()
    return lines
