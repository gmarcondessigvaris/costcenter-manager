import os
import shutil
import uuid
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session

from ..config import settings
from ..database import get_db
from ..dependencies import get_current_user, require_finance
from ..models.budget import BudgetLine, BudgetUpload, Project, Vendor
from ..models.cost_center import CostCenter
from ..models.user import User
from ..schemas.budget import BudgetUploadRead, ProjectCreate, ProjectRead, VendorCreate, VendorRead
from ..services.audit import log_action
from ..services.budget_parser import parse_budget_excel

router = APIRouter(tags=["budgets"])


# ── Vendors ────────────────────────────────────────────────────────────────────

@router.get("/vendors", response_model=list[VendorRead])
def list_vendors(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return db.query(Vendor).filter(Vendor.is_active == True).order_by(Vendor.name).all()


@router.post("/vendors", response_model=VendorRead, status_code=201)
def create_vendor(
    body: VendorCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_finance),
):
    existing = db.query(Vendor).filter(Vendor.name.ilike(body.name)).first()
    if existing:
        return existing
    vendor = Vendor(name=body.name.strip())
    db.add(vendor)
    db.commit()
    db.refresh(vendor)
    return vendor


# ── Budget uploads ─────────────────────────────────────────────────────────────

@router.post("/cost-centers/{cc_id}/budgets", response_model=BudgetUploadRead, status_code=201)
def upload_budget(
    cc_id: UUID,
    fiscal_year: str = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_finance),
):
    cc = db.get(CostCenter, cc_id)
    if not cc:
        raise HTTPException(status_code=404, detail="Cost center not found")

    if not file.filename.endswith((".xlsx", ".xls")):
        raise HTTPException(status_code=400, detail="Only Excel files (.xlsx / .xls) are accepted")

    upload_dir = os.path.join(settings.UPLOAD_DIR, "budgets", str(cc_id))
    os.makedirs(upload_dir, exist_ok=True)
    file_id = uuid.uuid4()
    file_path = os.path.join(upload_dir, f"{file_id}_{file.filename}")

    with open(file_path, "wb") as f:
        shutil.copyfileobj(file.file, f)

    # Deactivate previous budget for same year
    db.query(BudgetUpload).filter(
        BudgetUpload.cost_center_id == cc_id,
        BudgetUpload.fiscal_year == fiscal_year,
    ).update({"is_active": False})

    budget_upload = BudgetUpload(
        cost_center_id=cc_id,
        fiscal_year=fiscal_year,
        file_path=file_path,
        original_filename=file.filename,
        uploaded_by_id=current_user.id,
    )
    db.add(budget_upload)
    db.flush()

    lines = parse_budget_excel(file_path)
    for line in lines:
        db.add(BudgetLine(
            cost_center_id=cc_id,
            budget_upload_id=budget_upload.id,
            code=line.code,
            name=line.name,
            allocated_amount=line.allocated_amount,
        ))

    log_action(db, entity_type="BudgetUpload", entity_id=budget_upload.id, action="uploaded",
               user_id=current_user.id,
               details={"cost_center_id": str(cc_id), "fiscal_year": fiscal_year, "lines": len(lines)})
    db.commit()
    db.refresh(budget_upload)
    return budget_upload


@router.get("/cost-centers/{cc_id}/budgets", response_model=list[BudgetUploadRead])
def list_budget_uploads(
    cc_id: UUID,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    return (
        db.query(BudgetUpload)
        .filter(BudgetUpload.cost_center_id == cc_id)
        .order_by(BudgetUpload.created_at.desc())
        .all()
    )


@router.get("/cost-centers/{cc_id}/budget-lines", response_model=list)
def list_budget_lines(
    cc_id: UUID,
    fiscal_year: str | None = None,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    from ..schemas.budget import BudgetLineRead

    query = (
        db.query(BudgetLine)
        .join(BudgetUpload)
        .filter(BudgetLine.cost_center_id == cc_id, BudgetLine.is_active == True)
    )
    if fiscal_year:
        query = query.filter(BudgetUpload.fiscal_year == fiscal_year, BudgetUpload.is_active == True)
    else:
        query = query.filter(BudgetUpload.is_active == True)

    return query.order_by(BudgetLine.code).all()


# ── Projects ──────────────────────────────────────────────────────────────────

@router.get("/cost-centers/{cc_id}/projects", response_model=list[ProjectRead])
def list_projects(
    cc_id: UUID,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    return db.query(Project).filter(Project.cost_center_id == cc_id, Project.is_active == True).all()


@router.post("/cost-centers/{cc_id}/projects", response_model=ProjectRead, status_code=201)
def create_project(
    cc_id: UUID,
    body: ProjectCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    cc = db.get(CostCenter, cc_id)
    if not cc:
        raise HTTPException(status_code=404, detail="Cost center not found")
    project = Project(
        cost_center_id=cc_id,
        code=body.code,
        name=body.name,
        description=body.description,
        created_by_id=current_user.id,
    )
    db.add(project)
    db.commit()
    db.refresh(project)
    return project
