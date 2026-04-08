"""
TMF Base Models — implements TMF630 REST Design Guidelines.
Every TMF entity MUST inherit from TMFEntity.
"""
from pydantic import BaseModel, Field, ConfigDict
from typing import Optional, Any
from datetime import datetime, timezone
import uuid


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def new_uuid() -> str:
    return str(uuid.uuid4())


class TMFEntity(BaseModel):
    """
    Base class for all TMF Open API resources.
    Implements mandatory fields defined in TMF630 REST Design Guidelines.

    All TMF entities MUST have:
      - id: unique identifier (UUID v4)
      - href: self-referencing URL
      - @type: exact class name (enables runtime polymorphism)
      - @baseType: parent class name (type hierarchy)
      - @schemaLocation: URL to extended schema (if custom fields added)
      - lastUpdate: ISO 8601 datetime of last modification
    """

    model_config = ConfigDict(
        populate_by_name=True,
        json_encoders={datetime: lambda v: v.isoformat()},
    )

    id: Optional[str] = Field(
        default_factory=new_uuid,
        description="Unique identifier (UUID v4)",
        examples=["f3f4d6a2-1b2c-4e5f-8a9b-0c1d2e3f4a5b"],
    )
    href: Optional[str] = Field(
        None,
        description="Self-referencing URI to this resource",
        examples=["/tmApi/partyManagement/v4/individual/f3f4d6a2-1b2c-4e5f-8a9b-0c1d2e3f4a5b"],
    )
    type: Optional[str] = Field(
        None,
        alias="@type",
        description="When sub-classing, this defines the sub-class Extensible name",
    )
    base_type: Optional[str] = Field(
        None,
        alias="@baseType",
        description="When sub-classing, this defines the super-class",
    )
    schema_location: Optional[str] = Field(
        None,
        alias="@schemaLocation",
        description="A URI to a JSON-Schema file that defines additional attributes",
    )
    last_update: Optional[datetime] = Field(
        None,
        alias="lastUpdate",
        description="Date and time of the last update",
    )


class TMFError(BaseModel):
    """
    TMF standard error response. Used for all 4xx/5xx responses.
    Defined in TMF630 REST Design Guidelines.
    """
    code: str = Field(..., description="Application-specific error code")
    reason: str = Field(..., description="Short, human-readable summary")
    message: Optional[str] = Field(None, description="Detailed error message")
    status: str = Field(..., description="HTTP status code as string")
    reference_error: Optional[str] = Field(None, alias="referenceError")
    type: str = Field("Error", alias="@type")

    model_config = ConfigDict(populate_by_name=True)


class Money(BaseModel):
    """TMF Money type."""
    unit: str = Field(..., description="Currency (ISO 4217)", examples=["USD", "EUR", "EGP"])
    value: float = Field(..., description="Numeric amount")


class TimePeriod(BaseModel):
    """TMF TimePeriod — validity window for entities."""
    start_date_time: Optional[datetime] = Field(None, alias="startDateTime")
    end_date_time: Optional[datetime] = Field(None, alias="endDateTime")

    model_config = ConfigDict(populate_by_name=True)


class Characteristic(BaseModel):
    """TMF generic characteristic (name-value pair)."""
    name: str
    value: Optional[Any] = None
    value_type: Optional[str] = Field(None, alias="valueType")

    model_config = ConfigDict(populate_by_name=True)
