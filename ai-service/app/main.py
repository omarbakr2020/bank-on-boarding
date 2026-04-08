"""
BankOnboard — AI Risk Assessment Service
Runs both the FastAPI HTTP server and the Redis worker concurrently.
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import asyncio
import logging
import os

from .worker import run_worker

logger = logging.getLogger(__name__)

_worker_task = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _worker_task
    # Start Redis worker as background task alongside the HTTP server
    _worker_task = asyncio.create_task(run_worker())
    logger.info("AI Risk Service started — worker running in background")
    yield
    if _worker_task:
        _worker_task.cancel()
        try:
            await _worker_task
        except asyncio.CancelledError:
            pass
    logger.info("AI Risk Service shut down")


app = FastAPI(
    title="AI Risk Assessment Service",
    description="""
## BankOnboard AI Risk Assessment Service

LLM-powered KYC risk scoring for banking customer onboarding.

### How it works
1. Gateway publishes a job to Redis when a customer is created
2. This service's worker consumes the job asynchronously
3. Customer data is fetched from the Party Service
4. OpenAI GPT-4o-mini analyzes the profile
5. Results are PATCHed back to the customer record via TMF632
6. A TMF688 KYCStatusChangeEvent is fired to subscribers

### Endpoints
- `GET /health` — service health
- `GET /results/{customer_id}` — get cached risk assessment result
    """,
    version="1.0.0",
    docs_url="/docs",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[os.getenv("GATEWAY_URL", "http://localhost:3000")],
    allow_methods=["GET"],
    allow_headers=["X-Service-Api-Key"],
)


@app.get("/health", include_in_schema=False)
async def health():
    return {
        "status": "healthy",
        "service": "ai-risk-service",
        "worker": "running" if _worker_task and not _worker_task.done() else "stopped",
    }


@app.get("/results/{customer_id}", summary="Get cached risk assessment result")
async def get_result(customer_id: str):
    """Retrieve a cached risk assessment result by customer ID."""
    import redis.asyncio as aioredis
    import json

    redis_url = os.getenv("REDIS_URL", "redis://localhost:6379")
    r = aioredis.from_url(redis_url, decode_responses=True)
    try:
        raw = await r.get(f"risk-result:{customer_id}")
        if not raw:
            from fastapi import HTTPException
            raise HTTPException(status_code=404, detail={"code": "404", "reason": "Not found"})
        return json.loads(raw)
    finally:
        await r.aclose()
