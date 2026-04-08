"""
TMF688 Event Management — Hub subscription and event publishing.
Implements the TMF pub/subscribe notification pattern.

Banking use:
  - Credit check system subscribes to IndividualAttributeValueChangeEvent
  - Fraud detection subscribes to KYC status changes
  - Downstream banking core gets notified when onboarding completes
"""
from pydantic import BaseModel, Field, ConfigDict
from typing import Optional, Any
from datetime import datetime, timezone
import uuid


def utcnow():
    return datetime.now(timezone.utc)


class HubCreate(BaseModel):
    """Request body to subscribe to party events — POST /hub"""
    model_config = ConfigDict(populate_by_name=True)
    callback: str = Field(..., description="Webhook URL to deliver events to",
                          examples=["https://credit-service.bank.io/webhooks/party"])
    query: Optional[str] = Field(
        None,
        description="OData-style filter, e.g. eventType=IndividualAttributeValueChangeEvent",
    )


class HubSubscription(HubCreate):
    """A registered hub subscription."""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    href: Optional[str] = None
    created_at: datetime = Field(default_factory=utcnow, alias="createdAt")
    type: str = Field("Hub", alias="@type")

    model_config = ConfigDict(populate_by_name=True)


class EventPayload(BaseModel):
    """Inner event payload — the changed entity."""
    model_config = ConfigDict(populate_by_name=True)
    individual: Optional[Any] = None
    organization: Optional[Any] = None


class TMFEvent(BaseModel):
    """
    Standard TMF event envelope.
    Delivered to all hub subscribers via webhook.
    """
    model_config = ConfigDict(populate_by_name=True)
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    href: Optional[str] = None
    correlation_id: Optional[str] = Field(None, alias="correlationId")
    domain: str = Field("PartyManagement")
    title: Optional[str] = None
    description: Optional[str] = None
    time_occurred: datetime = Field(default_factory=utcnow, alias="timeOccurred")
    priority: str = Field("Normal")
    source: Optional[Any] = None
    reported_by: Optional[Any] = Field(None, alias="reportedBy")
    related_party: Optional[Any] = Field(None, alias="relatedParty")
    event_type: str = Field(..., alias="eventType")
    event: EventPayload
    type: str = Field("Event", alias="@type")


# TMF688 standard event types for Party Management
class PartyEventTypes:
    INDIVIDUAL_CREATE = "IndividualCreateEvent"
    INDIVIDUAL_CHANGE = "IndividualAttributeValueChangeEvent"
    INDIVIDUAL_DELETE = "IndividualDeleteEvent"
    INDIVIDUAL_STATE_CHANGE = "IndividualStateChangeEvent"
    ORGANIZATION_CREATE = "OrganizationCreateEvent"
    ORGANIZATION_CHANGE = "OrganizationAttributeValueChangeEvent"
    ORGANIZATION_DELETE = "OrganizationDeleteEvent"
    KYC_STATUS_CHANGE = "KYCStatusChangeEvent"  # Banking extension
