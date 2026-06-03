from uuid import UUID

from pydantic import BaseModel

from ..models.cost_center import MemberRole
from .user import UserRead


class CostCenterCreate(BaseModel):
    code: str
    name: str


class CostCenterUpdate(BaseModel):
    name: str | None = None
    is_active: bool | None = None


class CostCenterMemberRead(BaseModel):
    id: UUID
    user: UserRead
    role: MemberRole

    model_config = {"from_attributes": True}


class CostCenterRead(BaseModel):
    id: UUID
    code: str
    name: str
    is_active: bool
    members: list[CostCenterMemberRead] = []

    model_config = {"from_attributes": True}


class MemberAdd(BaseModel):
    user_id: UUID
    role: MemberRole = MemberRole.owner
