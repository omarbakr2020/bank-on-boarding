import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { CustomerService, Individual } from '../../services/customer.service';
import { AuthService } from '../../services/auth.service';
import { switchMap, interval, startWith, takeWhile } from 'rxjs';

@Component({
  selector: 'app-customer-detail',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div class="page" *ngIf="customer">
      <div class="back"><a routerLink="/customers">← Customers</a></div>

      <div class="hero">
        <div class="hero-avatar">{{ customer.givenName[0] }}{{ customer.familyName[0] }}</div>
        <div class="hero-info">
          <h1>{{ customer.givenName }} {{ customer.familyName }}</h1>
          <div class="hero-meta">
            <span class="badge" [class]="'kyc-' + customer.kycStatus">{{ customer.kycStatus | titlecase }}</span>
            <span *ngIf="customer.riskRating" class="badge" [class]="'risk-' + customer.riskRating">
              {{ customer.riskRating | titlecase }} Risk
            </span>
            <span class="tmf-type">&#64;type: {{ customer['@type'] }}</span>
          </div>
        </div>
        <button *ngIf="auth.hasScope('ai:invoke') && !riskQueued"
                class="ai-btn" (click)="triggerAI()">
          Run AI Risk Assessment
        </button>
        <span *ngIf="riskQueued" class="queued-badge">AI assessment queued…</span>
      </div>

      <div class="grid">
        <!-- Identity card -->
        <div class="card">
          <div class="card-title">Identity</div>
          <div class="field"><span>TMF ID</span><span class="mono">{{ customer.id }}</span></div>
          <div class="field"><span>&#64;type</span><span>{{ customer['@type'] }}</span></div>
          <div class="field"><span>&#64;baseType</span><span>{{ customer['@baseType'] }}</span></div>
          <div class="field"><span>Status</span><span>{{ customer.status | titlecase }}</span></div>
          <div class="field"><span>Gender</span><span>{{ customer.gender || '—' }}</span></div>
          <div class="field"><span>Nationality</span><span>{{ customer.nationality || '—' }}</span></div>
          <div class="field"><span>Date of birth</span><span>{{ customer.birthDate || '—' }}</span></div>
          <div class="field"><span>Last update</span><span>{{ customer.lastUpdate | date:'dd MMM yyyy, HH:mm' }}</span></div>
        </div>

        <!-- Contact card -->
        <div class="card">
          <div class="card-title">Contact information</div>
          <div *ngFor="let cm of customer.contactMedium" class="contact-item">
            <div class="contact-type">{{ cm.mediumType }}</div>
            <div class="contact-val">
              <span *ngIf="cm.characteristic.emailAddress">{{ cm.characteristic.emailAddress }}</span>
              <span *ngIf="cm.characteristic.phoneNumber">{{ cm.characteristic.phoneNumber }}</span>
              <span *ngIf="cm.characteristic.street1">
                {{ cm.characteristic.street1 }}, {{ cm.characteristic.city }}, {{ cm.characteristic.country }}
              </span>
            </div>
            <span *ngIf="cm.preferred" class="pref-badge">Preferred</span>
          </div>
          <div *ngIf="!customer.contactMedium?.length" class="muted">No contact info</div>
        </div>

        <!-- Risk assessment card -->
        <div class="card risk-card">
          <div class="card-title">KYC / Risk Assessment</div>
          <div class="risk-row">
            <div class="risk-item">
              <div class="risk-label">KYC Status</div>
              <span [class]="'badge kyc-' + customer.kycStatus">{{ customer.kycStatus | titlecase }}</span>
            </div>
            <div class="risk-item">
              <div class="risk-label">AML Cleared</div>
              <span [class]="customer.amlCleared ? 'badge aml-ok' : 'badge aml-no'">
                {{ customer.amlCleared ? '✓ Cleared' : '✗ Pending' }}
              </span>
            </div>
            <div class="risk-item">
              <div class="risk-label">PEP Status</div>
              <span [class]="customer.pepStatus ? 'badge risk-high' : 'badge kyc-approved'">
                {{ customer.pepStatus ? 'PEP Identified' : 'No PEP' }}
              </span>
            </div>
          </div>

          <div *ngIf="customer.riskScore != null" class="score-bar-wrap">
            <div class="score-label">
              Risk score: <strong>{{ (customer.riskScore * 100).toFixed(0) }}%</strong>
              <span [class]="'badge risk-' + customer.riskRating" style="margin-left:8px">
                {{ customer.riskRating | titlecase }}
              </span>
            </div>
            <div class="score-bar">
              <div class="score-fill" [style.width.%]="(customer.riskScore ?? 0) * 100"
                   [class]="'fill-' + (customer.riskRating ?? 'low')"></div>
            </div>
          </div>

          <div *ngIf="customer.riskSummary" class="risk-summary">{{ customer.riskSummary }}</div>

          <div *ngIf="customer.kycFlags?.length" class="flags">
            <div class="flags-label">Flags identified:</div>
            <div *ngFor="let flag of customer.kycFlags" class="flag-item">⚑ {{ flag }}</div>
          </div>

          <div *ngIf="customer.kycRecommendedAction" class="action-row">
            <span class="action-label">Recommended action:</span>
            <span [class]="'badge action-' + customer.kycRecommendedAction">
              {{ customer.kycRecommendedAction | titlecase }}
            </span>
          </div>
        </div>

        <!-- Identity documents -->
        <div class="card">
          <div class="card-title">Identity documents</div>
          <div *ngFor="let doc of customer.identityDocument" class="doc-item">
            <div class="doc-type">{{ doc.documentType | titlecase }}</div>
            <div class="doc-meta">
              {{ doc.documentNumber }} · {{ doc.issuingCountry }}
              <span *ngIf="doc.expiryDate"> · Expires {{ doc.expiryDate }}</span>
              <span [class]="doc.verified ? 'verified' : 'unverified'">
                {{ doc.verified ? '✓ Verified' : '○ Unverified' }}
              </span>
            </div>
          </div>
          <div *ngIf="!customer.identityDocument?.length" class="muted">No documents on file</div>
        </div>
      </div>
    </div>

    <div *ngIf="!customer && !loading" class="not-found">Customer not found.</div>
    <div *ngIf="loading" class="loading">Loading…</div>
  `,
  styles: [`
    .page { padding: 2rem; max-width: 1000px; }
    .back a { color: #534AB7; text-decoration: none; font-size: 13px; }
    .hero { display: flex; align-items: center; gap: 16px; margin: 1.25rem 0 2rem;
            background: white; border-radius: 12px; padding: 1.5rem; border: 1px solid #eee; }
    .hero-avatar { width: 56px; height: 56px; min-width: 56px; background: #EEEDFE; border-radius: 50%;
                   display: flex; align-items: center; justify-content: center;
                   font-size: 18px; font-weight: 700; color: #3C3489; }
    .hero-info { flex: 1; }
    h1 { font-size: 20px; font-weight: 600; color: #1a1a2e; margin-bottom: 8px; }
    .hero-meta { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
    .tmf-type { font-size: 11px; color: #999; font-family: monospace; }
    .ai-btn { padding: 9px 16px; background: #534AB7; color: white; border: none;
              border-radius: 8px; cursor: pointer; font-size: 13px; white-space: nowrap; }
    .ai-btn:hover { background: #3C3489; }
    .queued-badge { font-size: 12px; color: #854F0B; background: #FAEEDA;
                    padding: 6px 12px; border-radius: 20px; }

    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
    .card { background: white; border-radius: 10px; border: 1px solid #eee; padding: 1.25rem; }
    .card-title { font-size: 13px; font-weight: 600; color: #888; text-transform: uppercase;
                  letter-spacing: 0.05em; margin-bottom: 1rem; }
    .field { display: flex; justify-content: space-between; padding: 6px 0;
             border-bottom: 1px solid #f9f9f9; font-size: 13px; }
    .field span:first-child { color: #888; }
    .field span:last-child { color: #1a1a2e; font-weight: 500; text-align: right; }
    .mono { font-family: monospace; font-size: 11px; color: #666; }

    .contact-item { padding: 8px 0; border-bottom: 1px solid #f9f9f9; display: flex;
                    align-items: center; gap: 8px; font-size: 13px; }
    .contact-type { font-size: 11px; background: #f0f0f0; padding: 2px 8px; border-radius: 20px; color: #666; }
    .contact-val { flex: 1; color: #1a1a2e; }
    .pref-badge { font-size: 11px; background: #EEEDFE; color: #3C3489; padding: 2px 8px; border-radius: 20px; }

    .risk-card { grid-column: 1 / -1; }
    .risk-row { display: flex; gap: 2rem; margin-bottom: 1rem; flex-wrap: wrap; }
    .risk-item { display: flex; flex-direction: column; gap: 6px; }
    .risk-label { font-size: 12px; color: #888; }
    .score-bar-wrap { margin: 1rem 0; }
    .score-label { font-size: 13px; color: #333; margin-bottom: 8px; display: flex; align-items: center; }
    .score-bar { height: 8px; background: #f0f0f0; border-radius: 4px; overflow: hidden; }
    .score-fill { height: 100%; border-radius: 4px; transition: width 0.5s; }
    .fill-low { background: #639922; }
    .fill-medium { background: #EF9F27; }
    .fill-high { background: #E24B4A; }
    .fill-very_high { background: #A32D2D; }
    .risk-summary { font-size: 13px; color: #555; line-height: 1.6; padding: 10px;
                    background: #f9f9f9; border-radius: 6px; margin-top: 8px; }
    .flags { margin-top: 10px; }
    .flags-label { font-size: 12px; color: #888; margin-bottom: 6px; }
    .flag-item { font-size: 13px; color: #854F0B; padding: 4px 0; }
    .action-row { display: flex; align-items: center; gap: 10px; margin-top: 12px; font-size: 13px; }
    .action-label { color: #666; }
    .action-approve { background: #EAF3DE; color: #27500A; }
    .action-manual_review { background: #FAEEDA; color: #854F0B; }
    .action-enhanced_due_diligence { background: #FAEEDA; color: #854F0B; }
    .action-reject { background: #FCEBEB; color: #A32D2D; }

    .doc-item { padding: 8px 0; border-bottom: 1px solid #f9f9f9; }
    .doc-type { font-size: 13px; font-weight: 500; color: #1a1a2e; }
    .doc-meta { font-size: 12px; color: #888; margin-top: 2px; }
    .verified { color: #27500A; margin-left: 8px; font-weight: 500; }
    .unverified { color: #888; margin-left: 8px; }

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
    .muted { color: #bbb; font-size: 13px; padding: 8px 0; }
    .loading, .not-found { padding: 3rem; text-align: center; color: #999; }
  `],
})
export class CustomerDetailComponent implements OnInit {
  customer: Individual | null = null;
  loading = true;
  riskQueued = false;

  constructor(
    private route: ActivatedRoute,
    private svc: CustomerService,
    public auth: AuthService,
  ) {}

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id')!;
    this.svc.getIndividual(id).subscribe({
      next: (c) => { this.customer = c; this.loading = false; },
      error: () => { this.loading = false; },
    });
  }

  triggerAI(): void {
    if (!this.customer) return;
    this.svc.triggerRiskAssessment(this.customer.id).subscribe({
      next: () => {
        this.riskQueued = true;
        // Poll until risk score arrives (max 60s)
        let polls = 0;
        const poller = interval(5000).pipe(
          switchMap(() => this.svc.getIndividual(this.customer!.id)),
          takeWhile(() => polls++ < 12 && !this.customer?.riskScore)
        ).subscribe(c => {
          this.customer = c;
          if (c.riskScore != null) { this.riskQueued = false; poller.unsubscribe(); }
        });
      },
    });
  }
}
