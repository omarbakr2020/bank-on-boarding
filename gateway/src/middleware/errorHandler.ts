// src/middleware/errorHandler.ts
import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

export const errorHandler = (err: any, req: Request, res: Response, _next: NextFunction): void => {
  logger.error(`Unhandled error: ${err.message}`, { stack: err.stack, path: req.path });
  res.status(err.status || 500).json({
    code: String(err.status || 500),
    reason: err.reason || 'Internal Server Error',
    message: process.env.NODE_ENV === 'production' ? 'An internal error occurred' : err.message,
    status: String(err.status || 500),
    '@type': 'Error',
  });
};
