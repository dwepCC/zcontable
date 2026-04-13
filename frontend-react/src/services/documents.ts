import client from '../api/client';
import type { Document } from '../types/dashboard';

export interface DocumentsListParams {
  company_id?: string;
  status?: string;
  overdue?: string;
  date_from?: string;
  date_to?: string;
}

export interface PaginationMeta {
  page: number;
  per_page: number;
  total: number;
  total_pages: number;
}

export interface DocumentItemInput {
  product_id?: number;
  description: string;
  quantity: number;
  unit_price: number;
  amount: number;
  sort_order: number;
}

export interface DocumentUpsertInput {
  company_id: number;
  external_id?: string;
  type: string;
  /** Si se omite al crear, el backend genera un número interno (DEU-…). */
  number?: string;
  issue_date?: string;
  due_date?: string;
  total_amount: number;
  status: string;
  source?: string;
  description?: string;
  service_month?: string;
  /** Si se envía, el backend recalcula total_amount como la suma de los ítems. */
  items?: DocumentItemInput[];
}

export interface SyncTukifacResponse {
  message: string;
  documents_processed: number;
  receipts_processed?: number;
  companies_created?: number;
}

export interface TukifacDocumentsListResponse<T> {
  data: T[];
}

export interface TukifacDocumentsListParams {
  start_date?: string;
  end_date?: string;
}

export const documentsService = {
  async list(params: DocumentsListParams = {}): Promise<Document[]> {
    const res = await client.get<{ data: Document[] }>('/documents', { params });
    return res.data?.data ?? [];
  },

  async listPaged(params: DocumentsListParams & { page: number; per_page: number }): Promise<{
    items: Document[];
    pagination: PaginationMeta;
  }> {
    const res = await client.get<{ data: Document[]; pagination: PaginationMeta }>('/documents', { params });
    return {
      items: res.data?.data ?? [],
      pagination: res.data?.pagination ?? { page: params.page, per_page: params.per_page, total: 0, total_pages: 0 },
    };
  },

  async get(id: number): Promise<Document> {
    const res = await client.get<Document>(`/documents/${id}`);
    return res.data;
  },

  async create(input: DocumentUpsertInput): Promise<Document> {
    const res = await client.post<Document>('/documents', input);
    return res.data;
  },

  async update(id: number, input: DocumentUpsertInput): Promise<Document> {
    const res = await client.put<Document>(`/documents/${id}`, input);
    return res.data;
  },

  async delete(id: number): Promise<void> {
    await client.delete(`/documents/${id}`);
  },

  async syncTukifac(params: TukifacDocumentsListParams = {}): Promise<SyncTukifacResponse> {
    const res = await client.post<SyncTukifacResponse>('/documents/sync-tukifac', undefined, { params });
    return res.data;
  },

  async listTukifacDocuments<T = unknown>(params: TukifacDocumentsListParams = {}): Promise<T[]> {
    const res = await client.get<TukifacDocumentsListResponse<T>>('/tukifac/documents/lists', { params });
    return res.data?.data ?? [];
  },

  /** Listado remoto de notas de venta (API Tukifac sale-note/lists). */
  async listTukifacSaleNotes<T = unknown>(params: TukifacDocumentsListParams = {}): Promise<T[]> {
    const res = await client.get<TukifacDocumentsListResponse<T>>('/tukifac/sale-note/lists', { params });
    return res.data?.data ?? [];
  },

  /** Importa notas de venta a la bandeja de conciliación (mismo flujo que facturas/boletas). */
  async syncTukifacSaleNotes(params: TukifacDocumentsListParams = {}): Promise<SyncTukifacResponse> {
    const res = await client.post<SyncTukifacResponse>('/tukifac/sale-note/sync', undefined, { params });
    return res.data;
  },
};
