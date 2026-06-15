import client from '../api/client';
import type { SupervisorDeclaration } from './supervisors';

export interface DetraccionesListRow {
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

export interface DetraccionesDetail {
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

export interface DetraccionesListResponse {
  data: DetraccionesListRow[];
  pagination: {
    page: number;
    per_page: number;
    total: number;
    total_pages: number;
  };
}

export const detraccionesService = {
  async list(params: {
    period_ym: string;
    q?: string;
    status?: string;
    page?: number;
    per_page?: number;
  }): Promise<DetraccionesListResponse> {
    const res = await client.get<DetraccionesListResponse>('/supervisors/activity-modules/detracciones', { params });
    return res.data;
  },

  async getDetail(companyId: number, periodYm: string): Promise<DetraccionesDetail> {
    const res = await client.get<{ data: DetraccionesDetail }>(
      `/supervisors/activity-modules/detracciones/companies/${companyId}`,
      { params: { period_ym: periodYm } },
    );
    return res.data.data;
  },

  async validate(declarationId: number): Promise<SupervisorDeclaration> {
    const res = await client.post<{ data: SupervisorDeclaration }>(
      `/supervisors/activity-modules/detracciones/declarations/${declarationId}/validate`,
    );
    return res.data.data;
  },
};
