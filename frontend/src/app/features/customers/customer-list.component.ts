import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { interval, Subscription, switchMap, startWith } from 'rxjs';
import { CustomerService, Individual } from '../../services/customer.service';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-customer-list',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <div class="page">
      <div class="page-header">
        <div>
          <h1>Customers</h1>
          <p>TMF632 Individual records</p>
        </div>
        <a routerLink="/customers/new" class="cta-btn" *ngIf="auth.hasScope('party:write')">
          + Onboard Customer
        </a>
      </div>

      <div class="filters">
        <input placeholder="Search by name…" [(ngModel)]="search" (input)="applyFilter()"
               class="filter-input"/>
        <select [(ngModel)]="kycFilter" (change)="applyFilter()" class="filter-select">
          <option value="">All KYC statuses</option>
          <option value="pending">Pending</option>
          <option value="in_review">In Review</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
        </select>
        <select [(ngModel)]="riskFilter" (change)="applyFilter()" class="filter-select">
          <option value="">All risk levels</option>
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
          <option value="very_high">Very High</option>
        </select>
        <span class="count">{{ filtered.length }} record(s)</span>
      </div>

      <div class="table-wrap">
        <div *ngIf="loading" class="loading">Loading customers…</div>
        <table class="data-table" *ngIf="!loading">
          <thead>
            <tr>
              <th>Customer</th>
              <th>Nationality</th>
              <th>KYC Status</th>
              <th>Risk</th>
              <th>Score</th>
              <th>AML</th>
              <th>Updated</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let c of filtered">
              <td class="name-cell">
                <div class="avatar">{{ c.givenName[0] }}{{ c.familyName[0] }}</div>
                <div>
                  <div class="name">{{ c.givenName }} {{ c.familyName }}</div>
                  <div class="email">{{ getEmail(c) }}</div>
                </div>
              </td>
              <td>{{ c.nationality || '—' }}</td>
              <td><span [class]="'badge kyc-' + c.kycStatus">{{ c.kycStatus | titlecase }}</span></td>
              <td>
                <span *ngIf="c.riskRating" [class]="'badge risk-' + c.riskRating">
                  {{ c.riskRating | titlecase }}
                </span>
                <span *ngIf="!c.riskRating" class="muted">—</span>
              </td>
              <td>
                <span *ngIf="c.riskScore != null" class="score">
                  {{ (c.riskScore * 100).toFixed(0) }}%
                </span>
                <span *ngIf="c.riskScore == null" class="muted">—</span>
              </td>
              <td>
                <span [class]="c.amlCleared ? 'badge aml-ok' : 'badge aml-no'">
                  {{ c.amlCleared ? '✓ Cleared' : '✗ Pending' }}
                </span>
              </td>
              <td class="muted">{{ c.lastUpdate | date:'dd MMM, HH:mm' }}</td>
              <td><a [routerLink]="['/customers', c.id]" class="link">View →</a></td>
            </tr>
          </tbody>
        </table>
        <div *ngIf="!loading && filtered.length === 0" class="empty">
          No customers match your filters.
        </div>
      </div>
    </div>
  `,
  styles: [`
    .page { padding: 2rem; max-width: 1200px; }
    .page-header { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 1.5rem; }
    h1 { font-size: 22px; font-weight: 600; color: #1a1a2e; margin-bottom: 4px; }
    h1 + p { color: #666; font-size: 14px; }
    .cta-btn { padding: 10px 20px; background: #534AB7; color: white; border-radius: 8px;
               text-decoration: none; font-size: 14px; font-weight: 500; }

    .filters { display: flex; gap: 10px; align-items: center; margin-bottom: 1rem; flex-wrap: wrap; }
    .filter-input { padding: 8px 12px; border: 1px solid #ddd; border-radius: 6px;
                    font-size: 13px; min-width: 200px; }
    .filter-select { padding: 8px 12px; border: 1px solid #ddd; border-radius: 6px;
                     font-size: 13px; background: white; }
    .count { margin-left: auto; font-size: 13px; color: #888; }

    .table-wrap { background: white; border-radius: 10px; border: 1px solid #eee; }
    .data-table { width: 100%; border-collapse: collapse; }
    .data-table th { padding: 10px 12px; text-align: left; font-size: 12px; color: #888;
                     font-weight: 500; border-bottom: 1px solid #f0f0f0; }
    .data-table td { padding: 11px 12px; border-bottom: 1px solid #f9f9f9; font-size: 14px; vertical-align: middle; }
    .name-cell { display: flex; align-items: center; gap: 10px; }
    .avatar { width: 34px; height: 34px; min-width: 34px; background: #EEEDFE; border-radius: 50%;
              display: flex; align-items: center; justify-content: center;
              font-size: 11px; font-weight: 600; color: #3C3489; }
    .name { font-weight: 500; color: #1a1a2e; }
    .email { font-size: 12px; color: #999; }
    .muted { color: #bbb; font-size: 13px; }
    .score { font-weight: 500; color: #534AB7; }
    .link { color: #534AB7; text-decoration: none; font-size: 13px; white-space: nowrap; }

    .badge { display: inline-block; font-size: 11px; font-weight: 500; padding: 3px 8px; border-radius: 20px; }
    .kyc-approved { background: #EAF3DE; color: #27500A; }
    .kyc-pending, .kyc-document_submitted { background: #F1EFE8; color: #5F5E5A; }
    .kyc-in_review { background: #FAEEDA; color: #854F0B; }
    .kyc-rejected { background: #FCEBEB; color: #A32D2D; }
    .risk-low { background: #EAF3DE; color: #27500A; }
    .risk-medium { background: #FAEEDA; color: #854F0B; }
    .risk-high, .risk-very_high { background: #FCEBEB; color: #A32D2D; }
    .aml-ok { background: #EAF3DE; color: #27500A; }
    .aml-no { background: #F1EFE8; color: #888; }
    .loading, .empty { padding: 2rem; text-align: center; color: #999; font-size: 14px; }
  `],
})
export class CustomerListComponent implements OnInit, OnDestroy {
  customers: Individual[] = [];
  filtered: Individual[] = [];
  loading = true;
  search = '';
  kycFilter = '';
  riskFilter = '';
  private poll$!: Subscription;

  constructor(public auth: AuthService, private svc: CustomerService) {}

  ngOnInit(): void {
    // Poll every 15 seconds — shows async AI risk scores arriving
    this.poll$ = interval(15_000).pipe(
      startWith(0),
      switchMap(() => this.svc.listIndividuals({ limit: 100 }))
    ).subscribe({
      next: (list) => { this.customers = list; this.applyFilter(); this.loading = false; },
      error: () => { this.loading = false; },
    });
  }

  ngOnDestroy(): void { this.poll$?.unsubscribe(); }

  applyFilter(): void {
    this.filtered = this.customers.filter(c => {
      const nameMatch = !this.search ||
        `${c.givenName} ${c.familyName}`.toLowerCase().includes(this.search.toLowerCase());
      const kycMatch = !this.kycFilter || c.kycStatus === this.kycFilter;
      const riskMatch = !this.riskFilter || c.riskRating === this.riskFilter;
      return nameMatch && kycMatch && riskMatch;
    });
  }

  getEmail(c: Individual): string {
    const em = c.contactMedium?.find(m => m.mediumType === 'email');
    return em?.characteristic?.emailAddress ?? '';
  }
}
