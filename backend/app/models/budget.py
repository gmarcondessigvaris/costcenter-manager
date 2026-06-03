import uuid

from sqlalchemy import Boolean, Column, ForeignKey, Numeric, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from .base import Base, TimestampMixin


class BudgetUpload(Base, TimestampMixin):
    __tablename__ = "budget_uploads"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    cost_center_id = Column(UUID(as_uuid=True), ForeignKey("cost_centers.id"), nullable=False)
    fiscal_year = Column(String, nullable=False)
    file_path = Column(String, nullable=False)
    original_filename = Column(String, nullable=False)
    uploaded_by_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)

    cost_center = relationship("CostCenter", back_populates="budget_uploads")
    uploaded_by = relationship("User")
    budget_lines = relationship("BudgetLine", back_populates="budget_upload", cascade="all, delete-orphan")


class BudgetLine(Base, TimestampMixin):
    __tablename__ = "budget_lines"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    cost_center_id = Column(UUID(as_uuid=True), ForeignKey("cost_centers.id"), nullable=False)
    budget_upload_id = Column(UUID(as_uuid=True), ForeignKey("budget_uploads.id"), nullable=False)
    code = Column(String, nullable=False)
    name = Column(String, nullable=False)
    allocated_amount = Column(Numeric(18, 2), nullable=False, default=0)
    is_active = Column(Boolean, default=True, nullable=False)

    cost_center = relationship("CostCenter")
    budget_upload = relationship("BudgetUpload", back_populates="budget_lines")
    allocations = relationship("InvoiceAllocation", back_populates="budget_line")


class Vendor(Base, TimestampMixin):
    __tablename__ = "vendors"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String, nullable=False, unique=True)
    is_active = Column(Boolean, default=True, nullable=False)

    invoices = relationship("Invoice", back_populates="vendor")


class Project(Base, TimestampMixin):
    __tablename__ = "projects"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    cost_center_id = Column(UUID(as_uuid=True), ForeignKey("cost_centers.id"), nullable=False)
    code = Column(String, nullable=False)
    name = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    created_by_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)

    cost_center = relationship("CostCenter", back_populates="projects")
    created_by = relationship("User")
    allocations = relationship("InvoiceAllocation", back_populates="project")
