"""
Suggests budget lines for a new invoice based on historical allocations
from the same vendor within the same cost center.

Returns up to 3 suggestions ranked by frequency, with a confidence score
between 0 and 1 (proportion of past invoices that used that budget line).
"""
from uuid import UUID

from sqlalchemy import func
from sqlalchemy.orm import Session

from ..models.invoice import Invoice, InvoiceAllocation, InvoiceStatus
from ..models.budget import BudgetLine
from ..schemas.invoice import InvoiceSuggestion


def suggest_budget_lines(
    db: Session,
    vendor_id: UUID,
    cost_center_id: UUID,
    limit: int = 3,
) -> list[InvoiceSuggestion]:
    # Count how many approved/pending-approval invoices used each budget line
    rows = (
        db.query(
            InvoiceAllocation.budget_line_id,
            func.count(InvoiceAllocation.id).label("freq"),
        )
        .join(Invoice, Invoice.id == InvoiceAllocation.invoice_id)
        .filter(
            Invoice.vendor_id == vendor_id,
            Invoice.cost_center_id == cost_center_id,
            Invoice.status.in_([InvoiceStatus.approved, InvoiceStatus.pending_approval]),
            InvoiceAllocation.budget_line_id.isnot(None),
        )
        .group_by(InvoiceAllocation.budget_line_id)
        .order_by(func.count(InvoiceAllocation.id).desc())
        .limit(limit)
        .all()
    )

    if not rows:
        return []

    total = sum(r.freq for r in rows)

    suggestions: list[InvoiceSuggestion] = []
    for row in rows:
        bl = db.get(BudgetLine, row.budget_line_id)
        if bl and bl.is_active:
            suggestions.append(
                InvoiceSuggestion(
                    budget_line_id=bl.id,
                    budget_line_name=bl.name,
                    budget_line_code=bl.code,
                    confidence=round(row.freq / total, 2),
                )
            )

    return suggestions
