import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

// ── TMF632 types ─────────────────────────────────────────────

export interface ContactMedium {
  mediumType: 'email' | 'phone' | 'postalAddress';
  preferred?: boolean;
  characteristic: {
    emailAddress?: string;
    phoneNumber?: string;
    city?: string;
    country?: string;
    street1?: string;
    postCode?: string;
  };
}

export interface IdentityDocument {
  documentType: string;
  documentNumber: string;
  issuingCountry: string;
  expiryDate?: string;
  verified?: boolean;
}

export interface Individual {
  id: string;
  href: string;
  '@type': string;
  '@baseType': string;
  lastUpdate: string;
  givenName: string;
  familyName: string;
  fullName?: string;
  title?: string;
  gender?: string;
  nationality?: string;
  birthDate?: string;
  status: string;
  contactMedium: ContactMedium[];
  identityDocument: IdentityDocument[];
  // Banking extensions
  kycStatus: 'pending' | 'document_submitted' | 'in_review' | 'approved' | 'rejected' | 'expired';
  riskRating?: 'low' | 'medium' | 'high' | 'very_high';
  riskScore?: number;
  riskSummary?: string;
  kycFlags?: string[];
  kycRecommendedAction?: string;
  amlCleared: boolean;
  pepStatus: boolean;
}

export interface IndividualCreate {
  givenName: string;
  familyName: string;
  fullName?: string;
  title?: string;
  gender?: string;
  nationality?: string;
  birthDate?: string;
  taxId?: string;
  contactMedium?: ContactMedium[];
  identityDocument?: IdentityDocument[];
}

export interface IndividualPatch {
  givenName?: string;
  familyName?: string;
  nationality?: string;
  status?: string;
  kycStatus?: string;
  contactMedium?: ContactMedium[];
  identityDocument?: IdentityDocument[];
}

export interface ListParams {
  offset?: number;
  limit?: number;
  givenName?: string;
  familyName?: string;
  kycStatus?: string;
  riskRating?: string;
}

export interface RiskResult {
  customerId: string;
  riskScore: number;
  riskRating: string;
  summary: string;
  flags: string[];
  recommendedAction: string;
  kycStatus: string;
  amlCleared: boolean;
  confidence: number;
}

@Injectable({ providedIn: 'root' })
export class CustomerService {
  private base = environment.gatewayUrl;

  constructor(private http: HttpClient) {}

  // GET /tmApi/partyManagement/v4/individual
  listIndividuals(params: ListParams = {}): Observable<Individual[]> {
    let httpParams = new HttpParams();
    if (params.offset !== undefined) httpParams = httpParams.set('offset', params.offset);
    if (params.limit !== undefined) httpParams = httpParams.set('limit', params.limit);
    if (params.givenName) httpParams = httpParams.set('givenName', params.givenName);
    if (params.familyName) httpParams = httpParams.set('familyName', params.familyName);
    if (params.kycStatus) httpParams = httpParams.set('kycStatus', params.kycStatus);
    if (params.riskRating) httpParams = httpParams.set('riskRating', params.riskRating);

    return this.http.get<Individual[]>(
      `${this.base}/tmApi/partyManagement/v4/individual`,
      { params: httpParams }
    );
  }

  // GET /tmApi/partyManagement/v4/individual/{id}
  getIndividual(id: string): Observable<Individual> {
    return this.http.get<Individual>(`${this.base}/tmApi/partyManagement/v4/individual/${id}`);
  }

  // POST /tmApi/partyManagement/v4/individual → 201
  createIndividual(data: IndividualCreate): Observable<Individual> {
    return this.http.post<Individual>(
      `${this.base}/tmApi/partyManagement/v4/individual`,
      data
    );
  }

  // PATCH /tmApi/partyManagement/v4/individual/{id}
  patchIndividual(id: string, data: IndividualPatch): Observable<Individual> {
    return this.http.patch<Individual>(
      `${this.base}/tmApi/partyManagement/v4/individual/${id}`,
      data
    );
  }

  // DELETE /tmApi/partyManagement/v4/individual/{id} → 204
  deleteIndividual(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/tmApi/partyManagement/v4/individual/${id}`);
  }

  // POST /api/ai/risk/{id} — trigger AI assessment
  triggerRiskAssessment(id: string): Observable<{ status: string; message: string }> {
    return this.http.post<{ status: string; message: string }>(
      `${this.base}/api/ai/risk/${id}`,
      {}
    );
  }

  // GET /api/ai/risk/{id}/result
  getRiskResult(id: string): Observable<RiskResult> {
    return this.http.get<RiskResult>(`${this.base}/api/ai/risk/${id}/result`);
  }
}
