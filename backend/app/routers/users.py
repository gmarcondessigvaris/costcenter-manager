from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..dependencies import get_current_user, require_admin
from ..models.user import User
from ..schemas.user import UserRead, UserUpdateRole

router = APIRouter(prefix="/users", tags=["users"])


@router.get("", response_model=list[UserRead])
def list_users(
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    return db.query(User).filter(User.is_active == True).all()


@router.get("/search", response_model=list[UserRead])
def search_users(
    q: str = "",
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    query = db.query(User).filter(User.is_active == True)
    if q:
        query = query.filter(
            User.display_name.ilike(f"%{q}%") | User.email.ilike(f"%{q}%")
        )
    return query.limit(20).all()


@router.put("/{user_id}/role", response_model=UserRead)
def update_role(
    user_id: UUID,
    body: UserUpdateRole,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.role = body.role
    db.commit()
    db.refresh(user)
    return user
