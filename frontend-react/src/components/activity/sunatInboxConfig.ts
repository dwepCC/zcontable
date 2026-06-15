import {
  activityStatusBadgeClass,
  activityStatusLabel,
  buildStatusFilter,
  formatStoredAt,
} from './activityModuleShared';

export const SUNAT_INBOX_STATUSES = [
  { value: 'pendiente', label: 'Pendiente' },
  { value: 'comunicado', label: 'Comunicado' },
  { value: 'sin_culpa', label: 'Sin culpa' },
  { value: 'no_visualizado', label: 'No visualizado' },
  { value: 'observado', label: 'Observado' },
  { value: 'validado', label: 'Validado' },
] as const;

export const SUNAT_INBOX_STATUS_FILTER = buildStatusFilter(SUNAT_INBOX_STATUSES);

const SUNAT_BADGE: Record<string, string> = {
  validado: 'bg-emerald-100 text-emerald-800',
  observado: 'bg-amber-100 text-amber-900',
  comunicado: 'bg-blue-100 text-blue-800',
  sin_culpa: 'bg-slate-100 text-slate-700',
  no_visualizado: 'bg-orange-100 text-orange-900',
  sin_registro: 'bg-slate-100 text-slate-500',
};

export function sunatInboxStatusLabel(status: string): string {
  return activityStatusLabel(status, SUNAT_INBOX_STATUSES);
}

export function sunatInboxStatusBadgeClass(status: string): string {
  return activityStatusBadgeClass(status, SUNAT_BADGE);
}

export { formatStoredAt };
