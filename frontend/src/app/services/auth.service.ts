import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { BehaviorSubject, Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface UserInfo {
  sub: string;
  email: string;
  given_name: string;
  family_name: string;
  roles: string[];
  scopes: string[];
}

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly CLIENT_ID = 'bankonboard-angular';
  private readonly REDIRECT_URI = `${window.location.origin}/auth/callback`;
  private readonly SCOPES = 'openid profile party:read party:write ai:invoke';

  private _isAuthenticated = new BehaviorSubject<boolean>(this.hasValidToken());
  private _currentUser = new BehaviorSubject<UserInfo | null>(this.loadStoredUser());

  isAuthenticated$ = this._isAuthenticated.asObservable();
  currentUser$ = this._currentUser.asObservable();

  constructor(private http: HttpClient, private router: Router) {
    if (this.hasValidToken()) {
      this.loadUserInfo(); // refresh in background — UI shows cached value instantly
    }
  }

  // ── PKCE helpers ──────────────────────────────────────────

  private generateCodeVerifier(): string {
    const array = new Uint8Array(32);
    window.crypto.getRandomValues(array);
    return btoa(String.fromCharCode(...array))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  }

  private async generateCodeChallenge(verifier: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(verifier);
    const digest = await window.crypto.subtle.digest('SHA-256', data);
    return btoa(String.fromCharCode(...new Uint8Array(digest)))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  }

  // ── OAuth2 authorization code flow with PKCE ──────────────

  async login(): Promise<void> {
    const verifier = this.generateCodeVerifier();
    const challenge = await this.generateCodeChallenge(verifier);
    const state = this.generateCodeVerifier().slice(0, 16);

    sessionStorage.setItem('pkce_verifier', verifier);
    sessionStorage.setItem('oauth_state', state);

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.CLIENT_ID,
      redirect_uri: this.REDIRECT_URI,
      scope: this.SCOPES,
      state,
      code_challenge: challenge,
      code_challenge_method: 'S256',
    });

    window.location.href = `${environment.gatewayUrl}/auth/authorize?${params}`;
  }

  async handleCallback(): Promise<void> {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const state = params.get('state');
    const storedState = sessionStorage.getItem('oauth_state');

    if (!code) return;

    // Validate state to prevent CSRF
    if (state !== storedState) {
      console.error('OAuth2 state mismatch — potential CSRF attack');
      return;
    }

    const verifier = sessionStorage.getItem('pkce_verifier');
    if (!verifier) {
      console.error('Missing PKCE code verifier');
      return;
    }

    try {
      const body = new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        code_verifier: verifier,
        redirect_uri: this.REDIRECT_URI,
        client_id: this.CLIENT_ID,
      });

      const tokens = await this.http.post<TokenResponse>(
        `${environment.gatewayUrl}/auth/token`,
        body.toString(),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
      ).toPromise();

      if (tokens) {
        this.storeTokens(tokens);
        sessionStorage.removeItem('pkce_verifier');
        sessionStorage.removeItem('oauth_state');
        await this.loadUserInfo();
        this.router.navigate(['/dashboard']);
      }
    } catch (err) {
      console.error('Token exchange failed:', err);
    }
  }

  async refreshTokens(): Promise<boolean> {
    const refreshToken = localStorage.getItem('refresh_token');
    if (!refreshToken) return false;

    try {
      const body = new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: this.CLIENT_ID,
      });

      const tokens = await this.http.post<TokenResponse>(
        `${environment.gatewayUrl}/auth/token`,
        body.toString(),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
      ).toPromise();

      if (tokens) {
        this.storeTokens(tokens);
        return true;
      }
    } catch {
      this.logout();
    }
    return false;
  }

  logout(): void {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('token_expires_at');
    localStorage.removeItem('user_info');
    this._isAuthenticated.next(false);
    this._currentUser.next(null);
    this.router.navigate(['/']);
  }

  getAccessToken(): string | null {
    return localStorage.getItem('access_token');
  }

  hasScope(scope: string): boolean {
    const user = this._currentUser.getValue();
    return user?.scopes.includes(scope) ?? false;
  }

  private hasValidToken(): boolean {
    const token = localStorage.getItem('access_token');
    const expiresAt = localStorage.getItem('token_expires_at');
    if (!token || !expiresAt) return false;
    return Date.now() < parseInt(expiresAt, 10) - 60_000;
  }

  private loadStoredUser(): UserInfo | null {
    try {
      const stored = localStorage.getItem('user_info');
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  }

  private storeTokens(tokens: TokenResponse): void {
    localStorage.setItem('access_token', tokens.access_token);
    localStorage.setItem('refresh_token', tokens.refresh_token);
    localStorage.setItem('token_expires_at', String(Date.now() + tokens.expires_in * 1000));
    this._isAuthenticated.next(true);
  }

  private loadUserInfo(): void {
    this.http.get<UserInfo>(`${environment.gatewayUrl}/auth/userinfo`).subscribe({
      next: (user) => {
        localStorage.setItem('user_info', JSON.stringify(user));
        this._currentUser.next(user);
      },
      error: (err) => console.error('Failed to load user info:', err),
    });
  }
}
