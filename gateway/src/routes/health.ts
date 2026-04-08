// src/routes/health.ts
import { Router } from 'express';
import { config } from '../config';

export const healthRouter = Router();

healthRouter.get('/', (_req, res) => {
  res.json({
    status: 'healthy',
    service: 'bankonboard-gateway',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: config.nodeEnv,
  });
});

healthRouter.get('/ready', async (_req, res) => {
  // In production: check Redis + downstream services
  res.json({ status: 'ready' });
});
