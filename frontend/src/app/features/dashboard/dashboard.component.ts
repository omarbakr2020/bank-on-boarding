import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { CustomerService, Individual } from '../../services/customer.service';
import { AuthService } from '../../services/auth.service';
import { forkJoin } from 'rxjs';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div class="page">
      <div class="page-header">
        <div>
          <h1>Dashboard</h1>
          <p>Banking customer onboarding overview</p>
        </div>
        <a
          *ngIf="auth.hasScope('party:write')"
          routerLink="/customers/new"
          class="cta-btn"
          >+ Onboard Customer</a
        >
      </div>

      <div class="metrics-grid">
        <div class="metric-card">
          <div class="metric-label">Total Customers</div>
          <div class="metric-value">{{ totalCustomers }}</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">KYC Approved</div>
          <div class="metric-value approved">{{ approvedCount }}</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Pending Review</div>
          <div class="metric-value pending">{{ pendingCount }}</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">High Risk</div>
          <div class="metric-value risk">{{ highRiskCount }}</div>
        </div>
      </div>

      <div class="section">
        <div class="section-header">
          <h2>Recent customers</h2>
          <a routerLink="/customers" class="view-all">View all →</a>
        </div>
        <div *ngIf="loading" class="loading">Loading…</div>
        <table class="data-table" *ngIf="!loading && recentCustomers.length">
          <thead>
            <tr>
              <th>Name</th>
              <th>Nationality</th>
              <th>KYC Status</th>
              <th>Risk</th>
              <th>Updated</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let c of recentCustomers">
              <td class="name-cell">
                <div class="avatar">
                  {{ c.givenName[0] }}{{ c.familyName[0] }}
                </div>
                <span>{{ c.givenName }} {{ c.familyName }}</span>
              </td>
              <td>{{ c.nationality || '—' }}</td>
              <td>
                <span [class]="'badge kyc-' + c.kycStatus">{{
                  c.kycStatus | titlecase
                }}</span>
              </td>
              <td>
                <span
                  *ngIf="c.riskRating"
                  [class]="'badge risk-' + c.riskRating"
                >
                  {{ c.riskRating | titlecase }}
                </span>
                <span *ngIf="!c.riskRating" class="muted">Pending…</span>
              </td>
              <td class="muted">{{ c.lastUpdate | date: 'dd MMM, HH:mm' }}</td>
              <td>
                <a [routerLink]="['/customers', c.id]" class="link">View →</a>
              </td>
            </tr>
          </tbody>
        </table>
        <div *ngIf="!loading && !recentCustomers.length" class="empty">
          No customers yet.
          <a *ngIf="auth.hasScope('party:write')" routerLink="/customers/new"
            >Onboard the first one →</a
          >
        </div>
      </div>
    </div>
  `,
  styles: [
    `
      .page {
        padding: 2rem;
        max-width: 1100px;
      }
      .page-header {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        margin-bottom: 2rem;
      }
      h1 {
        font-size: 22px;
        font-weight: 600;
        color: #1a1a2e;
        margin-bottom: 4px;
      }
      h1 + p {
        color: #666;
        font-size: 14px;
      }
      h2 {
        font-size: 16px;
        font-weight: 600;
        color: #1a1a2e;
      }
      .cta-btn {
        padding: 10px 20px;
        background: #534ab7;
        color: white;
        border-radius: 8px;
        text-decoration: none;
        font-size: 14px;
        font-weight: 500;
      }
      .cta-btn:hover {
        background: #3c3489;
      }

      .metrics-grid {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 16px;
        margin-bottom: 2rem;
      }
      .metric-card {
        background: white;
        border-radius: 10px;
        padding: 1.25rem;
        border: 1px solid #eee;
      }
      .metric-label {
        font-size: 12px;
        color: #888;
        margin-bottom: 8px;
      }
      .metric-value {
        font-size: 28px;
        font-weight: 700;
        color: #1a1a2e;
      }
      .metric-value.approved {
        color: #27500a;
      }
      .metric-value.pending {
        color: #854f0b;
      }
      .metric-value.risk {
        color: #a32d2d;
      }

      .section {
        background: white;
        border-radius: 10px;
        border: 1px solid #eee;
      }
      .section-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 1rem 1.25rem;
        border-bottom: 1px solid #f0f0f0;
      }
      .view-all {
        font-size: 13px;
        color: #534ab7;
        text-decoration: none;
      }

      .data-table {
        width: 100%;
        border-collapse: collapse;
      }
      .data-table th {
        padding: 10px 12px;
        text-align: left;
        font-size: 12px;
        color: #888;
        font-weight: 500;
        border-bottom: 1px solid #f0f0f0;
      }
      .data-table td {
        padding: 12px;
        border-bottom: 1px solid #f9f9f9;
        font-size: 14px;
      }
      .name-cell {
        display: flex;
        align-items: center;
        gap: 10px;
      }
      .avatar {
        width: 32px;
        height: 32px;
        background: #eeedfe;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 11px;
        font-weight: 600;
        color: #3c3489;
      }
      .muted {
        color: #999;
        font-size: 13px;
      }
      .link {
        color: #534ab7;
        text-decoration: none;
        font-size: 13px;
      }

      .badge {
        display: inline-block;
        font-size: 11px;
        font-weight: 500;
        padding: 3px 8px;
        border-radius: 20px;
      }
      .kyc-approved {
        background: #eaf3de;
        color: #27500a;
      }
      .kyc-pending {
        background: #f1efe8;
        color: #5f5e5a;
      }
      .kyc-in_review {
        background: #faeeda;
        color: #854f0b;
      }
      .kyc-rejected {
        background: #fcebeb;
        color: #a32d2d;
      }
      .risk-low {
        background: #eaf3de;
        color: #27500a;
      }
      .risk-medium {
        background: #faeeda;
        color: #854f0b;
      }
      .risk-high {
        background: #fcebeb;
        color: #a32d2d;
      }
      .risk-very_high {
        background: #a32d2d;
        color: white;
      }

      .loading,
      .empty {
        padding: 2rem;
        text-align: center;
        color: #999;
        font-size: 14px;
      }
      .empty a {
        color: #534ab7;
        text-decoration: none;
      }
    `,
  ],
})
export class DashboardComponent implements OnInit {
  recentCustomers: Individual[] = [];
  totalCustomers = 0;
  approvedCount = 0;
  pendingCount = 0;
  highRiskCount = 0;
  loading = true;

  constructor(
    private svc: CustomerService,
    public auth: AuthService,
  ) {}

  ngOnInit(): void {
    this.svc.listIndividuals({ limit: 100 }).subscribe({
      next: (all) => {
        this.totalCustomers = all.length;
        this.approvedCount = all.filter(
          (c) => c.kycStatus === 'approved',
        ).length;
        this.pendingCount = all.filter((c) =>
          ['pending', 'in_review'].includes(c.kycStatus),
        ).length;
        this.highRiskCount = all.filter((c) =>
          ['high', 'very_high'].includes(c.riskRating ?? ''),
        ).length;
        this.recentCustomers = all.slice(0, 8);
        this.loading = false;
      },
      error: () => {
        this.loading = false;
      },
    });
  }
}
