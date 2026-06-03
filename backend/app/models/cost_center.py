import enum
import uuid

from sqlalchemy import Boolean, Column, Enum, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from .base import Base, TimestampMixin


class MemberRole(str, enum.Enum):
    owner = "owner"
    viewer = "viewer"


class CostCenter(Base, TimestampMixin):
    __tablename__ = "cost_centers"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    code = Column(String, unique=True, nullable=False, index=True)
    name = Column(String, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)

    members = relationship("CostCenterMember", back_populates="cost_center", cascade="all, delete-orphan")
    budget_uploads = relationship("BudgetUpload", back_populates="cost_center")
    invoices = relationship("Invoice", back_populates="cost_center")
    projects = relationship("Project", back_populates="cost_center")


class CostCenterMember(Base, TimestampMixin):
    __tablename__ = "cost_center_members"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    cost_center_id = Column(UUID(as_uuid=True), ForeignKey("cost_centers.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    role = Column(Enum(MemberRole), default=MemberRole.owner, nullable=False)

    cost_center = relationship("CostCenter", back_populates="members")
    user = relationship("User", back_populates="cost_center_memberships")
