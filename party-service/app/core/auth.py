"""
Auth middleware for party service.
Validates JWT tokens issued by the gateway OAuth2 server.
Accepts both:
  1. Bearer tokens (from gateway — user requests)
  2. X-Service-Api-Key header (from gateway — proxied requests)
"""
from fastapi import Depends, HTTPException, status, Security, Request
from fastapi.security import OAuth2PasswordBearer, HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt
from pydantic import BaseModel
from typing import List, Optional
import os

JWT_SECRET = os.getenv("JWT_SECRET", "dev-secret-change-in-production")
JWT_ALGORITHM = "HS256"
JWT_ISSUER = os.getenv("JWT_ISSUER", "https://bankonboard.io")
JWT_AUDIENCE = os.getenv("JWT_AUDIENCE", "bankonboard-api")
SERVICE_API_KEY = os.getenv("SERVICE_API_KEY", "dev-service-key")

bearer_scheme = HTTPBearer(auto_error=False)


class TokenData(BaseModel):
    sub: str
    email: str
    given_name: str
    family_name: str
    scopes: List[str]
    roles: List[str]


def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
    request: Request = None,
) -> TokenData:
    """
    Validate Bearer token OR service API key.
    Returns TokenData on success, raises 401 on failure.
    """
    # Service-to-service: accept API key (forwarded by gateway)
    service_key = request.headers.get("x-service-api-key") if request else None
    if service_key == SERVICE_API_KEY:
        # Internal service call — grant full access
        return TokenData(
            sub="service-account",
            email="service@bankonboard.internal",
            given_name="Service",
            family_name="Account",
            scopes=["party:read", "party:write", "ai:invoke"],
            roles=["service"],
        )

    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "401", "reason": "Unauthorized", "message": "Bearer token required", "@type": "Error"},
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        payload = jwt.decode(
            credentials.credentials,
            JWT_SECRET,
            algorithms=[JWT_ALGORITHM],
            issuer=JWT_ISSUER,
            audience=JWT_AUDIENCE,
        )
        return TokenData(
            sub=payload["sub"],
            email=payload.get("email", ""),
            given_name=payload.get("given_name", ""),
            family_name=payload.get("family_name", ""),
            scopes=payload.get("scopes", []),
            roles=payload.get("roles", []),
        )
    except JWTError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "401", "reason": "Unauthorized", "message": str(e), "@type": "Error"},
            headers={"WWW-Authenticate": "Bearer"},
        )


def require_scope(*required_scopes: str):
    """
    FastAPI dependency factory — requires ALL specified scopes.
    Usage: Depends(require_scope("party:write"))
    """
    def checker(user: TokenData = Depends(get_current_user)) -> TokenData:
        missing = [s for s in required_scopes if s not in user.scopes]
        if missing:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "code": "403",
                    "reason": "Forbidden",
                    "message": f"Required scopes missing: {', '.join(missing)}",
                    "@type": "Error",
                },
            )
        return user
    return checker
