import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { CustomerService, IndividualCreate, ContactMedium } from '../../services/customer.service';

@Component({
  selector: 'app-onboarding',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  template: `
    <div class="page">
      <div class="back"><a routerLink="/customers">← Customers</a></div>
      <div class="header">
        <h1>Onboard new customer</h1>
        <p>Creates a TMF632 Individual record. AI KYC risk assessment runs automatically.</p>
      </div>

      <form [formGroup]="form" (ngSubmit)="submit()" class="form-card">

        <div class="section-label">Personal information</div>
        <div class="field-row">
          <div class="field-group">
            <label>Given name *</label>
            <input formControlName="givenName" placeholder="Omar"/>
            <div class="err" *ngIf="f['givenName'].touched && f['givenName'].errors?.['required']">Required</div>
          </div>
          <div class="field-group">
            <label>Family name *</label>
            <input formControlName="familyName" placeholder="Hassan"/>
            <div class="err" *ngIf="f['familyName'].touched && f['familyName'].errors?.['required']">Required</div>
          </div>
        </div>

        <div class="field-row">
          <div class="field-group">
            <label>Title</label>
            <select formControlName="title">
              <option value="">—</option>
              <option>Mr</option><option>Mrs</option><option>Ms</option>
              <option>Dr</option><option>Prof</option>
            </select>
          </div>
          <div class="field-group">
            <label>Gender</label>
            <select formControlName="gender">
              <option value="">—</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="non_binary">Non-binary</option>
              <option value="undisclosed">Undisclosed</option>
            </select>
          </div>
        </div>

        <div class="field-row">
          <div class="field-group">
            <label>Nationality</label>
            <input formControlName="nationality" placeholder="e.g. Egyptian"/>
          </div>
          <div class="field-group">
            <label>Date of birth</label>
            <input type="date" formControlName="birthDate"/>
          </div>
        </div>

        <div class="field-group">
          <label>Tax ID / National ID number</label>
          <input formControlName="taxId" placeholder="e.g. 29001011234567"/>
        </div>

        <div class="section-label" style="margin-top:1.5rem">Contact information</div>
        <div class="field-row">
          <div class="field-group">
            <label>Email address *</label>
            <input type="email" formControlName="email" placeholder="omar@example.com"/>
            <div class="err" *ngIf="f['email'].touched && f['email'].errors?.['required']">Required</div>
            <div class="err" *ngIf="f['email'].touched && f['email'].errors?.['email']">Valid email required</div>
          </div>
          <div class="field-group">
            <label>Phone number</label>
            <input formControlName="phone" placeholder="+20 100 000 0000"/>
          </div>
        </div>

        <div class="section-label" style="margin-top:1.5rem">Identity document</div>
        <div class="field-row">
          <div class="field-group">
            <label>Document type</label>
            <select formControlName="docType">
              <option value="">— (skip) —</option>
              <option value="national_id">National ID</option>
              <option value="passport">Passport</option>
              <option value="driving_license">Driving License</option>
            </select>
          </div>
          <div class="field-group">
            <label>Document number</label>
            <input formControlName="docNumber" placeholder="AB123456789"/>
          </div>
        </div>
        <div class="field-row" *ngIf="f['docType'].value">
          <div class="field-group">
            <label>Issuing country</label>
            <input formControlName="docCountry" placeholder="EG"/>
          </div>
          <div class="field-group">
            <label>Expiry date</label>
            <input type="date" formControlName="docExpiry"/>
          </div>
        </div>

        <div class="form-actions">
          <a routerLink="/customers" class="cancel-btn">Cancel</a>
          <button type="submit" class="submit-btn" [disabled]="submitting || form.invalid">
            {{ submitting ? 'Creating…' : 'Create customer & run AI assessment' }}
          </button>
        </div>

        <div *ngIf="error" class="error-banner">{{ error }}</div>
        <div *ngIf="success" class="success-banner">
          ✓ Customer created. AI risk assessment queued — results will appear shortly.
        </div>
      </form>
    </div>
  `,
  styles: [`
    .page { padding: 2rem; max-width: 720px; }
    .back a { color: #534AB7; text-decoration: none; font-size: 13px; }
    .header { margin: 1rem 0 1.5rem; }
    h1 { font-size: 20px; font-weight: 600; color: #1a1a2e; margin-bottom: 4px; }
    h1 + p { font-size: 14px; color: #666; }

    .form-card { background: white; border-radius: 12px; border: 1px solid #eee; padding: 1.75rem; }
    .section-label { font-size: 12px; font-weight: 600; color: #888; text-transform: uppercase;
                     letter-spacing: 0.05em; margin-bottom: 1rem; }
    .field-row { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px; }
    .field-group { display: flex; flex-direction: column; gap: 6px; margin-bottom: 16px; }
    .field-row .field-group { margin-bottom: 0; }
    label { font-size: 13px; color: #444; font-weight: 500; }
    input, select { padding: 9px 12px; border: 1px solid #ddd; border-radius: 6px; font-size: 14px; }
    input:focus, select:focus { outline: none; border-color: #534AB7;
                                 box-shadow: 0 0 0 3px rgba(83,74,183,0.1); }
    .err { font-size: 12px; color: #A32D2D; }

    .form-actions { display: flex; gap: 12px; justify-content: flex-end; margin-top: 2rem;
                    padding-top: 1.5rem; border-top: 1px solid #f0f0f0; }
    .cancel-btn { padding: 10px 20px; border: 1px solid #ddd; border-radius: 8px; color: #666;
                  text-decoration: none; font-size: 14px; }
    .submit-btn { padding: 10px 24px; background: #534AB7; color: white; border: none;
                  border-radius: 8px; cursor: pointer; font-size: 14px; font-weight: 500; }
    .submit-btn:disabled { opacity: 0.6; cursor: not-allowed; }
    .submit-btn:hover:not(:disabled) { background: #3C3489; }
    .error-banner { background: #FCEBEB; color: #A32D2D; border-radius: 6px; padding: 10px 14px;
                    font-size: 13px; margin-top: 1rem; }
    .success-banner { background: #EAF3DE; color: #27500A; border-radius: 6px; padding: 10px 14px;
                      font-size: 13px; margin-top: 1rem; }
  `],
})
export class OnboardingComponent {
  form: FormGroup;
  submitting = false;
  error = '';
  success = false;

  constructor(private fb: FormBuilder, private svc: CustomerService, private router: Router) {
    this.form = this.fb.group({
      givenName: ['', Validators.required],
      familyName: ['', Validators.required],
      title: [''],
      gender: [''],
      nationality: [''],
      birthDate: [''],
      taxId: [''],
      email: ['', [Validators.required, Validators.email]],
      phone: [''],
      docType: [''],
      docNumber: [''],
      docCountry: [''],
      docExpiry: [''],
    });
  }

  get f() { return this.form.controls; }

  submit(): void {
    if (this.form.invalid) return;
    this.submitting = true;
    this.error = '';

    const v = this.form.value;
    const contactMedium: ContactMedium[] = [];

    if (v.email) contactMedium.push({
      mediumType: 'email' as const, preferred: true,
      characteristic: { emailAddress: v.email },
    });
    if (v.phone) contactMedium.push({
      mediumType: 'phone' as const, preferred: false,
      characteristic: { phoneNumber: v.phone },
    });

    const identityDocument = v.docType ? [{
      documentType: v.docType as string,
      documentNumber: v.docNumber || 'PENDING',
      issuingCountry: v.docCountry || 'UNKNOWN',
      expiryDate: v.docExpiry || undefined,
    }] : [];

    const payload: IndividualCreate = {
      givenName: v.givenName,
      familyName: v.familyName,
      title: v.title || undefined,
      gender: v.gender || undefined,
      nationality: v.nationality || undefined,
      birthDate: v.birthDate || undefined,
      taxId: v.taxId || undefined,
      contactMedium,
      identityDocument,
    };

    this.svc.createIndividual(payload).subscribe({
      next: (created) => {
        this.success = true;
        this.submitting = false;
        setTimeout(() => this.router.navigate(['/customers', created.id]), 1500);
      },
      error: (err) => {
        this.error = err?.error?.message || 'Failed to create customer. Please try again.';
        this.submitting = false;
      },
    });
  }
}
