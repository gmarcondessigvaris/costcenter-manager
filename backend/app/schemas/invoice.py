from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, model_validator

from ..models.invoice import ApprovalStatus, InvoiceStatus
from .budget import BudgetLineRead, ProjectRead, VendorRead
from .user import UserRead


class AllocationInput(BaseModel):
    budget_line_id: UUID | None = None
    project_id: UUID | None = None
    amount: Decimal
    notes: str | None = None

    @model_validator(mode="after")
    def check_exactly_one_target(self):
        if self.budget_line_id is None and self.project_id is None:
            raise ValueError("Each allocation must reference a budget_line_id or project_id")
        if self.budget_line_id is not None and self.project_id is not None:
            raise ValueError("Each allocation must reference only one of budget_line_id or project_id")
        return self


class InvoiceAssign(BaseModel):
    amount: Decimal
    due_date: date
    notes: str | None = None
    allocations: list[AllocationInput]
    approver_1_id: UUID
    approver_2_id: UUID

    @model_validator(mode="after")
    def check_approvers_differ(self):
        if self.approver_1_id == self.approver_2_id:
            raise ValueError("The two approvers must be different people")
        return self


class ApprovalDecision(BaseModel):
    comment: str | None = None


class AllocationRead(BaseModel):
    id: UUID
    budget_line: BudgetLineRead | None = None
    project: ProjectRead | None = None
    amount: Decimal
    notes: str | None = None

    model_config = {"from_attributes": True}


class ApprovalStepRead(BaseModel):
    id: UUID
    step_order: int
    approver: UserRead
    status: ApprovalStatus
    comment: str | None = None
    decided_at: date | None = None

    model_config = {"from_attributes": True}


class InvoiceRead(BaseModel):
    id: UUID
    invoice_number: str | None = None
    status: InvoiceStatus
    vendor: VendorRead
    cost_center_id: UUID
    pdf_path: str | None = None
    original_filename: str | None = None
    amount: Decimal | None = None
    due_date: date | None = None
    notes: str | None = None
    uploaded_by: UserRead
    created_at: datetime
    allocations: list[AllocationRead] = []
    approval_steps: list[ApprovalStepRead] = []

    model_config = {"from_attributes": True}


class InvoiceSuggestion(BaseModel):
    budget_line_id: UUID
    budget_line_name: str
    budget_line_code: str
    confidence: float
