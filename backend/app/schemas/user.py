from uuid import UUID

from pydantic import BaseModel, EmailStr

from ..models.user import UserRole


class UserRead(BaseModel):
    id: UUID
    email: str
    display_name: str
    role: UserRole
    is_active: bool

    model_config = {"from_attributes": True}


class UserUpdateRole(BaseModel):
    role: UserRole
