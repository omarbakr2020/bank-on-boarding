import dotenv from 'dotenv';
dotenv.config();

function required(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Environment variable ${key} is required`);
  return val;
}

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',

  // Auth
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-in-production',
  issuer: process.env.JWT_ISSUER || 'https://bankonboard.io',
  audience: process.env.JWT_AUDIENCE || 'bankonboard-api',
  accessTokenTtlMinutes: parseInt(
    process.env.ACCESS_TOKEN_TTL_MINUTES || '15',
    10,
  ),
  refreshTokenTtlDays: parseInt(process.env.REFRESH_TOKEN_TTL_DAYS || '7', 10),

  // Downstream services
  partyServiceUrl: process.env.PARTY_SERVICE_URL || 'http://localhost:8000',
  aiServiceUrl: process.env.AI_SERVICE_URL || 'http://localhost:8001',

  // CORS
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:4200',

  // Redis
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',

  // Rate limiting
  rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10),
  rateLimitMaxRequests: parseInt(
    process.env.RATE_LIMIT_MAX_REQUESTS || '100',
    10,
  ),

  // Service-to-service
  serviceApiKey: process.env.SERVICE_API_KEY || 'dev-service-key',
} as const;

// Registered OAuth2 clients
export const oauthClients: Record<string, OAuthClient> = {
  'bankonboard-angular': {
    clientId: 'bankonboard-angular',
    clientName: 'BankOnboard Angular App',
    redirectUris: [
      'http://localhost:4200/auth/callback',
      'https://bankonboard.io/auth/callback',
      'https://bankonboard-frontend.up.railway.app/auth/callback',
    ],
    allowedScopes: [
      'openid',
      'profile',
      'party:read',
      'party:write',
      'ai:invoke',
    ],
    pkceRequired: true,
    public: true, // public client — no client secret
  },
  'bankonboard-service': {
    clientId: 'bankonboard-service',
    clientName: 'BankOnboard Service Account',
    clientSecret: config.serviceApiKey,
    redirectUris: [],
    allowedScopes: ['party:read', 'party:write', 'ai:invoke'],
    pkceRequired: false,
    public: false,
  },
};

export interface OAuthClient {
  clientId: string;
  clientName: string;
  clientSecret?: string;
  redirectUris: string[];
  allowedScopes: string[];
  pkceRequired: boolean;
  public: boolean;
}

// Scope definitions
export const scopeDefinitions: Record<string, string> = {
  openid: 'Verify your identity',
  profile: 'Read your profile information',
  'party:read': 'Read customer and party data',
  'party:write': 'Create and update customer data',
  'ai:invoke': 'Trigger AI risk assessment',
};
