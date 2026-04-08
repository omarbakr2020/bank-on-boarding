import { Component, OnInit } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { CommonModule } from '@angular/common';
import { AuthService } from './services/auth.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, CommonModule],
  template: `
    <div class="app-shell" *ngIf="auth.isAuthenticated$ | async; else loginView">
      <nav class="sidebar">
        <div class="brand">
          <div class="brand-icon">B</div>
          <div class="brand-text">
            <span class="brand-name">BankOnboard</span>
            <span class="brand-sub">TMF632 Platform</span>
          </div>
        </div>
        <ul class="nav-list">
          <li>
            <a routerLink="/dashboard" routerLinkActive="active" class="nav-item">
              <span class="nav-icon">◈</span> Dashboard
            </a>
          </li>
          <li>
            <a routerLink="/customers" routerLinkActive="active" class="nav-item">
              <span class="nav-icon">◉</span> Customers
            </a>
          </li>
          <li *ngIf="auth.hasScope('party:write')">
            <a routerLink="/customers/new" routerLinkActive="active" class="nav-item">
              <span class="nav-icon">⊕</span> Onboard Customer
            </a>
          </li>
        </ul>
        <div class="user-section">
          <div class="user-info" *ngIf="auth.currentUser$ | async as user">
            <div class="user-avatar">{{ user.given_name[0] }}{{ user.family_name[0] }}</div>
            <div class="user-meta">
              <span class="user-name">{{ user.given_name }} {{ user.family_name }}</span>
              <span class="user-role">{{ user.roles[0] | titlecase }}</span>
            </div>
          </div>
          <button class="logout-btn" (click)="auth.logout()">Sign out</button>
        </div>
      </nav>
      <main class="main-content">
        <router-outlet></router-outlet>
      </main>
    </div>

    <ng-template #loginView>
      <div class="login-shell">
        <div class="login-card">
          <div class="login-logo">BankOnboard</div>
          <p class="login-sub">Banking customer onboarding — TMF632 compliant</p>
          <button class="login-btn" (click)="auth.login()">Sign in with OAuth2</button>
          <p class="login-hint">Uses OAuth2 + PKCE authorization code flow</p>
        </div>
      </div>
    </ng-template>
  `,
  styles: [`
    .app-shell { display: flex; height: 100vh; background: #f5f5f0; }

    .sidebar { width: 240px; min-width: 240px; background: #1a1a2e; display: flex;
               flex-direction: column; padding: 1.5rem 0; }
    .brand { display: flex; align-items: center; gap: 12px; padding: 0 1.25rem 1.5rem; }
    .brand-icon { width: 36px; height: 36px; background: #534AB7; border-radius: 8px;
                  display: flex; align-items: center; justify-content: center;
                  color: white; font-weight: 700; font-size: 16px; }
    .brand-name { display: block; color: white; font-weight: 600; font-size: 15px; }
    .brand-sub { display: block; color: #888; font-size: 11px; margin-top: 1px; }

    .nav-list { list-style: none; flex: 1; padding: 0; }
    .nav-item { display: flex; align-items: center; gap: 10px; padding: 10px 1.25rem;
                color: #aaa; text-decoration: none; font-size: 14px; transition: all 0.15s; }
    .nav-item:hover { background: rgba(255,255,255,0.05); color: white; }
    .nav-item.active { background: rgba(83,74,183,0.25); color: #AFA9EC; }
    .nav-icon { font-size: 14px; }

    .user-section { padding: 1rem 1.25rem; border-top: 1px solid rgba(255,255,255,0.08); }
    .user-info { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
    .user-avatar { width: 32px; height: 32px; background: #534AB7; border-radius: 50%;
                   display: flex; align-items: center; justify-content: center;
                   color: white; font-size: 12px; font-weight: 600; }
    .user-name { display: block; color: white; font-size: 13px; font-weight: 500; }
    .user-role { display: block; color: #888; font-size: 11px; }
    .logout-btn { width: 100%; padding: 8px; background: transparent; border: 1px solid rgba(255,255,255,0.12);
                  color: #aaa; border-radius: 6px; cursor: pointer; font-size: 13px; }
    .logout-btn:hover { background: rgba(255,255,255,0.05); color: white; }

    .main-content { flex: 1; overflow-y: auto; }

    .login-shell { height: 100vh; display: flex; align-items: center; justify-content: center;
                   background: #f5f5f0; }
    .login-card { background: white; border-radius: 12px; padding: 2.5rem; width: 360px;
                  box-shadow: 0 2px 16px rgba(0,0,0,0.08); text-align: center; }
    .login-logo { font-size: 24px; font-weight: 700; color: #1a1a2e; margin-bottom: 8px; }
    .login-sub { color: #666; font-size: 14px; margin-bottom: 2rem; }
    .login-btn { width: 100%; padding: 12px; background: #534AB7; color: white; border: none;
                 border-radius: 8px; font-size: 15px; font-weight: 500; cursor: pointer; }
    .login-btn:hover { background: #3C3489; }
    .login-hint { color: #999; font-size: 12px; margin-top: 1rem; }
  `],
})
export class AppComponent implements OnInit {
  constructor(public auth: AuthService) {}
  ngOnInit() { this.auth.handleCallback(); }
}
