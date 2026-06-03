import enum
import uuid

from sqlalchemy import Column, Date, Enum, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from .base import Base, TimestampMixin


class InvoiceStatus(str, enum.Enum):
    pending_assignment = "pending_assignment"
    pending_approval = "pending_approval"
    approved = "approved"
    rejected = "rejected"


class ApprovalStatus(str, enum.Enum):
    pending = "pending"
    approved = "approved"
    rejected = "rejected"


class Invoice(Base, TimestampMixin):
    __tablename__ = "invoices"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    invoice_number = Column(String, nullable=True)
    cost_center_id = Column(UUID(as_uuid=True), ForeignKey("cost_centers.id"), nullable=False)
    vendor_id = Column(UUID(as_uuid=True), ForeignKey("vendors.id"), nullable=False)
    pdf_path = Column(String, nullable=True)
    original_filename = Column(String, nullable=True)
    status = Column(Enum(InvoiceStatus), default=InvoiceStatus.pending_assignment, nullable=False)
    uploaded_by_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    # Filled in by cost center owner during assignment
    amount = Column(Numeric(18, 2), nullable=True)
    due_date = Column(Date, nullable=True)
    notes = Column(Text, nullable=True)

    cost_center = relationship("CostCenter", back_populates="invoices")
    vendor = relationship("Vendor", back_populates="invoices")
    uploaded_by = relationship("User", foreign_keys=[uploaded_by_id])
    allocations = relationship("InvoiceAllocation", back_populates="invoice", cascade="all, delete-orphan")
    approval_steps = relationship(
        "ApprovalStep", back_populates="invoice",
        order_by="ApprovalStep.step_order",
        cascade="all, delete-orphan",
    )
    audit_logs = relationship("AuditLog", back_populates="invoice")


class InvoiceAllocation(Base, TimestampMixin):
    __tablename__ = "invoice_allocations"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    invoice_id = Column(UUID(as_uuid=True), ForeignKey("invoices.id", ondelete="CASCADE"), nullable=False)
    budget_line_id = Column(UUID(as_uuid=True), ForeignKey("budget_lines.id"), nullable=True)
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id"), nullable=True)
    amount = Column(Numeric(18, 2), nullable=False)
    notes = Column(Text, nullable=True)

    invoice = relationship("Invoice", back_populates="allocations")
    budget_line = relationship("BudgetLine", back_populates="allocations")
    project = relationship("Project", back_populates="allocations")


class ApprovalStep(Base, TimestampMixin):
    __tablename__ = "approval_steps"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    invoice_id = Column(UUID(as_uuid=True), ForeignKey("invoices.id", ondelete="CASCADE"), nullable=False)
    approver_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    step_order = Column(Integer, nullable=False)
    status = Column(Enum(ApprovalStatus), default=ApprovalStatus.pending, nullable=False)
    comment = Column(Text, nullable=True)
    decided_at = Column(Date, nullable=True)

    invoice = relationship("Invoice", back_populates="approval_steps")
    approver = relationship("User")
