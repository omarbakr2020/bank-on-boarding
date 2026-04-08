"""
TMF688 Hub Router — /tmApi/partyManagement/v4/hub
Implements the pub/subscribe notification pattern.
"""
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import Response
from sqlalchemy.orm import Session
from typing import List
import uuid

from ..database import get_db, HubSubscriptionDB
from ..schemas.events import HubCreate, HubSubscription
from ..tmf_base import TMFError, utcnow
from ..core.auth import get_current_user, TokenData

router = APIRouter(
    prefix="/tmApi/partyManagement/v4/hub",
    tags=["Hub — TMF688 Events"],
)


@router.post(
    "",
    response_model=HubSubscription,
    status_code=201,
    summary="Subscribe to party events",
    description="""
    Register a webhook to receive TMF event notifications when party data changes.

    **Event types:**
    - `IndividualCreateEvent` — new customer created
    - `IndividualAttributeValueChangeEvent` — customer data updated
    - `IndividualStateChangeEvent` — customer lifecycle state changed
    - `KYCStatusChangeEvent` — KYC status updated (banking extension)
    - `OrganizationCreateEvent` — new organization created
    - `OrganizationAttributeValueChangeEvent` — organization updated

    Leave `query` empty to receive all event types.
    """,
)
async def subscribe(
    data: HubCreate,
    request: Request,
    db: Session = Depends(get_db),
    _user: TokenData = Depends(get_current_user),
):
    sub_id = str(uuid.uuid4())
    record = HubSubscriptionDB(
        id=sub_id,
        callback=data.callback,
        query=data.query,
        active=True,
    )
    db.add(record)
    db.commit()

    return HubSubscription(
        id=sub_id,
        href=f"{str(request.base_url).rstrip('/')}/tmApi/partyManagement/v4/hub/{sub_id}",
        callback=data.callback,
        query=data.query,
    )


@router.get(
    "",
    response_model=List[HubSubscription],
    summary="List all hub subscriptions",
)
async def list_subscriptions(
    db: Session = Depends(get_db),
    _user: TokenData = Depends(get_current_user),
):
    records = db.query(HubSubscriptionDB).filter(HubSubscriptionDB.active == True).all()
    return [
        HubSubscription(id=r.id, callback=r.callback, query=r.query)
        for r in records
    ]


@router.delete(
    "/{hub_id}",
    status_code=204,
    summary="Unsubscribe from events",
)
async def unsubscribe(
    hub_id: str,
    db: Session = Depends(get_db),
    _user: TokenData = Depends(get_current_user),
):
    record = db.query(HubSubscriptionDB).filter(HubSubscriptionDB.id == hub_id).first()
    if not record:
        raise HTTPException(
            status_code=404,
            detail=TMFError(code="404", reason="Not Found",
                message=f"Hub subscription {hub_id} not found", status="404").model_dump(by_alias=True),
        )
    record.active = False
    db.commit()
    return Response(status_code=204)
