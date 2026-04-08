"""
TMF632 Individual Router — /tmApi/partyManagement/v4/individual
Full CRUD with TMF-compliant URL patterns, status codes, and error responses.
"""
from fastapi import APIRouter, Depends, HTTPException, Query, Request, BackgroundTasks
from fastapi.responses import Response
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime, timezone
import uuid

from ..database import get_db, IndividualDB, AuditLogDB
from ..schemas.party import Individual, IndividualCreate, IndividualPatch, KYCStatus
from ..tmf_base import TMFError, utcnow
from ..core.auth import get_current_user, require_scope, TokenData
from ..core.events import publish_event
from ..schemas.events import PartyEventTypes

router = APIRouter(
    prefix="/tmApi/partyManagement/v4/individual",
    tags=["Individual"],
)


def make_href(request: Request, individual_id: str) -> str:
    base = str(request.base_url).rstrip("/")
    return f"{base}/tmApi/partyManagement/v4/individual/{individual_id}"


def db_to_schema(record: IndividualDB) -> Individual:
    """Convert ORM record → Pydantic Individual schema."""
    return Individual(
        id=record.id,
        href=record.href,
        lastUpdate=record.last_update,
        givenName=record.given_name,
        familyName=record.family_name,
        fullName=record.full_name,
        title=record.title,
        gender=record.gender,
        maritalStatus=record.marital_status,
        birthDate=record.birth_date,
        birthPlace=record.birth_place,
        nationality=record.nationality,
        countryOfBirth=record.country_of_birth,
        status=record.status,
        contactMedium=record.contact_mediums or [],
        identityDocument=record.identity_documents or [],
        taxDefinition=record.tax_definitions or [],
        externalReference=record.external_references or [],
        characteristic=record.characteristic or [],
        relatedParty=record.related_party or [],
        taxId=record.tax_id,
        kycStatus=record.kyc_status,
        riskRating=record.risk_rating,
        riskScore=record.risk_score,
        riskSummary=record.risk_summary,
        kycFlags=record.kyc_flags or [],
        kycRecommendedAction=record.kyc_recommended_action,
        amlCleared=record.aml_cleared,
        pepStatus=record.pep_status,
        sanctionsChecked=record.sanctions_checked,
        auditLog=record.audit_log or [],
    )


def add_audit_entry(db: Session, entity_id: str, action: str, user: TokenData,
                    changed_fields: List[str] = None, request: Request = None):
    """Write an immutable audit entry for regulatory compliance."""
    entry = AuditLogDB(
        id=str(uuid.uuid4()),
        entity_type="Individual",
        entity_id=entity_id,
        action=action,
        performed_by=user.email,
        changed_fields=changed_fields or [],
        ip_address=request.client.host if request and request.client else None,
    )
    db.add(entry)


# ─── GET /individual — list with filtering ────────────────────

@router.get(
    "",
    response_model=List[Individual],
    summary="List individuals",
    description="""
    Returns a paginated list of Individual resources.
    Supports TMF-standard filtering, field selection, and pagination.

    **Scopes required:** `party:read`
    """,
)
async def list_individuals(
    # TMF-standard query params
    fields: Optional[str] = Query(None, description="Comma-separated field selection, e.g. id,givenName,kycStatus"),
    offset: int = Query(0, ge=0, description="Pagination offset"),
    limit: int = Query(20, ge=1, le=100, description="Page size (max 100)"),
    # Domain filters
    given_name: Optional[str] = Query(None, alias="givenName"),
    family_name: Optional[str] = Query(None, alias="familyName"),
    nationality: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    kyc_status: Optional[str] = Query(None, alias="kycStatus"),
    risk_rating: Optional[str] = Query(None, alias="riskRating"),
    aml_cleared: Optional[bool] = Query(None, alias="amlCleared"),
    db: Session = Depends(get_db),
    _user: TokenData = Depends(require_scope("party:read")),
):
    query = db.query(IndividualDB)

    if given_name:
        query = query.filter(IndividualDB.given_name.ilike(f"%{given_name}%"))
    if family_name:
        query = query.filter(IndividualDB.family_name.ilike(f"%{family_name}%"))
    if nationality:
        query = query.filter(IndividualDB.nationality == nationality)
    if status:
        query = query.filter(IndividualDB.status == status)
    if kyc_status:
        query = query.filter(IndividualDB.kyc_status == kyc_status)
    if risk_rating:
        query = query.filter(IndividualDB.risk_rating == risk_rating)
    if aml_cleared is not None:
        query = query.filter(IndividualDB.aml_cleared == aml_cleared)

    records = query.order_by(IndividualDB.last_update.desc()).offset(offset).limit(limit).all()
    return [db_to_schema(r) for r in records]


# ─── GET /individual/{id} ─────────────────────────────────────

@router.get(
    "/{individual_id}",
    response_model=Individual,
    summary="Retrieve an Individual",
)
async def get_individual(
    individual_id: str,
    db: Session = Depends(get_db),
    _user: TokenData = Depends(require_scope("party:read")),
):
    record = db.query(IndividualDB).filter(IndividualDB.id == individual_id).first()
    if not record:
        raise HTTPException(
            status_code=404,
            detail=TMFError(code="404", reason="Not Found",
                           message=f"Individual {individual_id} not found", status="404").model_dump(by_alias=True),
        )
    return db_to_schema(record)


# ─── POST /individual — create (201) ──────────────────────────

@router.post(
    "",
    response_model=Individual,
    status_code=201,
    summary="Create an Individual",
    description="""
    Creates a new Individual (customer) record.
    Returns **201 Created** with the full resource including server-generated fields.
    Automatically queues an AI KYC risk assessment via the gateway.

    **Scopes required:** `party:write`
    """,
)
async def create_individual(
    data: IndividualCreate,
    background_tasks: BackgroundTasks,
    request: Request,
    db: Session = Depends(get_db),
    user: TokenData = Depends(require_scope("party:write")),
):
    individual_id = str(uuid.uuid4())
    now = utcnow()

    record = IndividualDB(
        id=individual_id,
        href=make_href(request, individual_id),
        given_name=data.given_name,
        family_name=data.family_name,
        full_name=data.full_name,
        title=data.title,
        gender=data.gender.value if data.gender else None,
        marital_status=data.marital_status.value if data.marital_status else None,
        birth_date=str(data.birth_date) if data.birth_date else None,
        birth_place=data.birth_place,
        nationality=data.nationality,
        country_of_birth=data.country_of_birth,
        status="initialized",
        kyc_status="pending",
        aml_cleared=False,
        pep_status=False,
        sanctions_checked=False,
        tax_id=data.tax_id,
        contact_mediums=[cm.model_dump(by_alias=True, mode='json') for cm in data.contact_mediums],
        identity_documents=[doc.model_dump(by_alias=True, mode='json') for doc in data.identity_documents],
        tax_definitions=[td.model_dump(by_alias=True, mode='json') for td in data.tax_definitions],
        external_references=[er.model_dump(by_alias=True, mode='json') for er in data.external_references],
        characteristic=[c.model_dump(by_alias=True, mode='json') for c in data.characteristic],
        related_party=[rp.model_dump(by_alias=True, mode='json') for rp in data.related_party],
        audit_log=[],
        last_update=now,
    )

    db.add(record)
    add_audit_entry(db, individual_id, "CREATE", user, request=request)
    db.commit()
    db.refresh(record)

    result = db_to_schema(record)

    # Publish TMF688 creation event to subscribers
    background_tasks.add_task(
        publish_event, db, PartyEventTypes.INDIVIDUAL_CREATE,
        result.model_dump(by_alias=True, mode="json")
    )

    return result


# ─── PATCH /individual/{id} — partial update ──────────────────

@router.patch(
    "/{individual_id}",
    response_model=Individual,
    summary="Partially update an Individual",
    description="""
    Updates only the fields provided in the request body.
    Uses **PATCH** per TMF630 design guidelines — never PUT.
    Publishes a TMF688 AttributeValueChange event.

    **Scopes required:** `party:write`
    """,
)
async def patch_individual(
    individual_id: str,
    data: IndividualPatch,
    background_tasks: BackgroundTasks,
    request: Request,
    db: Session = Depends(get_db),
    user: TokenData = Depends(require_scope("party:write")),
):
    record = db.query(IndividualDB).filter(IndividualDB.id == individual_id).first()
    if not record:
        raise HTTPException(
            status_code=404,
            detail=TMFError(code="404", reason="Not Found",
                           message=f"Individual {individual_id} not found", status="404").model_dump(by_alias=True),
        )

    # Only update fields that were actually sent — exclude_unset is the key
    updates = data.model_dump(by_alias=False, exclude_unset=True)
    changed_fields = list(updates.keys())

    field_map = {
        "given_name": "given_name", "family_name": "family_name",
        "full_name": "full_name", "title": "title",
        "gender": "gender", "marital_status": "marital_status",
        "birth_date": "birth_date", "nationality": "nationality",
        "status": "status", "tax_id": "tax_id",
        "kyc_status": "kyc_status", "risk_rating": "risk_rating",
        "risk_score": "risk_score", "risk_summary": "risk_summary",
        "aml_cleared": "aml_cleared",
        "pep_status": "pep_status", "kyc_flags": "kyc_flags",
        "kyc_recommended_action": "kyc_recommended_action",
        "contact_mediums": "contact_mediums",
        "identity_documents": "identity_documents",
    }

    for field, db_field in field_map.items():
        if field in updates:
            val = updates[field]
            if hasattr(val, "value"):
                val = val.value
            if field == "contact_mediums" and val is not None:
                val = [cm.model_dump(by_alias=True, mode='json') if hasattr(cm, "model_dump") else cm for cm in val]
            if field == "identity_documents" and val is not None:
                val = [doc.model_dump(by_alias=True, mode='json') if hasattr(doc, "model_dump") else doc for doc in val]
            setattr(record, db_field, val)

    record.last_update = utcnow()
    add_audit_entry(db, individual_id, "PATCH", user, changed_fields, request)
    db.commit()
    db.refresh(record)

    result = db_to_schema(record)

    # Determine event type
    event_type = PartyEventTypes.INDIVIDUAL_STATE_CHANGE if "status" in updates else \
                 PartyEventTypes.KYC_STATUS_CHANGE if "kyc_status" in updates else \
                 PartyEventTypes.INDIVIDUAL_CHANGE

    background_tasks.add_task(
        publish_event, db, event_type,
        result.model_dump(by_alias=True, mode="json")
    )

    return result


# ─── DELETE /individual/{id} — 204 No Content ─────────────────

@router.delete(
    "/{individual_id}",
    status_code=204,
    summary="Delete an Individual",
    description="Deletes the Individual. Returns **204 No Content** per TMF spec.",
)
async def delete_individual(
    individual_id: str,
    background_tasks: BackgroundTasks,
    request: Request,
    db: Session = Depends(get_db),
    user: TokenData = Depends(require_scope("party:write")),
):
    record = db.query(IndividualDB).filter(IndividualDB.id == individual_id).first()
    if not record:
        raise HTTPException(
            status_code=404,
            detail=TMFError(code="404", reason="Not Found",
                           message=f"Individual {individual_id} not found", status="404").model_dump(by_alias=True),
        )

    snapshot = db_to_schema(record).model_dump(by_alias=True, mode="json")
    add_audit_entry(db, individual_id, "DELETE", user, request=request)
    db.delete(record)
    db.commit()

    background_tasks.add_task(publish_event, db, PartyEventTypes.INDIVIDUAL_DELETE, snapshot)
    return Response(status_code=204)
