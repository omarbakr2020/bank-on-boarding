import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken, TokenPayload } from '../auth/oauth';
import { logger } from '../utils/logger';

// Extend Express Request to carry token payload
declare global {
  namespace Express {
    interface Request {
      user?: TokenPayload;
    }
  }
}

/**
 * Authenticate middleware — validates Bearer token.
 * Attaches decoded payload to req.user.
 */
export const authenticate = (req: Request, res: Response, next: NextFunction): void => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({
      code: '401',
      reason: 'Unauthorized',
      message: 'Bearer token required',
      status: '401',
      '@type': 'Error',
    });
    return;
  }

  const token = authHeader.slice(7);
  const payload = verifyAccessToken(token);

  if (!payload) {
    res.status(401).json({
      code: '401',
      reason: 'Unauthorized',
      message: 'Invalid or expired token',
      status: '401',
      '@type': 'Error',
    });
    return;
  }

  req.user = payload;
  logger.debug(`Authenticated: ${payload.email} scopes=[${payload.scopes.join(',')}]`);
  next();
};

/**
 * Require a specific OAuth2 scope.
 * Usage: router.get('/resource', authenticate, requireScope('party:read'), handler)
 */
export const requireScope = (...scopes: string[]) =>
  (req: Request, res: Response, next: NextFunction): void => {
    const userScopes = req.user?.scopes ?? [];
    const hasAll = scopes.every((s) => userScopes.includes(s));

    if (!hasAll) {
      const missing = scopes.filter((s) => !userScopes.includes(s));
      logger.warn(`Scope denied: user=${req.user?.sub} missing=[${missing.join(',')}]`);
      res.status(403).json({
        code: '403',
        reason: 'Forbidden',
        message: `Required scopes: ${missing.join(', ')}`,
        status: '403',
        '@type': 'Error',
      });
      return;
    }
    next();
  };

/**
 * Optional auth — attaches user if token present, does not fail if absent.
 */
export const optionalAuth = (req: Request, res: Response, next: NextFunction): void => {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    const payload = verifyAccessToken(token);
    if (payload) req.user = payload;
  }
  next();
};

/**
 * Service-to-service authentication (internal only).
 * Uses a shared API key, not OAuth tokens.
 */
export const serviceAuth = (req: Request, res: Response, next: NextFunction): void => {
  const apiKey = req.headers['x-service-api-key'];
  if (apiKey !== process.env.SERVICE_API_KEY) {
    res.status(401).json({ code: '401', reason: 'Invalid service key' });
    return;
  }
  next();
};
