"""
TMF632 Party Management — Individual and Organization schemas.
Implements TM Forum Open API TMF632 v4.

Banking extensions:
  - KYC (Know Your Customer) status workflow
  - AML (Anti-Money Laundering) clearance
  - PEP (Politically Exposed Person) screening
  - Risk scoring from AI service
  - PSD2 consent tracking
  - GDPR data classification
"""
from pydantic import BaseModel, Field, ConfigDict
from typing import Optional, List
from datetime import datetime, date
from enum import Enum

from ..tmf_base import TMFEntity, TimePeriod, Characteristic


# ─── Enumerations ────────────────────────────────────────────

class IndividualStateType(str, Enum):
    """TMF632 lifecycle states for an Individual."""
    initialized = "initialized"
    validated = "validated"
    partially_validated = "partially validated"
    deceased = "deceased"


class KYCStatus(str, Enum):
    """Banking KYC workflow states."""
    pending = "pending"
    document_submitted = "document_submitted"
    in_review = "in_review"
    approved = "approved"
    rejected = "rejected"
    expired = "expired"


class RiskRating(str, Enum):
    low = "low"
    medium = "medium"
    high = "high"
    very_high = "very_high"


class GenderType(str, Enum):
    male = "male"
    female = "female"
    non_binary = "non_binary"
    undisclosed = "undisclosed"


class MaritalStatusType(str, Enum):
    married = "married"
    single = "single"
    divorced = "divorced"
    widowed = "widowed"
    domestic_partner = "domestic_partner"


class OrganizationStateType(str, Enum):
    initialized = "initialized"
    validated = "validated"
    closed = "closed"


# ─── Sub-entities ─────────────────────────────────────────────

class MediumCharacteristic(BaseModel):
    """Characteristics of a contact medium."""
    model_config = ConfigDict(populate_by_name=True)
    city: Optional[str] = None
    country: Optional[str] = None
    email_address: Optional[str] = Field(None, alias="emailAddress")
    phone_number: Optional[str] = Field(None, alias="phoneNumber")
    post_code: Optional[str] = Field(None, alias="postCode")
    state_or_province: Optional[str] = Field(None, alias="stateOrProvince")
    street1: Optional[str] = None
    street2: Optional[str] = None
    type: Optional[str] = Field(None, alias="@type")


class ContactMedium(BaseModel):
    """
    TMF632 ContactMedium — how to reach the party.
    Types: email, phone, postalAddress, fax
    """
    model_config = ConfigDict(populate_by_name=True)
    id: Optional[str] = None
    medium_type: str = Field(..., alias="mediumType", examples=["email", "phone", "postalAddress"])
    preferred: bool = False
    valid_for: Optional[TimePeriod] = Field(None, alias="validFor")
    characteristic: MediumCharacteristic


class ExternalReference(BaseModel):
    """Reference to an external system's record."""
    model_config = ConfigDict(populate_by_name=True)
    external_reference_type: Optional[str] = Field(None, alias="externalReferenceType")
    name: Optional[str] = None
    href: Optional[str] = None


class RelatedParty(BaseModel):
    """
    TMF generic RelatedParty — link between two parties.
    Used to link Individual ↔ Organization (e.g. customer of bank).
    """
    model_config = ConfigDict(populate_by_name=True)
    id: str
    href: Optional[str] = None
    name: Optional[str] = None
    role: Optional[str] = None
    type: Optional[str] = Field(None, alias="@type")
    referred_type: Optional[str] = Field(None, alias="@referredType")


class IdentityDocument(BaseModel):
    """KYC identity document — extends TMF ContactMedium concept."""
    model_config = ConfigDict(populate_by_name=True)
    id: Optional[str] = None
    document_type: str = Field(..., alias="documentType", examples=["national_id", "passport", "driving_license"])
    document_number: str = Field(..., alias="documentNumber")
    issuing_country: str = Field(..., alias="issuingCountry")
    issuing_authority: Optional[str] = Field(None, alias="issuingAuthority")
    issue_date: Optional[date] = Field(None, alias="issueDate")
    expiry_date: Optional[date] = Field(None, alias="expiryDate")
    verified: bool = False
    verified_at: Optional[datetime] = Field(None, alias="verifiedAt")
    verification_provider: Optional[str] = Field(None, alias="verificationProvider")


class TaxDefinition(BaseModel):
    """Tax exemption / definition for a party."""
    model_config = ConfigDict(populate_by_name=True)
    id: Optional[str] = None
    tax_type: Optional[str] = Field(None, alias="taxType")
    tax_rate: Optional[float] = Field(None, alias="taxRate")
    name: Optional[str] = None


class AuditEntry(BaseModel):
    """Immutable audit log entry for regulatory compliance."""
    model_config = ConfigDict(populate_by_name=True)
    timestamp: datetime
    action: str
    performed_by: str = Field(..., alias="performedBy")
    changed_fields: List[str] = Field(default_factory=list, alias="changedFields")
    ip_address: Optional[str] = Field(None, alias="ipAddress")
    reason: Optional[str] = None


# ─── TMF632 Individual ────────────────────────────────────────

class IndividualCreate(BaseModel):
    """
    Fields accepted when creating a new Individual.
    Does not include server-generated fields (id, href, lastUpdate).
    """
    model_config = ConfigDict(populate_by_name=True)

    # Core TMF632 fields
    given_name: str = Field(..., alias="givenName", min_length=1, max_length=100)
    family_name: str = Field(..., alias="familyName", min_length=1, max_length=100)
    full_name: Optional[str] = Field(None, alias="fullName", max_length=250)
    title: Optional[str] = Field(None, max_length=20, examples=["Mr", "Mrs", "Dr", "Prof"])
    gender: Optional[GenderType] = None
    marital_status: Optional[MaritalStatusType] = Field(None, alias="maritalStatus")
    birth_date: Optional[date] = Field(None, alias="birthDate")
    birth_place: Optional[str] = Field(None, alias="birthPlace", max_length=100)
    nationality: Optional[str] = Field(None, max_length=100)
    country_of_birth: Optional[str] = Field(None, alias="countryOfBirth", max_length=100)

    # Contact
    contact_mediums: List[ContactMedium] = Field(default_factory=list, alias="contactMedium")

    # Banking KYC extension fields
    tax_id: Optional[str] = Field(None, alias="taxId", max_length=50)
    identity_documents: List[IdentityDocument] = Field(default_factory=list, alias="identityDocument")
    tax_definitions: List[TaxDefinition] = Field(default_factory=list, alias="taxDefinition")

    # Extensibility
    external_references: List[ExternalReference] = Field(default_factory=list, alias="externalReference")
    characteristic: List[Characteristic] = Field(default_factory=list)
    related_party: List[RelatedParty] = Field(default_factory=list, alias="relatedParty")

    # @type for subclassing
    type: Optional[str] = Field("Individual", alias="@type")


class IndividualPatch(BaseModel):
    """
    Fields that can be patched on an Individual.
    ALL fields are optional — PATCH updates only supplied fields.
    """
    model_config = ConfigDict(populate_by_name=True)

    given_name: Optional[str] = Field(None, alias="givenName")
    family_name: Optional[str] = Field(None, alias="familyName")
    full_name: Optional[str] = Field(None, alias="fullName")
    title: Optional[str] = None
    gender: Optional[GenderType] = None
    marital_status: Optional[MaritalStatusType] = Field(None, alias="maritalStatus")
    birth_date: Optional[date] = Field(None, alias="birthDate")
    nationality: Optional[str] = None
    status: Optional[IndividualStateType] = None
    contact_mediums: Optional[List[ContactMedium]] = Field(None, alias="contactMedium")
    identity_documents: Optional[List[IdentityDocument]] = Field(None, alias="identityDocument")
    tax_id: Optional[str] = Field(None, alias="taxId")

    # Banking fields — updated by internal services
    kyc_status: Optional[KYCStatus] = Field(None, alias="kycStatus")
    risk_rating: Optional[RiskRating] = Field(None, alias="riskRating")
    risk_score: Optional[float] = Field(None, alias="riskScore", ge=0.0, le=1.0)
    risk_summary: Optional[str] = Field(None, alias="riskSummary")
    aml_cleared: Optional[bool] = Field(None, alias="amlCleared")
    pep_status: Optional[bool] = Field(None, alias="pepStatus")
    kyc_flags: Optional[List[str]] = Field(None, alias="kycFlags")
    kyc_recommended_action: Optional[str] = Field(None, alias="kycRecommendedAction")


class Individual(TMFEntity):
    """
    TMF632 Individual — represents a human party (customer).
    Extended with banking KYC, AML, risk scoring fields.

    @type = "Individual"
    @baseType = "Party"
    @schemaLocation = "https://bankonboard.io/schemas/Individual.json"
    """

    # TMF type hierarchy
    type: str = Field("Individual", alias="@type")
    base_type: str = Field("Party", alias="@baseType")
    schema_location: str = Field(
        "https://bankonboard.io/schemas/Individual.json",
        alias="@schemaLocation",
    )

    # TMF632 Individual fields
    given_name: str = Field(..., alias="givenName")
    family_name: str = Field(..., alias="familyName")
    full_name: Optional[str] = Field(None, alias="fullName")
    title: Optional[str] = None
    gender: Optional[GenderType] = None
    marital_status: Optional[MaritalStatusType] = Field(None, alias="maritalStatus")
    birth_date: Optional[date] = Field(None, alias="birthDate")
    birth_place: Optional[str] = Field(None, alias="birthPlace")
    nationality: Optional[str] = None
    country_of_birth: Optional[str] = Field(None, alias="countryOfBirth")
    status: IndividualStateType = IndividualStateType.initialized

    # Contact
    contact_mediums: List[ContactMedium] = Field(default_factory=list, alias="contactMedium")

    # Banking extensions
    tax_id: Optional[str] = Field(None, alias="taxId")
    identity_documents: List[IdentityDocument] = Field(default_factory=list, alias="identityDocument")
    tax_definitions: List[TaxDefinition] = Field(default_factory=list, alias="taxDefinition")
    external_references: List[ExternalReference] = Field(default_factory=list, alias="externalReference")
    characteristic: List[Characteristic] = Field(default_factory=list)
    related_party: List[RelatedParty] = Field(default_factory=list, alias="relatedParty")

    # ── Banking KYC / AML / Risk fields ──
    kyc_status: KYCStatus = Field(KYCStatus.pending, alias="kycStatus")
    risk_rating: Optional[RiskRating] = Field(None, alias="riskRating")
    risk_score: Optional[float] = Field(None, alias="riskScore", ge=0.0, le=1.0)
    risk_summary: Optional[str] = Field(None, alias="riskSummary")
    kyc_flags: List[str] = Field(default_factory=list, alias="kycFlags")
    kyc_recommended_action: Optional[str] = Field(None, alias="kycRecommendedAction")
    aml_cleared: bool = Field(False, alias="amlCleared")
    pep_status: bool = Field(False, alias="pepStatus")  # Politically Exposed Person
    sanctions_checked: bool = Field(False, alias="sanctionsChecked")

    # ── Audit trail ──
    audit_log: List[AuditEntry] = Field(default_factory=list, alias="auditLog")


# ─── TMF632 Organization ──────────────────────────────────────

class OrganizationCreate(BaseModel):
    """Fields accepted when creating an Organization."""
    model_config = ConfigDict(populate_by_name=True)

    name: str = Field(..., min_length=1, max_length=250)
    trading_name: Optional[str] = Field(None, alias="tradingName", max_length=250)
    organization_type: Optional[str] = Field(None, alias="organizationType",
                                              examples=["company", "partnership", "trust", "government"])
    is_legal_entity: bool = Field(True, alias="isLegalEntity")
    is_head_office: bool = Field(True, alias="isHeadOffice")
    name_type: Optional[str] = Field(None, alias="nameType")
    registration_number: Optional[str] = Field(None, alias="registrationNumber", max_length=100)

    # Contact
    contact_mediums: List[ContactMedium] = Field(default_factory=list, alias="contactMedium")
    related_party: List[RelatedParty] = Field(default_factory=list, alias="relatedParty")
    external_references: List[ExternalReference] = Field(default_factory=list, alias="externalReference")
    characteristic: List[Characteristic] = Field(default_factory=list)

    tax_id: Optional[str] = Field(None, alias="taxId")
    tax_definitions: List[TaxDefinition] = Field(default_factory=list, alias="taxDefinition")
    type: Optional[str] = Field("Organization", alias="@type")


class OrganizationPatch(BaseModel):
    """Fields that can be patched on an Organization."""
    model_config = ConfigDict(populate_by_name=True)
    name: Optional[str] = None
    trading_name: Optional[str] = Field(None, alias="tradingName")
    organization_type: Optional[str] = Field(None, alias="organizationType")
    status: Optional[OrganizationStateType] = None
    contact_mediums: Optional[List[ContactMedium]] = Field(None, alias="contactMedium")
    kyc_status: Optional[KYCStatus] = Field(None, alias="kycStatus")
    risk_rating: Optional[RiskRating] = Field(None, alias="riskRating")
    risk_score: Optional[float] = Field(None, alias="riskScore", ge=0.0, le=1.0)
    aml_cleared: Optional[bool] = Field(None, alias="amlCleared")


class Organization(TMFEntity):
    """
    TMF632 Organization — represents a legal entity.
    @type = "Organization", @baseType = "Party"
    """
    type: str = Field("Organization", alias="@type")
    base_type: str = Field("Party", alias="@baseType")
    schema_location: str = Field(
        "https://bankonboard.io/schemas/Organization.json",
        alias="@schemaLocation",
    )

    name: str
    trading_name: Optional[str] = Field(None, alias="tradingName")
    organization_type: Optional[str] = Field(None, alias="organizationType")
    is_legal_entity: bool = Field(True, alias="isLegalEntity")
    is_head_office: bool = Field(True, alias="isHeadOffice")
    name_type: Optional[str] = Field(None, alias="nameType")
    registration_number: Optional[str] = Field(None, alias="registrationNumber")
    status: OrganizationStateType = OrganizationStateType.initialized

    contact_mediums: List[ContactMedium] = Field(default_factory=list, alias="contactMedium")
    related_party: List[RelatedParty] = Field(default_factory=list, alias="relatedParty")
    external_references: List[ExternalReference] = Field(default_factory=list, alias="externalReference")
    characteristic: List[Characteristic] = Field(default_factory=list)

    tax_id: Optional[str] = Field(None, alias="taxId")
    tax_definitions: List[TaxDefinition] = Field(default_factory=list, alias="taxDefinition")

    # Banking extensions
    kyc_status: KYCStatus = Field(KYCStatus.pending, alias="kycStatus")
    risk_rating: Optional[RiskRating] = Field(None, alias="riskRating")
    risk_score: Optional[float] = Field(None, alias="riskScore", ge=0.0, le=1.0)
    risk_summary: Optional[str] = Field(None, alias="riskSummary")
    aml_cleared: bool = Field(False, alias="amlCleared")
    audit_log: List[AuditEntry] = Field(default_factory=list, alias="auditLog")
