from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel

from .user import UserRead


class BudgetLineRead(BaseModel):
    id: UUID
    code: str
    name: str
    allocated_amount: Decimal
    is_active: bool

    model_config = {"from_attributes": True}


class BudgetUploadRead(BaseModel):
    id: UUID
    fiscal_year: str
    original_filename: str
    is_active: bool
    uploaded_by: UserRead
    created_at: datetime
    budget_lines: list[BudgetLineRead] = []

    model_config = {"from_attributes": True}


class VendorRead(BaseModel):
    id: UUID
    name: str

    model_config = {"from_attributes": True}


class VendorCreate(BaseModel):
    name: str


class ProjectCreate(BaseModel):
    code: str
    name: str
    description: str | None = None


class ProjectRead(BaseModel):
    id: UUID
    code: str
    name: str
    description: str | None = None
    is_active: bool

    model_config = {"from_attributes": True}
