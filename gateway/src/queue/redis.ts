import { createClient, RedisClientType } from 'redis';
import { config } from '../config';
import { logger } from '../utils/logger';

export interface RiskAssessmentJob {
  customerId: string;
  requestedBy: string;
  requestedAt: string;
}

class RedisQueue {
  private client: RedisClientType | null = null;
  private connected = false;

  async connect(): Promise<void> {
    try {
      this.client = createClient({ url: config.redisUrl });
      this.client.on('error', (err) => logger.error(`Redis error: ${err.message}`));
      this.client.on('ready', () => { this.connected = true; logger.info('Redis connected'); });
      this.client.on('end', () => { this.connected = false; });
      await this.client.connect();
    } catch (err: any) {
      logger.warn(`Redis unavailable: ${err.message}. Queue operations will be skipped.`);
    }
  }

  async publishRiskAssessment(customerId: string, requestedBy: string): Promise<void> {
    if (!this.client || !this.connected) {
      logger.warn('Redis not available — skipping risk assessment queue');
      return;
    }
    const job: RiskAssessmentJob = {
      customerId,
      requestedBy,
      requestedAt: new Date().toISOString(),
    };
    await this.client.lPush('risk-assessment', JSON.stringify(job));
    logger.info(`Risk assessment queued: customerId=${customerId}`);
  }

  async getRiskResult(customerId: string): Promise<any | null> {
    if (!this.client || !this.connected) return null;
    const result = await this.client.get(`risk-result:${customerId}`);
    return result ? JSON.parse(result) : null;
  }
}

export const redisQueue = new RedisQueue();

// Connect on module load
redisQueue.connect().catch(() => {});
