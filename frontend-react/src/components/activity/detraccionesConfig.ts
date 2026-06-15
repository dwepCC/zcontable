import {
  activityStatusBadgeClass,
  activityStatusLabel,
  buildStatusFilter,
  formatStoredAt,
} from './activityModuleShared';

/** Estados operativos F4.1a (sin sin_registro: solo listado). */
export const DETRACCIONES_STATUSES = [
  { value: 'pendiente', label: 'Pendiente' },
  { value: 'en_elaboracion', label: 'En elaboración' },
  { value: 'deposito_pendiente', label: 'Depósito pendiente' },
  { value: 'deposito_registrado', label: 'Depósito registrado' },
  { value: 'sin_operaciones', label: 'Sin operaciones sujetas' },
  { value: 'en_revision', label: 'En revisión' },
  { value: 'observado', label: 'Observado' },
  { value: 'validado', label: 'Validado' },
] as const;

/** Whitelist de transiciones (alineada a backend F4.1a). */
export const DETRACCIONES_TRANSITIONS: Record<string, string[]> = {
  pendiente: ['en_elaboracion', 'sin_operaciones'],
  en_elaboracion: ['deposito_pendiente', 'sin_operaciones', 'en_revision'],
  deposito_pendiente: ['deposito_registrado', 'en_elaboracion'],
  deposito_registrado: ['en_revision', 'en_elaboracion'],
  sin_operaciones: ['en_revision'],
  observado: ['en_elaboracion'],
  // Legacy display-only hasta migración completa en BD
  abierto: ['en_elaboracion', 'sin_operaciones'],
  en_proceso: ['deposito_pendiente', 'sin_operaciones', 'en_revision'],
  resuelto: ['en_revision', 'en_elaboracion'],
  escalado: ['en_elaboracion'],
};

export const DETRACCIONES_STATUS_FILTER = buildStatusFilter(DETRACCIONES_STATUSES);

const DETRACCIONES_BADGE: Record<string, string> = {
  validado: 'bg-emerald-100 text-emerald-800',
  observado: 'bg-amber-100 text-amber-900',
  pendiente: 'bg-slate-100 text-slate-700',
  en_elaboracion: 'bg-blue-100 text-blue-800',
  deposito_pendiente: 'bg-indigo-100 text-indigo-800',
  deposito_registrado: 'bg-violet-100 text-violet-800',
  sin_operaciones: 'bg-cyan-100 text-cyan-900',
  en_revision: 'bg-purple-100 text-purple-800',
  sin_registro: 'bg-slate-100 text-slate-500',
  abierto: 'bg-blue-100 text-blue-800',
  en_proceso: 'bg-indigo-100 text-indigo-800',
  resuelto: 'bg-teal-100 text-teal-800',
  escalado: 'bg-orange-100 text-orange-900',
};

export function detraccionesStatusLabel(status: string): string {
  return activityStatusLabel(status, DETRACCIONES_STATUSES);
}

export function detraccionesStatusBadgeClass(status: string): string {
  return activityStatusBadgeClass(status, DETRACCIONES_BADGE);
}

/** Estados seleccionables en detalle: actual + transiciones permitidas. */
export function detraccionesSelectableStatuses(current: string): { value: string; label: string }[] {
  const seen = new Set<string>();
  const out: { value: string; label: string }[] = [];
  const add = (value: string) => {
    if (seen.has(value) || value === 'validado' || value === 'observado') return;
    seen.add(value);
    out.push({ value, label: detraccionesStatusLabel(value) });
  };
  add(current);
  for (const next of DETRACCIONES_TRANSITIONS[current] ?? []) {
    add(next);
  }
  return out;
}

export { formatStoredAt };
