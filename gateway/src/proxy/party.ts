import { Router } from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { authenticate, requireScope } from '../middleware/auth';
import { config } from '../config';
import { logger } from '../utils/logger';
import { redisQueue } from '../queue/redis';

const router = Router();

/**
 * All TMF632 Party Management routes proxy to FastAPI party service.
 *
 * Scope enforcement per HTTP method:
 * GET    → party:read
 * POST   → party:write
 * PATCH  → party:write
 * DELETE → party:write
 */

// Apply auth to all party routes
router.use(authenticate);

// Scope-check by method before proxying
router.use((req, res, next) => {
  const writeScopes = ['POST', 'PATCH', 'DELETE'];
  if (writeScopes.includes(req.method)) {
    requireScope('party:write')(req, res, next);
  } else {
    requireScope('party:read')(req, res, next);
  }
});

// Proxy all requests to party service
router.use(
  '/',
  createProxyMiddleware({
    target: config.partyServiceUrl,
    changeOrigin: true,
    pathRewrite: { '^/': '/tmApi/partyManagement/' },
    on: {
      proxyReq: (proxyReq, req: any) => {
        // ALL setHeader calls MUST come before write()
        // write() flushes headers — calling setHeader after throws ERR_HTTP_HEADERS_SENT

        // Forward user identity to downstream service
        if (req.user) {
          proxyReq.setHeader('X-User-Id', req.user.sub);
          proxyReq.setHeader('X-User-Email', req.user.email);
          proxyReq.setHeader('X-User-Scopes', req.user.scopes.join(','));
        }
        proxyReq.setHeader('X-Service-Api-Key', config.serviceApiKey);

        // Re-attach body LAST — express.json() consumed the stream,
        // so we must re-write the parsed body onto the outgoing request
        if (req.body && ['POST', 'PATCH', 'PUT'].includes(req.method)) {
          const bodyData = JSON.stringify(req.body);
          proxyReq.setHeader('Content-Type', 'application/json');
          proxyReq.setHeader('Content-Length', Buffer.byteLength(bodyData));
          proxyReq.write(bodyData);  // must be last
        }
      },
      proxyRes: (proxyRes, req: any, res: any) => {
        // Hook into 201 responses to queue AI risk assessment
        if (req.method === 'POST' &&
            req.path.endsWith('/individual') &&
            proxyRes.statusCode === 201) {
          let body = '';
          proxyRes.on('data', (chunk: Buffer) => { body += chunk.toString(); });
          proxyRes.on('end', () => {
            try {
              const data = JSON.parse(body);
              if (data?.id) {
                redisQueue.publishRiskAssessment(data.id, req.user?.sub ?? 'system')
                  .catch((err: Error) => logger.error(`Queue error: ${err.message}`));
              }
            } catch { /* not JSON, ignore */ }
          });
        }
      },
      error: (err: any, req: any, res: any) => {
        logger.error(`Party service proxy error: ${err.message}`);
        res.status(502).json({
          code: '502',
          reason: 'Bad Gateway',
          message: 'Party service unavailable',
          status: '502',
          '@type': 'Error',
        });
      },
    },
  })
);

export const partyProxy = router;
