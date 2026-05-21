import type { FirmConfig } from '../types/dashboard';
import type { PosSaleDetail } from '../services/posSales';
import { buildFiscalReceiptA4Pdf, buildFiscalReceiptTicketPdf, docTypeLabel } from './fiscalReceiptPdfBuild';

export { docTypeLabel };

export type ReceiptPdfFormat = 'a4' | 'ticket';

export type FirmBranding = Partial<
  Pick<FirmConfig, 'name' | 'ruc' | 'address' | 'phone' | 'email' | 'logo_url' | 'statement_bank_info'>
>;

function firmFromBranding(firm: FirmBranding): FirmConfig {
  return {
    id: 0,
    name: firm.name?.trim() || 'Estudio contable',
    ruc: firm.ruc?.trim() || '',
    address: firm.address?.trim() || '',
    phone: firm.phone,
    email: firm.email,
    logo_url: firm.logo_url,
    statement_bank_info: firm.statement_bank_info,
  };
}

export async function buildFiscalReceiptPdfBlob(
  receipt: PosSaleDetail,
  firm: FirmBranding,
  format: ReceiptPdfFormat = 'a4',
): Promise<Blob> {
  const cfg = firmFromBranding(firm);
  const bytes =
    format === 'ticket'
      ? await buildFiscalReceiptTicketPdf(receipt, cfg)
      : await buildFiscalReceiptA4Pdf(receipt, cfg);
  return new Blob([Uint8Array.from(bytes)], { type: 'application/pdf' });
}

export function openPdfBlobInNewTab(blob: Blob): boolean {
  const url = URL.createObjectURL(blob);
  const w = window.open(url, '_blank', 'noopener,noreferrer');
  if (!w) {
    URL.revokeObjectURL(url);
    return false;
  }
  setTimeout(() => URL.revokeObjectURL(url), 120_000);
  return true;
}

export async function openFiscalReceiptPdf(
  receipt: PosSaleDetail,
  firm: FirmBranding,
  format: ReceiptPdfFormat = 'a4',
): Promise<boolean> {
  const blob = await buildFiscalReceiptPdfBlob(receipt, firm, format);
  return openPdfBlobInNewTab(blob);
}

export async function downloadFiscalReceiptPdf(
  receipt: PosSaleDetail,
  firm: FirmBranding,
  filename?: string,
  format: ReceiptPdfFormat = 'a4',
) {
  const blob = await buildFiscalReceiptPdfBlob(receipt, firm, format);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const suffix = format === 'ticket' ? '-ticket' : '';
  a.download = filename ?? `comprobante-${receipt.number ?? receipt.id}${suffix}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}
