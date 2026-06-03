import uuid

from sqlalchemy import Column, ForeignKey, JSON, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from .base import Base, TimestampMixin


class AuditLog(Base, TimestampMixin):
    __tablename__ = "audit_logs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    entity_type = Column(String, nullable=False)
    entity_id = Column(UUID(as_uuid=True), nullable=True)
    action = Column(String, nullable=False)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    invoice_id = Column(UUID(as_uuid=True), ForeignKey("invoices.id"), nullable=True)
    details = Column(JSON, nullable=True)

    user = relationship("User", back_populates="audit_logs")
    invoice = relationship("Invoice", back_populates="audit_logs")
