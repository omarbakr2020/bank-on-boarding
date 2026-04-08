"""
Database setup — SQLAlchemy 2.0 async-compatible ORM.
Stores TMF632 party data in PostgreSQL.
"""
from sqlalchemy import (
    create_engine, Column, String, Boolean, Float,
    DateTime, Text, JSON, Index, event
)
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, Session
from sqlalchemy.sql import func
from datetime import datetime, timezone
import os

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://bankonboard:bankonboard@localhost:5432/bankonboard"
)

engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,       # reconnect if connection dropped
    pool_size=10,
    max_overflow=20,
    echo=os.getenv("SQL_ECHO", "false").lower() == "true",
)

SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False)
Base = declarative_base()


def get_db():
    """FastAPI dependency — yields a DB session, always closes on exit."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ─── ORM Models ───────────────────────────────────────────────

class IndividualDB(Base):
    """PostgreSQL table for TMF632 Individual records."""
    __tablename__ = "individuals"

    # Primary key + TMF mandatory
    id = Column(String(36), primary_key=True, index=True)
    href = Column(String(500))

    # Core identity
    given_name = Column(String(100), nullable=False, index=True)
    family_name = Column(String(100), nullable=False, index=True)
    full_name = Column(String(250))
    title = Column(String(20))
    gender = Column(String(20))
    marital_status = Column(String(30))
    birth_date = Column(String(10))     # stored as ISO date string
    birth_place = Column(String(100))
    nationality = Column(String(100), index=True)
    country_of_birth = Column(String(100))
    status = Column(String(30), default="initialized", index=True)

    # Banking KYC / AML
    kyc_status = Column(String(30), default="pending", index=True)
    risk_rating = Column(String(20))
    risk_score = Column(Float)
    risk_summary = Column(Text)
    kyc_flags = Column(JSON, default=list)
    kyc_recommended_action = Column(String(50))
    aml_cleared = Column(Boolean, default=False, index=True)
    pep_status = Column(Boolean, default=False)
    sanctions_checked = Column(Boolean, default=False)
    tax_id = Column(String(50))

    # JSON blobs for nested structures
    contact_mediums = Column(JSON, default=list)
    identity_documents = Column(JSON, default=list)
    tax_definitions = Column(JSON, default=list)
    external_references = Column(JSON, default=list)
    characteristic = Column(JSON, default=list)
    related_party = Column(JSON, default=list)
    audit_log = Column(JSON, default=list)

    # Timestamps
    last_update = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Composite index for common query patterns
    __table_args__ = (
        Index("ix_individual_name", "family_name", "given_name"),
        Index("ix_individual_kyc", "kyc_status", "risk_rating"),
    )


class OrganizationDB(Base):
    """PostgreSQL table for TMF632 Organization records."""
    __tablename__ = "organizations"

    id = Column(String(36), primary_key=True, index=True)
    href = Column(String(500))

    name = Column(String(250), nullable=False, index=True)
    trading_name = Column(String(250))
    organization_type = Column(String(50))
    is_legal_entity = Column(Boolean, default=True)
    is_head_office = Column(Boolean, default=True)
    name_type = Column(String(50))
    registration_number = Column(String(100), index=True)
    status = Column(String(30), default="initialized", index=True)

    tax_id = Column(String(50))
    kyc_status = Column(String(30), default="pending", index=True)
    risk_rating = Column(String(20))
    risk_score = Column(Float)
    risk_summary = Column(Text)
    aml_cleared = Column(Boolean, default=False)

    contact_mediums = Column(JSON, default=list)
    related_party = Column(JSON, default=list)
    external_references = Column(JSON, default=list)
    characteristic = Column(JSON, default=list)
    tax_definitions = Column(JSON, default=list)
    audit_log = Column(JSON, default=list)

    last_update = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class HubSubscriptionDB(Base):
    """TMF688 hub subscription records."""
    __tablename__ = "hub_subscriptions"

    id = Column(String(36), primary_key=True)
    callback = Column(String(1000), nullable=False)
    query = Column(String(500))
    active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class AuditLogDB(Base):
    """
    Immutable system-wide audit log for regulatory compliance.
    Separate table (not JSON column) for queryability.
    """
    __tablename__ = "audit_log"

    id = Column(String(36), primary_key=True)
    entity_type = Column(String(50), nullable=False, index=True)
    entity_id = Column(String(36), nullable=False, index=True)
    action = Column(String(50), nullable=False)
    performed_by = Column(String(100), nullable=False)
    changed_fields = Column(JSON, default=list)
    ip_address = Column(String(45))
    reason = Column(Text)
    timestamp = Column(DateTime(timezone=True), server_default=func.now(), index=True)
