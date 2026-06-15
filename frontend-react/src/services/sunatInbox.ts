import client from '../api/client';
import type { SupervisorDeclaration } from './supervisors';

export interface SunatInboxListRow {
  company_id: number;
  code: string;
  dig: string;
  business_name: string;
  ruc: string;
  assistant_username: string;
  control_id?: number;
  declaration_id?: number;
  status: string;
  attachment_count: number;
  last_stored_at?: string;
}

export interface SunatInboxDetail {
  period_ym: string;
  company_id: number;
  code: string;
  dig: string;
  business_name: string;
  ruc: string;
  assistant_username: string;
  control_id: number;
  declaration: SupervisorDeclaration;
}

export interface SunatInboxListResponse {
  data: SunatInboxListRow[];
  pagination: {
    page: number;
    per_page: number;
    total: number;
    total_pages: number;
  };
}

export const sunatInboxService = {
  async list(params: {
    period_ym: string;
    q?: string;
    status?: string;
    page?: number;
    per_page?: number;
  }): Promise<SunatInboxListResponse> {
    const res = await client.get<SunatInboxListResponse>('/supervisors/activity-modules/sunat-inbox', { params });
    return res.data;
  },

  async getDetail(companyId: number, periodYm: string): Promise<SunatInboxDetail> {
    const res = await client.get<{ data: SunatInboxDetail }>(
      `/supervisors/activity-modules/sunat-inbox/companies/${companyId}`,
      { params: { period_ym: periodYm } },
    );
    return res.data.data;
  },

  async validate(declarationId: number): Promise<SupervisorDeclaration> {
    const res = await client.post<{ data: SupervisorDeclaration }>(
      `/supervisors/activity-modules/sunat-inbox/declarations/${declarationId}/validate`,
    );
    return res.data.data;
  },
};
