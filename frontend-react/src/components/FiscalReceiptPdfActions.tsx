import { useState } from 'react';
import { configService } from '../services/config';
import { fiscalReceiptsService } from '../services/fiscalReceipts';
import { downloadFiscalReceiptPdf, openFiscalReceiptPdf } from '../pdf/fiscalReceiptPdf';
type Props = {
  receiptId: number;
  receiptNumber?: string;
  compact?: boolean;
};

const FiscalReceiptPdfActions = ({ receiptId, receiptNumber, compact }: Props) => {
  const [busy, setBusy] = useState<'a4' | 'ticket' | null>(null);

  const run = async (format: 'a4' | 'ticket') => {
    try {
      setBusy(format);
      const [receipt, firm] = await Promise.all([
        fiscalReceiptsService.getDetail(receiptId),
        configService.getFirmBranding(),
      ]);
      await openFiscalReceiptPdf(receipt, firm, format);
    } catch (e) {
      console.error(e);
      window.dispatchEvent(
        new CustomEvent('miweb:toast', {
          detail: { type: 'error', message: 'No se pudo generar el PDF del comprobante' },
        }),
      );
    } finally {
      setBusy(null);
    }
  };

  const runDownload = async (format: 'a4' | 'ticket') => {
    try {
      setBusy(format);
      const [receipt, firm] = await Promise.all([
        fiscalReceiptsService.getDetail(receiptId),
        configService.getFirmBranding(),
      ]);
      const suffix = format === 'ticket' ? '-ticket' : '';
      await downloadFiscalReceiptPdf(
        receipt,
        firm,
        `comprobante-${receiptNumber ?? receipt.number ?? receiptId}${suffix}.pdf`,
        format,
      );
    } catch (e) {
      console.error(e);
      window.dispatchEvent(
        new CustomEvent('miweb:toast', {
          detail: { type: 'error', message: 'No se pudo descargar el PDF' },
        }),
      );
    } finally {
      setBusy(null);
    }
  };

  const btnClass = compact
    ? 'inline-flex items-center gap-1 px-2 py-1 rounded-md border border-slate-200 bg-white text-xs font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50'
    : 'inline-flex items-center gap-1.5 rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50';

  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${compact ? '' : 'gap-2'}`}>
      <button
        type="button"
        disabled={busy !== null}
        onClick={() => void run('ticket')}
        className={btnClass}
        title="Abrir ticket 80mm"
      >
        <i className="fas fa-receipt text-[10px]" />
        {busy === 'ticket' ? '…' : 'Ticket'}
      </button>
      <button
        type="button"
        disabled={busy !== null}
        onClick={() => void run('a4')}
        className={btnClass}
        title="Abrir PDF A4"
      >
        <i className="fas fa-file-pdf text-[10px] text-red-600" />
        {busy === 'a4' ? '…' : 'A4'}
      </button>
      <button
        type="button"
        disabled={busy !== null}
        onClick={() => void runDownload('ticket')}
        className={btnClass}
        title="Descargar ticket 80mm"
      >
        <i className="fas fa-download text-[10px]" />
        {compact ? '' : 'Desc. ticket'}
      </button>
      <button
        type="button"
        disabled={busy !== null}
        onClick={() => void runDownload('a4')}
        className={btnClass}
        title="Descargar PDF A4"
      >
        <i className="fas fa-file-download text-[10px] text-red-600" />
        {compact ? '' : 'Desc. A4'}
      </button>
    </div>
  );
};

export default FiscalReceiptPdfActions;
