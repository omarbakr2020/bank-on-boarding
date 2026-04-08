"""
Redis Queue Worker — consumes risk assessment jobs.
Runs as a separate process alongside the FastAPI HTTP server.

Flow:
  1. Gateway publishes job to Redis list "risk-assessment"
  2. Worker brpop() blocks until job arrives
  3. Fetches customer from party service
  4. Runs AI risk assessment
  5. PATCHes results back via TMF632 PATCH endpoint
  6. Stores result in Redis for direct lookup
  7. Fires TMF688 event via party service
"""
import asyncio
import json
import logging
import os
import signal
import sys

import httpx
import redis.asyncio as aioredis

from .risk import assess_risk, assess_risk_fallback

logger = logging.getLogger(__name__)

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")
PARTY_SERVICE_URL = os.getenv("PARTY_SERVICE_URL", "http://party-service:8000")
SERVICE_API_KEY = os.getenv("SERVICE_API_KEY", "dev-service-key")
QUEUE_NAME = "risk-assessment"
RESULT_TTL_SECONDS = 86400  # 24 hours


async def fetch_customer(client: httpx.AsyncClient, customer_id: str) -> dict | None:
    """Fetch customer from party service using service-to-service auth."""
    try:
        resp = await client.get(
            f"{PARTY_SERVICE_URL}/tmApi/partyManagement/v4/individual/{customer_id}",
            headers={"X-Service-Api-Key": SERVICE_API_KEY},
            timeout=10.0,
        )
        if resp.status_code == 200:
            return resp.json()
        logger.warning(f"Customer not found: {customer_id} status={resp.status_code}")
        return None
    except Exception as e:
        logger.error(f"Failed to fetch customer {customer_id}: {e}")
        return None


async def patch_customer(client: httpx.AsyncClient, customer_id: str, assessment) -> bool:
    """PATCH risk assessment results back to party service via TMF632."""
    patch_body = {
        "kycStatus": assessment.kyc_status,
        "riskRating": assessment.risk_rating,
        "riskScore": assessment.risk_score,
        "riskSummary": assessment.summary,
        "kycFlags": assessment.flags,
        "kycRecommendedAction": assessment.recommended_action,
        "amlCleared": assessment.aml_cleared,
    }
    try:
        resp = await client.patch(
            f"{PARTY_SERVICE_URL}/tmApi/partyManagement/v4/individual/{customer_id}",
            json=patch_body,
            headers={"X-Service-Api-Key": SERVICE_API_KEY},
            timeout=10.0,
        )
        if resp.status_code == 200:
            logger.info(f"PATCH successful: customer={customer_id} kyc={assessment.kyc_status}")
            return True
        logger.error(f"PATCH failed: customer={customer_id} status={resp.status_code} body={resp.text[:200]}")
        return False
    except Exception as e:
        logger.error(f"PATCH error: customer={customer_id} error={e}")
        return False


async def process_job(redis_client: aioredis.Redis, job: dict) -> None:
    """Process a single risk assessment job end-to-end."""
    customer_id = job.get("customerId")
    if not customer_id:
        logger.warning(f"Invalid job — missing customerId: {job}")
        return

    logger.info(f"Processing risk assessment: customerId={customer_id} requestedBy={job.get('requestedBy')}")

    async with httpx.AsyncClient() as http_client:
        # 1. Fetch customer from party service
        customer = await fetch_customer(http_client, customer_id)
        if not customer:
            logger.error(f"Skipping assessment — customer not found: {customer_id}")
            return

        # 2. Run AI risk assessment (with fallback)
        try:
            assessment = await assess_risk(customer)
        except Exception as e:
            logger.warning(f"AI assessment failed, using fallback: {e}")
            assessment = await assess_risk_fallback(customer)

        # 3. PATCH results back to party service
        success = await patch_customer(http_client, customer_id, assessment)

        # 4. Cache result for direct API lookup (24h TTL)
        result_key = f"risk-result:{customer_id}"
        await redis_client.setex(
            result_key,
            RESULT_TTL_SECONDS,
            json.dumps({
                "customerId": customer_id,
                "riskScore": assessment.risk_score,
                "riskRating": assessment.risk_rating,
                "summary": assessment.summary,
                "flags": assessment.flags,
                "recommendedAction": assessment.recommended_action,
                "kycStatus": assessment.kyc_status,
                "amlCleared": assessment.aml_cleared,
                "confidence": assessment.confidence,
                "patchedSuccessfully": success,
                "processedAt": asyncio.get_event_loop().time(),
            })
        )

        logger.info(
            f"Assessment complete: id={customer_id} "
            f"rating={assessment.risk_rating} action={assessment.recommended_action} "
            f"patched={success}"
        )


async def run_worker() -> None:
    """
    Main worker loop. Blocks on Redis BRPOP waiting for jobs.
    Gracefully handles shutdown signals.
    """
    logger.info(f"AI Risk Worker starting — connecting to Redis: {REDIS_URL}")

    redis_client = aioredis.from_url(REDIS_URL, decode_responses=True)

    # Test connection
    try:
        await redis_client.ping()
        logger.info("Redis connected — worker ready")
    except Exception as e:
        logger.error(f"Redis connection failed: {e}")
        sys.exit(1)

    shutdown = asyncio.Event()

    def handle_signal(sig):
        logger.info(f"Received signal {sig} — shutting down gracefully")
        shutdown.set()

    loop = asyncio.get_event_loop()
    for sig in (signal.SIGTERM, signal.SIGINT):
        loop.add_signal_handler(sig, lambda s=sig: handle_signal(s))

    logger.info(f"Worker listening on queue: {QUEUE_NAME}")
    consecutive_errors = 0

    while not shutdown.is_set():
        try:
            # BRPOP blocks with 2s timeout, then loops to check shutdown
            result = await redis_client.brpop(QUEUE_NAME, timeout=2)
            if result:
                _, raw_job = result
                job = json.loads(raw_job)
                await process_job(redis_client, job)
                consecutive_errors = 0

        except json.JSONDecodeError as e:
            logger.error(f"Invalid JSON in queue: {e}")
            consecutive_errors += 1

        except Exception as e:
            consecutive_errors += 1
            logger.error(f"Worker error (#{consecutive_errors}): {e}")
            if consecutive_errors > 10:
                logger.critical("Too many consecutive errors — backing off 30s")
                await asyncio.sleep(30)
                consecutive_errors = 0
            else:
                await asyncio.sleep(1)

    await redis_client.aclose()
    logger.info("Worker shut down cleanly")


if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    )
    asyncio.run(run_worker())
