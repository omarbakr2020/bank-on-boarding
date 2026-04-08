"""
AI-powered KYC Risk Assessment Engine.
Uses OpenAI to analyze customer profiles and generate structured risk assessments.

In production banking:
  - Combine LLM with deterministic rule engine (sanctions lists, PEP databases)
  - Use Azure OpenAI (data residency compliance, GDPR)
  - Log every assessment for regulatory audit trail
  - Human-in-the-loop for high-risk cases
"""
from openai import AsyncOpenAI
from pydantic import BaseModel, Field
from typing import List, Optional
import json
import logging
import os

logger = logging.getLogger(__name__)

client = AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY"))


class RiskAssessmentResult(BaseModel):
    customer_id: str
    risk_score: float = Field(..., ge=0.0, le=1.0,
                              description="0.0 = minimal risk, 1.0 = maximum risk")
    risk_rating: str = Field(..., description="low | medium | high | very_high")
    summary: str = Field(..., description="2-3 sentence human-readable risk summary")
    flags: List[str] = Field(default_factory=list,
                             description="Specific risk concerns identified")
    recommended_action: str = Field(...,
                                    description="approve | manual_review | reject | enhanced_due_diligence")
    kyc_status: str = Field(..., description="New KYC status to apply")
    aml_cleared: bool
    confidence: float = Field(..., ge=0.0, le=1.0, description="Model confidence in assessment")


SYSTEM_PROMPT = """You are an expert banking KYC (Know Your Customer) risk assessment engine.
Your role is to analyze customer profiles for a regulated bank and provide structured risk assessments.

You assess:
1. Identity completeness — is sufficient information provided for verification?
2. Geographic risk — certain nationalities/countries have higher regulatory requirements
3. PEP risk — politically exposed persons require enhanced due diligence
4. AML risk — anti-money laundering considerations
5. Documentation completeness — are required identity documents present?

Risk rating thresholds:
- low (0.0–0.25): All information complete, low-risk profile, approve automatically
- medium (0.25–0.50): Minor gaps or moderate-risk indicators, approve with standard monitoring
- high (0.50–0.75): Significant gaps or risk indicators, requires manual review
- very_high (0.75–1.0): Multiple red flags, enhanced due diligence required or reject

KYC actions:
- approve: Automatically approve — meets all standard requirements
- manual_review: Needs human analyst review before proceeding
- enhanced_due_diligence: PEP or high-risk country — requires enhanced verification
- reject: Clear regulatory red flags — do not onboard

IMPORTANT: You must return ONLY valid JSON. No markdown, no explanation, no preamble.
"""

ASSESSMENT_PROMPT_TEMPLATE = """
Analyze this customer profile for KYC/AML risk:

Customer Profile:
- Full Name: {full_name}
- Nationality: {nationality}
- Country of Birth: {country_of_birth}
- Date of Birth: {birth_date}
- Contact Information Provided: {has_contact}
- Email Provided: {has_email}
- Phone Provided: {has_phone}
- Address Provided: {has_address}
- Identity Documents Provided: {doc_count} document(s)
  {doc_details}
- Tax ID Provided: {has_tax_id}
- Existing KYC Status: {current_kyc_status}
- Related Parties: {related_party_count}

Assess the risk and return JSON with this exact structure:
{{
  "risk_score": <float 0.0-1.0>,
  "risk_rating": "<low|medium|high|very_high>",
  "summary": "<2-3 sentence summary>",
  "flags": ["<flag1>", "<flag2>"],
  "recommended_action": "<approve|manual_review|enhanced_due_diligence|reject>",
  "kyc_status": "<pending|in_review|approved|rejected>",
  "aml_cleared": <true|false>,
  "confidence": <float 0.0-1.0>
}}
"""


async def assess_risk(customer: dict) -> RiskAssessmentResult:
    """
    Generate an AI-powered KYC risk assessment for a customer.

    Args:
        customer: TMF632 Individual dict from party service

    Returns:
        RiskAssessmentResult with risk score, rating, flags, and recommended action
    """
    customer_id = customer.get("id", "unknown")

    # Extract contact information flags
    contact_mediums = customer.get("contactMedium", [])
    has_email = any(cm.get("mediumType") == "email" for cm in contact_mediums)
    has_phone = any(cm.get("mediumType") == "phone" for cm in contact_mediums)
    has_address = any(cm.get("mediumType") == "postalAddress" for cm in contact_mediums)

    # Extract identity documents
    identity_docs = customer.get("identityDocument", [])
    doc_details = "\n  ".join([
        f"- {doc.get('documentType', 'unknown')}: {'verified' if doc.get('verified') else 'unverified'}"
        for doc in identity_docs
    ]) if identity_docs else "None"

    prompt = ASSESSMENT_PROMPT_TEMPLATE.format(
        full_name=f"{customer.get('givenName', '')} {customer.get('familyName', '')}".strip(),
        nationality=customer.get("nationality", "Not provided"),
        country_of_birth=customer.get("countryOfBirth", "Not provided"),
        birth_date=customer.get("birthDate", "Not provided"),
        has_contact="Yes" if contact_mediums else "No",
        has_email="Yes" if has_email else "No",
        has_phone="Yes" if has_phone else "No",
        has_address="Yes" if has_address else "No",
        doc_count=len(identity_docs),
        doc_details=doc_details,
        has_tax_id="Yes" if customer.get("taxId") else "No",
        current_kyc_status=customer.get("kycStatus", "pending"),
        related_party_count=len(customer.get("relatedParty", [])),
    )

    logger.info(f"Running AI risk assessment for customer: {customer_id}")

    response = await client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": prompt},
        ],
        response_format={"type": "json_object"},
        temperature=0.1,   # Low temperature for consistent, deterministic results
        max_tokens=500,
    )

    raw = response.choices[0].message.content
    logger.debug(f"AI response for {customer_id}: {raw}")

    parsed = json.loads(raw)
    result = RiskAssessmentResult(customer_id=customer_id, **parsed)

    logger.info(
        f"Risk assessment complete: id={customer_id} "
        f"score={result.risk_score:.2f} rating={result.risk_rating} "
        f"action={result.recommended_action}"
    )
    return result


async def assess_risk_fallback(customer: dict) -> RiskAssessmentResult:
    """
    Rule-based fallback when OpenAI is unavailable.
    Ensures the service degrades gracefully.
    """
    customer_id = customer.get("id", "unknown")
    contact_mediums = customer.get("contactMedium", [])
    identity_docs = customer.get("identityDocument", [])
    flags = []

    score = 0.1  # base score

    if not contact_mediums:
        score += 0.2
        flags.append("No contact information provided")

    if not identity_docs:
        score += 0.3
        flags.append("No identity documents provided")
    elif not any(d.get("verified") for d in identity_docs):
        score += 0.15
        flags.append("Identity documents unverified")

    if not customer.get("nationality"):
        score += 0.1
        flags.append("Nationality not provided")

    if not customer.get("birthDate"):
        score += 0.1
        flags.append("Date of birth not provided")

    score = min(score, 1.0)

    if score < 0.25:
        rating, action, kyc = "low", "approve", "approved"
    elif score < 0.5:
        rating, action, kyc = "medium", "manual_review", "in_review"
    elif score < 0.75:
        rating, action, kyc = "high", "manual_review", "in_review"
    else:
        rating, action, kyc = "very_high", "enhanced_due_diligence", "in_review"

    return RiskAssessmentResult(
        customer_id=customer_id,
        risk_score=round(score, 2),
        risk_rating=rating,
        summary=f"Rule-based assessment (AI unavailable). Score: {score:.2f}. {len(flags)} flag(s) identified.",
        flags=flags,
        recommended_action=action,
        kyc_status=kyc,
        aml_cleared=score < 0.5,
        confidence=0.6,
    )
