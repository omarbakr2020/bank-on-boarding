"""
TMF632 Organization Router — /tmApi/partyManagement/v4/organization
"""
from fastapi import APIRouter, Depends, HTTPException, Query, Request, BackgroundTasks
from fastapi.responses import Response
from sqlalchemy.orm import Session
from typing import List, Optional
import uuid

from ..database import get_db, OrganizationDB, AuditLogDB
from ..schemas.party import Organization, OrganizationCreate, OrganizationPatch
from ..tmf_base import TMFError, utcnow
from ..core.auth import get_current_user, require_scope, TokenData
from ..core.events import publish_event
from ..schemas.events import PartyEventTypes

router = APIRouter(
    prefix="/tmApi/partyManagement/v4/organization",
    tags=["Organization"],
)


def make_href(request: Request, org_id: str) -> str:
    return f"{str(request.base_url).rstrip('/')}/tmApi/partyManagement/v4/organization/{org_id}"


def db_to_schema(record: OrganizationDB) -> Organization:
    return Organization(
        id=record.id,
        href=record.href,
        lastUpdate=record.last_update,
        name=record.name,
        tradingName=record.trading_name,
        organizationType=record.organization_type,
        isLegalEntity=record.is_legal_entity,
        isHeadOffice=record.is_head_office,
        nameType=record.name_type,
        registrationNumber=record.registration_number,
        status=record.status,
        taxId=record.tax_id,
        contactMedium=record.contact_mediums or [],
        relatedParty=record.related_party or [],
        externalReference=record.external_references or [],
        characteristic=record.characteristic or [],
        taxDefinition=record.tax_definitions or [],
        kycStatus=record.kyc_status,
        riskRating=record.risk_rating,
        riskScore=record.risk_score,
        riskSummary=record.risk_summary,
        amlCleared=record.aml_cleared,
        auditLog=record.audit_log or [],
    )


@router.get("", response_model=List[Organization], summary="List organizations")
async def list_organizations(
    offset: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    name: Optional[str] = Query(None),
    kyc_status: Optional[str] = Query(None, alias="kycStatus"),
    db: Session = Depends(get_db),
    _user: TokenData = Depends(require_scope("party:read")),
):
    query = db.query(OrganizationDB)
    if name:
        query = query.filter(OrganizationDB.name.ilike(f"%{name}%"))
    if kyc_status:
        query = query.filter(OrganizationDB.kyc_status == kyc_status)
    records = query.order_by(OrganizationDB.last_update.desc()).offset(offset).limit(limit).all()
    return [db_to_schema(r) for r in records]


@router.get("/{org_id}", response_model=Organization, summary="Retrieve an Organization")
async def get_organization(
    org_id: str,
    db: Session = Depends(get_db),
    _user: TokenData = Depends(require_scope("party:read")),
):
    record = db.query(OrganizationDB).filter(OrganizationDB.id == org_id).first()
    if not record:
        raise HTTPException(status_code=404,
            detail=TMFError(code="404", reason="Not Found",
                message=f"Organization {org_id} not found", status="404").model_dump(by_alias=True))
    return db_to_schema(record)


@router.post("", response_model=Organization, status_code=201, summary="Create an Organization")
async def create_organization(
    data: OrganizationCreate,
    background_tasks: BackgroundTasks,
    request: Request,
    db: Session = Depends(get_db),
    user: TokenData = Depends(require_scope("party:write")),
):
    org_id = str(uuid.uuid4())
    record = OrganizationDB(
        id=org_id,
        href=make_href(request, org_id),
        name=data.name,
        trading_name=data.trading_name,
        organization_type=data.organization_type,
        is_legal_entity=data.is_legal_entity,
        is_head_office=data.is_head_office,
        name_type=data.name_type,
        registration_number=data.registration_number,
        status="initialized",
        kyc_status="pending",
        aml_cleared=False,
        tax_id=data.tax_id,
        contact_mediums=[cm.model_dump(by_alias=True, mode='json') for cm in data.contact_mediums],
        related_party=[rp.model_dump(by_alias=True, mode='json') for rp in data.related_party],
        external_references=[er.model_dump(by_alias=True, mode='json') for er in data.external_references],
        characteristic=[c.model_dump(by_alias=True, mode='json') for c in data.characteristic],
        tax_definitions=[td.model_dump(by_alias=True, mode='json') for td in data.tax_definitions],
        audit_log=[],
        last_update=utcnow(),
    )
    db.add(record)
    db.add(AuditLogDB(id=str(uuid.uuid4()), entity_type="Organization", entity_id=org_id,
                      action="CREATE", performed_by=user.email, changed_fields=[]))
    db.commit()
    db.refresh(record)
    result = db_to_schema(record)
    background_tasks.add_task(publish_event, db, PartyEventTypes.ORGANIZATION_CREATE,
                               result.model_dump(by_alias=True, mode="json"))
    return result


@router.patch("/{org_id}", response_model=Organization, summary="Partially update an Organization")
async def patch_organization(
    org_id: str,
    data: OrganizationPatch,
    background_tasks: BackgroundTasks,
    request: Request,
    db: Session = Depends(get_db),
    user: TokenData = Depends(require_scope("party:write")),
):
    record = db.query(OrganizationDB).filter(OrganizationDB.id == org_id).first()
    if not record:
        raise HTTPException(status_code=404,
            detail=TMFError(code="404", reason="Not Found",
                message=f"Organization {org_id} not found", status="404").model_dump(by_alias=True))

    updates = data.model_dump(by_alias=False, exclude_unset=True)
    for field, val in updates.items():
        if hasattr(record, field):
            setattr(record, field, val.value if hasattr(val, "value") else val)

    record.last_update = utcnow()
    db.add(AuditLogDB(id=str(uuid.uuid4()), entity_type="Organization", entity_id=org_id,
                      action="PATCH", performed_by=user.email, changed_fields=list(updates.keys())))
    db.commit()
    db.refresh(record)
    result = db_to_schema(record)
    background_tasks.add_task(publish_event, db, PartyEventTypes.ORGANIZATION_CHANGE,
                               result.model_dump(by_alias=True, mode="json"))
    return result


@router.delete("/{org_id}", status_code=204, summary="Delete an Organization")
async def delete_organization(
    org_id: str,
    db: Session = Depends(get_db),
    user: TokenData = Depends(require_scope("party:write")),
):
    record = db.query(OrganizationDB).filter(OrganizationDB.id == org_id).first()
    if not record:
        raise HTTPException(status_code=404,
            detail=TMFError(code="404", reason="Not Found", message=f"Organization {org_id} not found",
                           status="404").model_dump(by_alias=True))
    db.delete(record)
    db.commit()
    return Response(status_code=204)
