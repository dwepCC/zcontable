import client from '../api/client';
import type { TaxSettlement } from '../types/dashboard';
import type { TaxSettlementSectionsPayload } from '../utils/taxSettlementSections';

export type SupervisorTaxSettlementCreateInput = {
  company_id: number;
  issue_date: string;
  liquidation_period: string;
  period_label: string;
  tax_sections?: TaxSettlementSectionsPayload;
};

export type SupervisorTaxSettlementUpdateInput = {
  issue_date: string;
  liquidation_period: string;
  period_label: string;
  tax_sections?: TaxSettlementSectionsPayload;
};

export type SupervisorCompanyLiquidationDraft = {
  settlement_id: number;
  liquidation_period: string;
  period_label: string;
  status: string;
};

export const supervisorTaxSettlementsService = {
  async create(body: SupervisorTaxSettlementCreateInput): Promise<TaxSettlement> {
    const res = await client.post<{ data: TaxSettlement }>('/supervisors/tax-settlements', body);
    return res.data.data;
  },

  async get(id: number): Promise<TaxSettlement> {
    const res = await client.get<{ data: TaxSettlement }>(`/supervisors/tax-settlements/${id}`);
    return res.data.data;
  },

  async update(id: number, body: SupervisorTaxSettlementUpdateInput): Promise<TaxSettlement> {
    const res = await client.put<{ data: TaxSettlement }>(`/supervisors/tax-settlements/${id}`, body);
    return res.data.data;
  },

  async draftsByCompanies(companyIds: number[]): Promise<Record<number, SupervisorCompanyLiquidationDraft>> {
    if (companyIds.length === 0) return {};
    const res = await client.get<{ data: Record<string, SupervisorCompanyLiquidationDraft> }>(
      '/supervisors/tax-settlements/drafts-by-companies',
      { params: { company_ids: companyIds.join(',') } },
    );
    const raw = res.data.data ?? {};
    const out: Record<number, SupervisorCompanyLiquidationDraft> = {};
    for (const [key, value] of Object.entries(raw)) {
      const id = Number(key);
      if (Number.isFinite(id) && id > 0) out[id] = value;
    }
    return out;
  },
};
