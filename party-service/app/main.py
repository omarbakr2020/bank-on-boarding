"""
BankOnboard — TMF632 Party Management Service
FastAPI application with full TMF Open API compliance.
"""
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from contextlib import asynccontextmanager
import logging
import os

from .database import Base, engine
from .routers import individual, organization, hub

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Create tables on startup (Alembic handles migrations in production)
    try:
        Base.metadata.create_all(bind=engine)
        logger.info("Database tables created/verified")
    except Exception as e:
        logger.warning(f"Table setup warning (tables may already exist): {e}")
    logger.info(f"OpenAPI docs: http://localhost:8000/docs")
    yield
    logger.info("Party Service shutting down")


app = FastAPI(
    title="Party Management API",
    description="""
## TMF632 Party Management API — BankOnboard

Implements **TM Forum Open API TMF632 v4** for banking customer onboarding.

### TMF Standard Compliance
- ✅ TMF632 Individual and Organization resources
- ✅ TMF688 Hub/Event notification pattern
- ✅ TMF630 REST Design Guidelines (URL patterns, PATCH, error schema)
- ✅ Mandatory TMF fields: `id`, `href`, `@type`, `@baseType`, `lastUpdate`
- ✅ Auto-generated OpenAPI specification

### Banking Extensions
- 🏦 KYC (Know Your Customer) workflow
- 🔍 AML (Anti-Money Laundering) clearance tracking
- 👤 PEP (Politically Exposed Person) screening
- 📊 AI-powered risk scoring via async job queue
- 📋 Full audit trail for regulatory compliance
- 🔐 OAuth2 + PKCE scope-based access control

### Authentication
All endpoints require a valid Bearer token.
Obtain tokens via the Gateway OAuth2 server at `GET /auth/authorize`.

**Scopes:**
- `party:read` — list and retrieve party records
- `party:write` — create, update, and delete party records
    """,
    version="4.0.0",
    contact={"name": "BankOnboard Engineering", "email": "engineering@bankonboard.io"},
    license_info={"name": "Proprietary"},
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
    lifespan=lifespan,
)

# ─── Middleware ───────────────────────────────────────────────

app.add_middleware(
    CORSMiddleware,
    allow_origins=[os.getenv("FRONTEND_URL", "http://localhost:4200"),
                   os.getenv("GATEWAY_URL", "http://localhost:3000")],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "X-Service-Api-Key", "X-Request-ID"],
)

# ─── Exception handlers ───────────────────────────────────────

@app.exception_handler(404)
async def not_found_handler(request: Request, exc):
    return JSONResponse(
        status_code=404,
        content={"code": "404", "reason": "Not Found",
                 "message": f"Path {request.url.path} not found", "status": "404", "@type": "Error"},
    )


@app.exception_handler(500)
async def internal_error_handler(request: Request, exc):
    logger.error(f"Internal error on {request.url.path}: {exc}")
    return JSONResponse(
        status_code=500,
        content={"code": "500", "reason": "Internal Server Error",
                 "message": "An internal error occurred", "status": "500", "@type": "Error"},
    )

# ─── Routers ─────────────────────────────────────────────────

app.include_router(individual.router)
app.include_router(organization.router)
app.include_router(hub.router)

# ─── Health check ─────────────────────────────────────────────

@app.get("/health", tags=["Health"], include_in_schema=False)
async def health():
    return {"status": "healthy", "service": "party-service", "version": "4.0.0"}


@app.get("/", include_in_schema=False)
async def root():
    return {"message": "TMF632 Party Management API", "docs": "/docs", "version": "4.0.0"}
