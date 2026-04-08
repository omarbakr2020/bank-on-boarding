import { Router } from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { authenticate, requireScope } from '../middleware/auth';
import { config } from '../config';
import { logger } from '../utils/logger';
import { redisQueue } from '../queue/redis';

const router = Router();

router.use(authenticate);

// Manually trigger risk assessment for a customer
router.post('/risk/:customerId', requireScope('ai:invoke'), async (req, res) => {
  const { customerId } = req.params;
  try {
    await redisQueue.publishRiskAssessment(customerId, req.user!.sub);
    res.json({
      status: 'queued',
      customerId,
      message: 'Risk assessment queued. Results will be PATCHed back to the customer record.',
    });
  } catch (err: any) {
    logger.error(`Failed to queue risk assessment: ${err.message}`);
    res.status(503).json({ code: '503', reason: 'Queue unavailable', '@type': 'Error' });
  }
});

// Get AI risk assessment result
router.get('/risk/:customerId/result', requireScope('party:read'), async (req, res) => {
  try {
    const result = await redisQueue.getRiskResult(req.params.customerId);
    if (!result) {
      return res.status(404).json({ code: '404', reason: 'No risk assessment found', '@type': 'Error' });
    }
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ code: '500', reason: 'Internal error', '@type': 'Error' });
  }
});

export const aiProxy = router;
