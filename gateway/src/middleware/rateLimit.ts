// src/middleware/rateLimit.ts
import rateLimit from 'express-rate-limit';
import { config } from '../config';

export const rateLimiter = rateLimit({
  windowMs: config.rateLimitWindowMs,
  max: config.rateLimitMaxRequests,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    code: '429',
    reason: 'Too Many Requests',
    message: 'Rate limit exceeded. Please slow down.',
    status: '429',
    '@type': 'Error',
  },
});

// Stricter limit for auth endpoints (anti-brute-force)
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    code: '429',
    reason: 'Too Many Requests',
    message: 'Too many auth attempts. Please wait 15 minutes.',
    status: '429',
    '@type': 'Error',
  },
});
