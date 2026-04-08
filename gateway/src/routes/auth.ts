import { Router, Request, Response } from 'express';
import { oauthClients, scopeDefinitions, config } from '../config';
import {
  validateCredentials,
  findUserById,
  createAuthorizationCode,
  consumeAuthorizationCode,
  consumeRefreshToken,
  generateTokenPair,
  generateAccessToken,
  verifyPkce,
  isValidCodeVerifier,
  intersectScopes,
  verifyAccessToken,
} from '../auth/oauth';
import { logger } from '../utils/logger';

export const authRouter = Router();

// ─── OAuth2 Server Metadata (RFC 8414) ────────────────────────
authRouter.get('/.well-known/oauth-authorization-server', (_req, res) => {
  res.json({
    issuer: config.issuer,
    authorization_endpoint: `${config.issuer}/auth/authorize`,
    token_endpoint: `${config.issuer}/auth/token`,
    userinfo_endpoint: `${config.issuer}/auth/userinfo`,
    introspection_endpoint: `${config.issuer}/auth/introspect`,
    revocation_endpoint: `${config.issuer}/auth/revoke`,
    scopes_supported: Object.keys(scopeDefinitions),
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none', 'client_secret_post'],
  });
});

// ─── Login page (served by gateway for demo) ──────────────────
authRouter.get('/login', (req: Request, res: Response) => {
  const { state } = req.query;
  res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>BankOnboard — Sign In</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
           background: #f5f5f0; display: flex; align-items: center;
           justify-content: center; min-height: 100vh; }
    .card { background: white; border-radius: 12px; padding: 2rem;
            width: 360px; box-shadow: 0 2px 12px rgba(0,0,0,0.08); }
    .logo { font-size: 22px; font-weight: 600; color: #1a1a2e; margin-bottom: 0.25rem; }
    .subtitle { font-size: 13px; color: #666; margin-bottom: 1.5rem; }
    label { font-size: 13px; color: #333; display: block; margin-bottom: 4px; }
    input { width: 100%; padding: 10px 12px; border: 1px solid #ddd; border-radius: 8px;
            font-size: 14px; margin-bottom: 1rem; outline: none; }
    input:focus { border-color: #534AB7; box-shadow: 0 0 0 3px rgba(83,74,183,0.1); }
    button { width: 100%; padding: 11px; background: #534AB7; color: white;
             border: none; border-radius: 8px; font-size: 14px; font-weight: 500;
             cursor: pointer; margin-top: 0.5rem; }
    button:hover { background: #3C3489; }
    .error { background: #FCEBEB; color: #A32D2D; font-size: 13px;
             padding: 10px 12px; border-radius: 8px; margin-bottom: 1rem; display: none; }
    .hint { font-size: 12px; color: #999; margin-top: 1rem; text-align: center; line-height: 1.6; }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">BankOnboard</div>
    <div class="subtitle">Secure banking customer onboarding</div>
    <div class="error" id="err"></div>
    <form id="loginForm">
      <label>Email</label>
      <input type="email" id="email" value="manager@bankonboard.io" required/>
      <label>Password</label>
      <input type="password" id="password" value="Password123!" required/>
      <button type="submit">Sign in</button>
    </form>
    <div class="hint">
      Demo accounts:<br/>
      analyst@bankonboard.io (read only)<br/>
      manager@bankonboard.io (full access)
    </div>
  </div>
  <script>
    document.getElementById('loginForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const state = new URLSearchParams(window.location.search).get('state');
      const res = await fetch('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: document.getElementById('email').value,
          password: document.getElementById('password').value,
          state
        })
      });
      const data = await res.json();
      if (data.redirect) {
        window.location.href = data.redirect;
      } else {
        const err = document.getElementById('err');
        err.textContent = data.message || 'Login failed';
        err.style.display = 'block';
      }
    });
  </script>
</body>
</html>
  `);
});

// ─── Authorization endpoint ───────────────────────────────────
authRouter.get('/authorize', (req: Request, res: Response) => {
  const {
    response_type,
    client_id,
    redirect_uri,
    scope,
    state,
    code_challenge,
    code_challenge_method,
  } = req.query as Record<string, string>;

  // Validate required params
  if (response_type !== 'code') {
    return res.status(400).json({ error: 'unsupported_response_type' });
  }

  const client = oauthClients[client_id];
  if (!client) return res.status(400).json({ error: 'invalid_client' });

  if (!client.redirectUris.includes(redirect_uri)) {
    return res.status(400).json({ error: 'invalid_redirect_uri' });
  }

  if (client.pkceRequired && !code_challenge) {
    return res.status(400).json({ error: 'invalid_request', error_description: 'PKCE required' });
  }

  if (code_challenge && code_challenge_method !== 'S256') {
    return res.status(400).json({
      error: 'invalid_request',
      error_description: 'code_challenge_method must be S256',
    });
  }

  // Store authorization request in session (simplified — use Redis in prod)
  const sessionId = Buffer.from(JSON.stringify({
    client_id,
    redirect_uri,
    scope: scope || 'openid',
    state: state || '',
    code_challenge: code_challenge || '',
    code_challenge_method: code_challenge_method || 'S256',
  })).toString('base64url');

  // Redirect to login page
  res.redirect(`/auth/login?state=${encodeURIComponent(sessionId)}`);
});

// ─── Login handler (processes credentials, issues auth code) ──
authRouter.post('/login', async (req: Request, res: Response) => {
  const { email, password, state } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password required' });
  }

  const user = await validateCredentials(email, password);
  if (!user) {
    logger.warn(`Failed login attempt for: ${email}`);
    return res.status(401).json({ message: 'Invalid credentials' });
  }

  // Decode session state
  let session: Record<string, string>;
  try {
    session = JSON.parse(Buffer.from(state as string, 'base64url').toString());
  } catch {
    return res.status(400).json({ message: 'Invalid state parameter' });
  }

  const client = oauthClients[session.client_id];
  if (!client) return res.status(400).json({ message: 'Invalid client' });

  // Intersect requested scopes with user's allowed scopes
  const requestedScopes = (session.scope || '').split(' ').filter(Boolean);
  const allowedScopes = intersectScopes(requestedScopes, [
    ...client.allowedScopes.filter((s) => user.scopes.includes(s)),
  ]);

  // Create authorization code
  const code = createAuthorizationCode({
    clientId: session.client_id,
    userId: user.id,
    redirectUri: session.redirect_uri,
    scopes: allowedScopes,
    codeChallenge: session.code_challenge,
    codeChallengeMethod: (session.code_challenge_method as 'S256') || 'S256',
  });

  logger.info(`Auth code issued: user=${user.id} client=${session.client_id} scopes=${allowedScopes.join(',')}`);

  // Redirect back to client with code
  const redirectUrl = new URL(session.redirect_uri);
  redirectUrl.searchParams.set('code', code);
  if (session.state) redirectUrl.searchParams.set('state', session.state);

  res.json({ redirect: redirectUrl.toString() });
});

// ─── Token endpoint ───────────────────────────────────────────
authRouter.post('/token', async (req: Request, res: Response) => {
  const { grant_type, code, code_verifier, redirect_uri, client_id, refresh_token } = req.body;

  // ── Authorization code grant ──
  if (grant_type === 'authorization_code') {
    if (!code || !code_verifier || !redirect_uri || !client_id) {
      return res.status(400).json({ error: 'invalid_request', error_description: 'Missing required parameters' });
    }

    if (!isValidCodeVerifier(code_verifier)) {
      return res.status(400).json({ error: 'invalid_request', error_description: 'Invalid code_verifier format' });
    }

    const authCode = consumeAuthorizationCode(code);
    if (!authCode) {
      return res.status(400).json({ error: 'invalid_grant', error_description: 'Authorization code invalid or expired' });
    }

    if (authCode.clientId !== client_id) {
      return res.status(400).json({ error: 'invalid_client' });
    }

    if (authCode.redirectUri !== redirect_uri) {
      return res.status(400).json({ error: 'invalid_grant', error_description: 'redirect_uri mismatch' });
    }

    // ── PKCE verification ──
    if (!verifyPkce(code_verifier, authCode.codeChallenge, authCode.codeChallengeMethod)) {
      logger.warn(`PKCE verification failed for client=${client_id}`);
      return res.status(400).json({ error: 'invalid_grant', error_description: 'PKCE verification failed' });
    }

    const user = findUserById(authCode.userId);
    if (!user || !user.active) {
      return res.status(400).json({ error: 'invalid_grant', error_description: 'User not found or inactive' });
    }

    const tokens = generateTokenPair(user, authCode.scopes);
    logger.info(`Tokens issued: user=${user.id} scopes=${authCode.scopes.join(',')}`);

    return res.json({
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken,
      token_type: tokens.tokenType,
      expires_in: tokens.expiresIn,
      scope: tokens.scope,
    });
  }

  // ── Refresh token grant ──
  if (grant_type === 'refresh_token') {
    if (!refresh_token) {
      return res.status(400).json({ error: 'invalid_request' });
    }

    const stored = consumeRefreshToken(refresh_token);
    if (!stored) {
      return res.status(400).json({ error: 'invalid_grant', error_description: 'Refresh token invalid or expired' });
    }

    const user = findUserById(stored.userId);
    if (!user || !user.active) {
      return res.status(400).json({ error: 'invalid_grant' });
    }

    const tokens = generateTokenPair(user, stored.scopes);
    logger.info(`Tokens refreshed: user=${user.id}`);

    return res.json({
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken,
      token_type: tokens.tokenType,
      expires_in: tokens.expiresIn,
      scope: tokens.scope,
    });
  }

  res.status(400).json({ error: 'unsupported_grant_type' });
});

// ─── UserInfo endpoint (OIDC) ─────────────────────────────────
authRouter.get('/userinfo', (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'invalid_token' });
  }
  const token = authHeader.slice(7);
  const payload = verifyAccessToken(token);
  if (!payload) return res.status(401).json({ error: 'invalid_token' });

  const user = findUserById(payload.sub);
  if (!user) return res.status(404).json({ error: 'user_not_found' });

  res.json({
    sub: user.id,
    email: user.email,
    email_verified: true,
    given_name: user.givenName,
    family_name: user.familyName,
    name: `${user.givenName} ${user.familyName}`,
    roles: user.roles,
    scopes: payload.scopes,
  });
});

// ─── Token introspection (RFC 7662) ───────────────────────────
authRouter.post('/introspect', (req: Request, res: Response) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ active: false });

  const payload = verifyAccessToken(token);
  if (!payload) return res.json({ active: false });

  res.json({
    active: true,
    sub: payload.sub,
    scope: payload.scopes.join(' '),
    client_id: 'bankonboard-angular',
    username: payload.email,
    exp: payload.exp,
    iat: payload.iat,
    iss: payload.iss,
    aud: payload.aud,
  });
});

// ─── Token revocation (RFC 7009) ──────────────────────────────
authRouter.post('/revoke', (_req: Request, res: Response) => {
  // In production: add token to Redis blocklist
  // For demo: just return 200 (tokens expire naturally)
  res.status(200).send();
});
