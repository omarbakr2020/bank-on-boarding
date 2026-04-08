"""
TMF688 Event Publisher — sends webhooks to hub subscribers.
"""
from sqlalchemy.orm import Session
from ..database import HubSubscriptionDB
from ..schemas.events import TMFEvent, EventPayload, HubCreate, HubSubscription, PartyEventTypes
from ..tmf_base import utcnow
import httpx
import uuid
import logging

logger = logging.getLogger(__name__)


async def publish_event(db: Session, event_type: str, entity: dict) -> None:
    """
    Publish a TMF event to all matching hub subscribers.
    Fires-and-forgets — failures are logged but don't affect the caller.
    In production: use a message queue with retry/dead-letter.
    """
    subscriptions = db.query(HubSubscriptionDB).filter(HubSubscriptionDB.active == True).all()
    if not subscriptions:
        return

    event = TMFEvent(
        id=str(uuid.uuid4()),
        event_type=event_type,
        event=EventPayload(
            individual=entity if "givenName" in entity else None,
            organization=entity if "name" in entity and "givenName" not in entity else None,
        ),
    )
    payload = event.model_dump(by_alias=True, mode="json")

    async with httpx.AsyncClient(timeout=5.0) as client:
        for sub in subscriptions:
            # Apply query filter if set
            if sub.query and event_type not in sub.query:
                continue
            try:
                response = await client.post(sub.callback, json=payload)
                logger.info(f"Event delivered: type={event_type} subscriber={sub.id} status={response.status_code}")
            except Exception as exc:
                logger.error(f"Event delivery failed: subscriber={sub.id} error={exc}")
                # Production: push to dead-letter queue for retry
