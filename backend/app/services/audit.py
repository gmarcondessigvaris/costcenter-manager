from uuid import UUID

from sqlalchemy.orm import Session

from ..models.audit import AuditLog


def log_action(
    db: Session,
    *,
    entity_type: str,
    entity_id: UUID | None,
    action: str,
    user_id: UUID | None,
    invoice_id: UUID | None = None,
    details: dict | None = None,
) -> None:
    entry = AuditLog(
        entity_type=entity_type,
        entity_id=entity_id,
        action=action,
        user_id=user_id,
        invoice_id=invoice_id,
        details=details,
    )
    db.add(entry)
    # caller is responsible for db.commit()
