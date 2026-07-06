/** Tasas IGV vigentes en Perú (alineado a companies.igv_rate). */
export type CompanyIgvRate = 18 | 10.5;

export function parseCompanyIgvRate(raw?: string | null): CompanyIgvRate | null {
  const s = (raw ?? '').trim().replace('%', '').replace(',', '.');
  if (s === '18' || s === '18.0' || s === '18.00') return 18;
  if (s === '10.5' || s === '10.50' || s === '10.500') return 10.5;
  return null;
}

export function formatCompanyIgvRateLabel(rate: CompanyIgvRate): string {
  return rate === 10.5 ? '10.5 %' : '18 %';
}

export function computeIgvFromBase(base: number, rate: CompanyIgvRate): number {
  const b = Number(base);
  if (!Number.isFinite(b) || b <= 0) return 0;
  return Math.round(b * rate) / 100;
}
