import os
import shutil
import uuid
from datetime import date
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from ..config import settings
from ..database import get_db
from ..dependencies import get_current_user, require_finance
from ..models.budget import BudgetLine, Project, Vendor
from ..models.cost_center import CostCenter, CostCenterMember
from ..models.invoice import ApprovalStatus, ApprovalStep, Invoice, InvoiceAllocation, InvoiceStatus
from ..models.user import User, UserRole
from ..schemas.invoice import ApprovalDecision, InvoiceAssign, InvoiceRead, InvoiceSuggestion
from ..services.audit import log_action
from ..services.suggestion_engine import suggest_budget_lines

router = APIRouter(prefix="/invoices", tags=["invoices"])


def _assert_owner_access(invoice: Invoice, user: User, db: Session) -> None:
    if user.role in (UserRole.admin, UserRole.finance):
        return
    member = (
        db.query(CostCenterMember)
        .filter(
            CostCenterMember.cost_center_id == invoice.cost_center_id,
            CostCenterMember.user_id == user.id,
        )
        .first()
    )
    if not member:
        raise HTTPException(status_code=403, detail="Not a member of this cost center")


# ── Upload (Finance) ──────────────────────────────────────────────────────────

@router.post("", response_model=InvoiceRead, status_code=201)
def upload_invoice(
    cost_center_id: UUID = Form(...),
    vendor_id: UUID = Form(...),
    invoice_number: str | None = Form(default=None),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_finance),
):
    cc = db.get(CostCenter, cost_center_id)
    if not cc:
        raise HTTPException(status_code=404, detail="Cost center not found")

    vendor = db.get(Vendor, vendor_id)
    if not vendor:
        raise HTTPException(status_code=404, detail="Vendor not found")

    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are accepted")

    upload_dir = os.path.join(settings.UPLOAD_DIR, "invoices", str(cost_center_id))
    os.makedirs(upload_dir, exist_ok=True)
    file_id = uuid.uuid4()
    file_path = os.path.join(upload_dir, f"{file_id}_{file.filename}")

    with open(file_path, "wb") as f:
        shutil.copyfileobj(file.file, f)

    invoice = Invoice(
        invoice_number=invoice_number,
        cost_center_id=cost_center_id,
        vendor_id=vendor_id,
        pdf_path=file_path,
        original_filename=file.filename,
        uploaded_by_id=current_user.id,
    )
    db.add(invoice)
    db.flush()

    log_action(db, entity_type="Invoice", entity_id=invoice.id, action="uploaded",
               user_id=current_user.id, invoice_id=invoice.id,
               details={"vendor": vendor.name, "cost_center": cc.code})
    db.commit()
    db.refresh(invoice)
    return invoice


# ── List ──────────────────────────────────────────────────────────────────────

@router.get("", response_model=list[InvoiceRead])
def list_invoices(
    status: InvoiceStatus | None = None,
    cost_center_id: UUID | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(Invoice)

    if current_user.role not in (UserRole.admin, UserRole.finance):
        member_cc_ids = [m.cost_center_id for m in current_user.cost_center_memberships]
        # Also include invoices where user is an approver
        approver_invoice_ids = [
            s.invoice_id
            for s in db.query(ApprovalStep).filter(ApprovalStep.approver_id == current_user.id).all()
        ]
        query = query.filter(
            Invoice.cost_center_id.in_(member_cc_ids) | Invoice.id.in_(approver_invoice_ids)
        )

    if status:
        query = query.filter(Invoice.status == status)
    if cost_center_id:
        query = query.filter(Invoice.cost_center_id == cost_center_id)

    return query.order_by(Invoice.created_at.desc()).all()


# ── Detail ────────────────────────────────────────────────────────────────────

@router.get("/{invoice_id}", response_model=InvoiceRead)
def get_invoice(
    invoice_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    invoice = db.get(Invoice, invoice_id)
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    _assert_owner_access(invoice, current_user, db)
    return invoice


# ── Download PDF ──────────────────────────────────────────────────────────────

@router.get("/{invoice_id}/pdf")
def download_invoice_pdf(
    invoice_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    invoice = db.get(Invoice, invoice_id)
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    _assert_owner_access(invoice, current_user, db)

    if not invoice.pdf_path or not os.path.exists(invoice.pdf_path):
        raise HTTPException(status_code=404, detail="PDF file not found")

    return FileResponse(
        invoice.pdf_path,
        media_type="application/pdf",
        filename=invoice.original_filename or "invoice.pdf",
    )


# ── Suggestions ───────────────────────────────────────────────────────────────

@router.get("/{invoice_id}/suggestions", response_model=list[InvoiceSuggestion])
def get_suggestions(
    invoice_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    invoice = db.get(Invoice, invoice_id)
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    _assert_owner_access(invoice, current_user, db)
    return suggest_budget_lines(db, invoice.vendor_id, invoice.cost_center_id)


# ── Assign (Cost center owner) ────────────────────────────────────────────────

@router.put("/{invoice_id}/assign", response_model=InvoiceRead)
def assign_invoice(
    invoice_id: UUID,
    body: InvoiceAssign,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    invoice = db.get(Invoice, invoice_id)
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    _assert_owner_access(invoice, current_user, db)

    if invoice.status != InvoiceStatus.pending_assignment:
        raise HTTPException(status_code=409, detail=f"Invoice is already in status '{invoice.status}'")

    # Validate allocations target real objects
    for alloc in body.allocations:
        if alloc.budget_line_id:
            bl = db.get(BudgetLine, alloc.budget_line_id)
            if not bl or bl.cost_center_id != invoice.cost_center_id:
                raise HTTPException(status_code=400, detail=f"Budget line {alloc.budget_line_id} not found in this cost center")
        if alloc.project_id:
            proj = db.get(Project, alloc.project_id)
            if not proj or proj.cost_center_id != invoice.cost_center_id:
                raise HTTPException(status_code=400, detail=f"Project {alloc.project_id} not found in this cost center")

    # Validate approvers exist
    a1 = db.get(User, body.approver_1_id)
    a2 = db.get(User, body.approver_2_id)
    if not a1 or not a2:
        raise HTTPException(status_code=400, detail="One or both approvers not found")

    # Update invoice fields
    invoice.amount = body.amount
    invoice.due_date = body.due_date
    invoice.notes = body.notes
    invoice.status = InvoiceStatus.pending_approval

    # Replace allocations
    for existing in invoice.allocations:
        db.delete(existing)
    db.flush()

    for alloc in body.allocations:
        db.add(InvoiceAllocation(
            invoice_id=invoice.id,
            budget_line_id=alloc.budget_line_id,
            project_id=alloc.project_id,
            amount=alloc.amount,
            notes=alloc.notes,
        ))

    # Replace approval steps
    for step in invoice.approval_steps:
        db.delete(step)
    db.flush()

    db.add(ApprovalStep(invoice_id=invoice.id, approver_id=body.approver_1_id, step_order=1))
    db.add(ApprovalStep(invoice_id=invoice.id, approver_id=body.approver_2_id, step_order=2))

    log_action(db, entity_type="Invoice", entity_id=invoice.id, action="assigned",
               user_id=current_user.id, invoice_id=invoice.id,
               details={
                   "amount": str(body.amount),
                   "due_date": str(body.due_date),
                   "approver_1": str(body.approver_1_id),
                   "approver_2": str(body.approver_2_id),
                   "allocations": len(body.allocations),
               })
    db.commit()
    db.refresh(invoice)
    return invoice


# ── Approve ───────────────────────────────────────────────────────────────────

@router.post("/{invoice_id}/approve", response_model=InvoiceRead)
def approve_invoice(
    invoice_id: UUID,
    body: ApprovalDecision,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    invoice = db.get(Invoice, invoice_id)
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")

    if invoice.status != InvoiceStatus.pending_approval:
        raise HTTPException(status_code=409, detail="Invoice is not awaiting approval")

    # Find the current active step for this user
    active_step = next(
        (s for s in invoice.approval_steps
         if s.approver_id == current_user.id and s.status == ApprovalStatus.pending),
        None,
    )
    if not active_step:
        raise HTTPException(status_code=403, detail="You have no pending approval step for this invoice")

    # Ensure previous steps are done before this one can act
    for s in invoice.approval_steps:
        if s.step_order < active_step.step_order and s.status == ApprovalStatus.pending:
            raise HTTPException(status_code=409, detail="A prior approval step is still pending")

    active_step.status = ApprovalStatus.approved
    active_step.comment = body.comment
    active_step.decided_at = date.today()

    all_approved = all(s.status == ApprovalStatus.approved for s in invoice.approval_steps)
    if all_approved:
        invoice.status = InvoiceStatus.approved

    log_action(db, entity_type="Invoice", entity_id=invoice.id, action="step_approved",
               user_id=current_user.id, invoice_id=invoice.id,
               details={"step_order": active_step.step_order, "comment": body.comment,
                        "invoice_fully_approved": all_approved})
    db.commit()
    db.refresh(invoice)
    return invoice


# ── Reject ────────────────────────────────────────────────────────────────────

@router.post("/{invoice_id}/reject", response_model=InvoiceRead)
def reject_invoice(
    invoice_id: UUID,
    body: ApprovalDecision,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    invoice = db.get(Invoice, invoice_id)
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")

    if invoice.status != InvoiceStatus.pending_approval:
        raise HTTPException(status_code=409, detail="Invoice is not awaiting approval")

    active_step = next(
        (s for s in invoice.approval_steps
         if s.approver_id == current_user.id and s.status == ApprovalStatus.pending),
        None,
    )
    if not active_step:
        raise HTTPException(status_code=403, detail="You have no pending approval step for this invoice")

    active_step.status = ApprovalStatus.rejected
    active_step.comment = body.comment
    active_step.decided_at = date.today()
    invoice.status = InvoiceStatus.rejected

    log_action(db, entity_type="Invoice", entity_id=invoice.id, action="step_rejected",
               user_id=current_user.id, invoice_id=invoice.id,
               details={"step_order": active_step.step_order, "comment": body.comment})
    db.commit()
    db.refresh(invoice)
    return invoice


# ── Audit log ─────────────────────────────────────────────────────────────────

@router.get("/{invoice_id}/audit-log")
def get_audit_log(
    invoice_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from ..models.audit import AuditLog

    invoice = db.get(Invoice, invoice_id)
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    _assert_owner_access(invoice, current_user, db)

    logs = (
        db.query(AuditLog)
        .filter(AuditLog.invoice_id == invoice_id)
        .order_by(AuditLog.created_at.asc())
        .all()
    )
    return [
        {
            "id": str(l.id),
            "action": l.action,
            "user": l.user.display_name if l.user else "System",
            "details": l.details,
            "created_at": l.created_at.isoformat(),
        }
        for l in logs
    ]
