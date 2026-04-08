import 'express-async-errors';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';

import { config } from './config';
import { logger } from './utils/logger';
import { errorHandler } from './middleware/errorHandler';
import { rateLimiter, authRateLimiter } from './middleware/rateLimit';
import { authRouter } from './routes/auth';
import { partyProxy } from './proxy/party';
import { aiProxy } from './proxy/ai';
import { healthRouter } from './routes/health';

const app = express();

// ─── Security middleware ─────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:"],
    },
  },
}));

app.use(cors({
  origin: config.frontendUrl,
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
  exposedHeaders: ['X-Request-ID', 'X-Rate-Limit-Remaining'],
}));

// ─── Logging ─────────────────────────────────────────────────
app.use(morgan('combined', {
  stream: { write: (msg) => logger.http(msg.trim()) },
}));

// ─── Body parsing ─────────────────────────────────────────────
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// ─── Request ID middleware ────────────────────────────────────
app.use((req, res, next) => {
  const requestId = req.headers['x-request-id'] as string ||
    `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  req.headers['x-request-id'] = requestId;
  res.setHeader('X-Request-ID', requestId);
  next();
});

// ─── Rate limiting ────────────────────────────────────────────
app.use(rateLimiter);

// ─── Health check (no auth) ───────────────────────────────────
app.use('/health', healthRouter);

// ─── OAuth2 + PKCE auth routes ────────────────────────────────
app.use('/auth', authRateLimiter, authRouter);

// ─── TMF Party Management proxy ───────────────────────────────
app.use('/tmApi/partyManagement', partyProxy);

// ─── AI Risk Assessment proxy ─────────────────────────────────
app.use('/api/ai', aiProxy);

// ─── Error handler (must be last) ────────────────────────────
app.use(errorHandler);

// ─── Start server ─────────────────────────────────────────────
app.listen(config.port, () => {
  logger.info(`BankOnboard Gateway running on port ${config.port}`);
  logger.info(`OAuth2 server: ${config.issuer}`);
  logger.info(`Party service: ${config.partyServiceUrl}`);
  logger.info(`AI service: ${config.aiServiceUrl}`);
});

export { app };
