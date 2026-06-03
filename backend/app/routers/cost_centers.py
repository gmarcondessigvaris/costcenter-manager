from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..dependencies import get_current_user, require_admin
from ..models.cost_center import CostCenter, CostCenterMember, MemberRole
from ..models.user import User, UserRole
from ..schemas.cost_center import CostCenterCreate, CostCenterRead, CostCenterUpdate, MemberAdd
from ..services.audit import log_action

router = APIRouter(prefix="/cost-centers", tags=["cost-centers"])


def _assert_access(cost_center: CostCenter, user: User) -> None:
    if user.role in (UserRole.admin, UserRole.finance):
        return
    ids = [m.user_id for m in cost_center.members]
    if user.id not in ids:
        raise HTTPException(status_code=403, detail="Not a member of this cost center")


@router.get("", response_model=list[CostCenterRead])
def list_cost_centers(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role in (UserRole.admin, UserRole.finance):
        return db.query(CostCenter).filter(CostCenter.is_active == True).all()

    memberships = current_user.cost_center_memberships
    cc_ids = [m.cost_center_id for m in memberships]
    return db.query(CostCenter).filter(CostCenter.id.in_(cc_ids), CostCenter.is_active == True).all()


@router.post("", response_model=CostCenterRead, status_code=201)
def create_cost_center(
    body: CostCenterCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    if db.query(CostCenter).filter(CostCenter.code == body.code).first():
        raise HTTPException(status_code=409, detail="Cost center code already exists")
    cc = CostCenter(code=body.code, name=body.name)
    db.add(cc)
    db.commit()
    db.refresh(cc)
    log_action(db, entity_type="CostCenter", entity_id=cc.id, action="created",
               user_id=current_user.id, details={"code": cc.code, "name": cc.name})
    db.commit()
    return cc


@router.put("/{cc_id}", response_model=CostCenterRead)
def update_cost_center(
    cc_id: UUID,
    body: CostCenterUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    cc = db.get(CostCenter, cc_id)
    if not cc:
        raise HTTPException(status_code=404, detail="Cost center not found")
    if body.name is not None:
        cc.name = body.name
    if body.is_active is not None:
        cc.is_active = body.is_active
    db.commit()
    db.refresh(cc)
    return cc


@router.post("/{cc_id}/members", response_model=CostCenterRead, status_code=201)
def add_member(
    cc_id: UUID,
    body: MemberAdd,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    cc = db.get(CostCenter, cc_id)
    if not cc:
        raise HTTPException(status_code=404, detail="Cost center not found")
    user = db.get(User, body.user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    existing = (
        db.query(CostCenterMember)
        .filter(CostCenterMember.cost_center_id == cc_id, CostCenterMember.user_id == body.user_id)
        .first()
    )
    if existing:
        existing.role = body.role
    else:
        db.add(CostCenterMember(cost_center_id=cc_id, user_id=body.user_id, role=body.role))

    log_action(db, entity_type="CostCenter", entity_id=cc_id, action="member_added",
               user_id=current_user.id, details={"member_user_id": str(body.user_id), "role": body.role})
    db.commit()
    db.refresh(cc)
    return cc


@router.delete("/{cc_id}/members/{user_id}", status_code=204)
def remove_member(
    cc_id: UUID,
    user_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    member = (
        db.query(CostCenterMember)
        .filter(CostCenterMember.cost_center_id == cc_id, CostCenterMember.user_id == user_id)
        .first()
    )
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")
    db.delete(member)
    log_action(db, entity_type="CostCenter", entity_id=cc_id, action="member_removed",
               user_id=current_user.id, details={"removed_user_id": str(user_id)})
    db.commit()
