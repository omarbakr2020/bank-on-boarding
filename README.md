# BankOnboard — Banking Customer Onboarding Platform

A production-grade, microservices-based banking customer onboarding platform implementing **TM Forum Open API TMF632** (Party Management), **TMF688** (Event Management), **OAuth2 + PKCE** authentication, AI-powered KYC risk assessment, and full Azure cloud deployment.

Built to demonstrate PwC ETIC-level enterprise engineering.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Angular Frontend (4200)                  │
│           Customer onboarding dashboard — OAuth2 PKCE        │
└──────────────────────────┬──────────────────────────────────┘
                           │ HTTPS
┌──────────────────────────▼──────────────────────────────────┐
│           Node.js API Gateway + OAuth2 Server (3000)         │
│   OAuth2+PKCE · Scope-based access · Rate limiting · Proxy  │
└────────┬──────────────────────────┬─────────────────────────┘
         │ HTTP/REST                 │ Redis Queue (async)
┌────────▼──────────────┐  ┌────────▼────────────────────────┐
│  FastAPI Party Service │  │  FastAPI AI Risk Service (8001) │
│  (8000) — TMF632       │  │  OpenAI KYC risk scoring        │
│  PostgreSQL · Alembic  │  │  Redis queue consumer           │
│  TMF688 Hub/Events     │  │  Async PATCH results back       │
└────────┬──────────────┘  └─────────────────────────────────┘
         │
┌────────▼──────────────────────────────────────────────────┐
│               PostgreSQL (5432)   Redis (6379)             │
└────────────────────────────────────────────────────────────┘
```

## Services

| Service | Port | Tech | Purpose |
|---|---|---|---|
| Gateway | 3000 | Node.js + TypeScript | OAuth2+PKCE server, auth, routing |
| Party Service | 8000 | FastAPI + Python | TMF632 Party Management API |
| AI Risk Service | 8001 | FastAPI + Python | LLM-powered KYC risk assessment |
| Frontend | 4200 | Angular 17 | Customer onboarding dashboard |

## TMF APIs Implemented

| API | Version | Description |
|---|---|---|
| TMF632 | v4 | Party Management (Individual, Organization) |
| TMF688 | v4 | Event Management (Hub, subscriptions, webhooks) |

## OAuth2 + PKCE Flow

```
Angular             Gateway OAuth2 Server
  │                        │
  │─ Generate code_verifier ─▶
  │─ Compute code_challenge ─▶
  │                        │
  │─ GET /auth/authorize?code_challenge=... ─▶
  │◀─ Redirect to login page ──────────────
  │─ POST /auth/login (credentials) ──────▶
  │◀─ Redirect with authorization_code ───
  │                        │
  │─ POST /auth/token (code + code_verifier) ▶
  │◀─ access_token + refresh_token ────────
  │                        │
  │─ API calls with Bearer token ──────────▶
```

## Quick Start

### Prerequisites
- Docker + Docker Compose
- Node.js 20+
- Python 3.11+
- Angular CLI 17+

### Run with Docker Compose

```bash
# Copy env file
cp .env.example .env
# Edit .env and add your OPENAI_API_KEY

# Start all services
docker-compose up --build

# Services available at:
# Frontend:       http://localhost:4200
# Gateway:        http://localhost:3000
# Party Service:  http://localhost:8000/docs
# AI Service:     http://localhost:8001/docs
```

### Environment Variables

Copy `.env.example` to `.env` and fill in:

```
OPENAI_API_KEY=sk-...         # Required for AI risk assessment
JWT_SECRET=...                # Random 64-char string
POSTGRES_PASSWORD=...         # Database password
```

## API Documentation

- Party Service OpenAPI: http://localhost:8000/docs
- AI Service OpenAPI: http://localhost:8001/docs
- Gateway health: http://localhost:3000/health

## TMF632 Endpoints

```
GET    /tmApi/partyManagement/v4/individual          # List individuals
POST   /tmApi/partyManagement/v4/individual          # Create individual (201)
GET    /tmApi/partyManagement/v4/individual/{id}     # Get individual
PATCH  /tmApi/partyManagement/v4/individual/{id}     # Partial update
DELETE /tmApi/partyManagement/v4/individual/{id}     # Delete (204)

GET    /tmApi/partyManagement/v4/organization        # List organizations
POST   /tmApi/partyManagement/v4/organization        # Create organization
GET    /tmApi/partyManagement/v4/organization/{id}   # Get organization
PATCH  /tmApi/partyManagement/v4/organization/{id}   # Partial update

POST   /tmApi/partyManagement/v4/hub                 # Subscribe to events
GET    /tmApi/partyManagement/v4/hub                 # List subscriptions
DELETE /tmApi/partyManagement/v4/hub/{id}            # Unsubscribe
```

## Banking Compliance

- **KYC**: Know Your Customer workflow (initialized → pending → in_review → approved/rejected)
- **AML**: Anti-Money Laundering flag tracking
- **PEP**: Politically Exposed Person screening
- **PSD2**: Open banking event notification pattern (TMF688)
- **GDPR**: Data field classification and audit logging
- **SCA**: Strong Customer Authentication via OAuth2 MFA flag

## Deployment

See `k8s/` for Kubernetes manifests and `azure-pipelines.yml` for CI/CD pipeline.
