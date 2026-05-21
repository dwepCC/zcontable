import { Document, Page, StyleSheet, Text, View, pdf } from '@react-pdf/renderer';
import type { PosSaleDetail } from '../services/posSales';

const money = (v: number) => `S/ ${Number(v ?? 0).toFixed(2)}`;

export const docTypeLabel = (code: string) => {
  const c = (code ?? '').trim();
  if (c === '01') return 'FACTURA';
  if (c === '03') return 'BOLETA';
  if (c === '00' || c === 'NV') return 'NOTA DE VENTA';
  return c || 'COMPROBANTE';
};

export type ReceiptPdfFormat = 'a4' | 'ticket';

type FirmBranding = { name?: string; ruc?: string };

type Props = {
  receipt: PosSaleDetail;
  firmName: string;
  firmRuc: string;
};

function ReceiptLinesTable({
  lines,
  styles,
}: {
  lines: NonNullable<PosSaleDetail['lines']>;
  styles: ReturnType<typeof StyleSheet.create>;
}) {
  return (
    <>
      <View style={styles.tableHead}>
        <Text style={[styles.colDesc, styles.bold]}>Descripción</Text>
        <Text style={[styles.colQty, styles.bold]}>Cant.</Text>
        <Text style={[styles.colPU, styles.bold]}>P. unit.</Text>
        <Text style={[styles.colTot, styles.bold]}>Total</Text>
      </View>
      {lines.map((ln) => (
        <View key={ln.id} style={styles.tableRow}>
          <Text style={styles.colDesc}>{ln.description || ln.product_name}</Text>
          <Text style={styles.colQty}>{Number(ln.quantity).toFixed(2)}</Text>
          <Text style={styles.colPU}>{money(ln.unit_price)}</Text>
          <Text style={styles.colTot}>{money(ln.line_total)}</Text>
        </View>
      ))}
    </>
  );
}

function ReceiptTotals({
  receipt,
  styles,
}: {
  receipt: PosSaleDetail;
  styles: ReturnType<typeof StyleSheet.create>;
}) {
  return (
    <View style={styles.totals}>
      <View style={styles.totalLine}>
        <Text>Subtotal</Text>
        <Text>{money(receipt.subtotal ?? 0)}</Text>
      </View>
      <View style={styles.totalLine}>
        <Text>IGV</Text>
        <Text>{money(receipt.tax_amount ?? 0)}</Text>
      </View>
      <View style={[styles.totalLine, styles.bold]}>
        <Text>TOTAL</Text>
        <Text>{money(receipt.total)}</Text>
      </View>
    </View>
  );
}

function FiscalReceiptPdfDoc({ receipt, firmName, firmRuc }: Props) {
  const styles = StyleSheet.create({
    page: { padding: 32, fontSize: 9, color: '#0f172a' },
    title: { fontSize: 14, fontWeight: 700, marginBottom: 4 },
    meta: { fontSize: 8, color: '#475569', marginBottom: 12 },
    tableHead: { flexDirection: 'row', borderBottomWidth: 1, borderColor: '#cbd5e1', paddingBottom: 4, marginTop: 8 },
    tableRow: { flexDirection: 'row', paddingVertical: 3, borderBottomWidth: 0.5, borderColor: '#e2e8f0' },
    colDesc: { width: '46%' },
    colQty: { width: '10%', textAlign: 'right' },
    colPU: { width: '14%', textAlign: 'right' },
    colTot: { width: '14%', textAlign: 'right' },
    totals: { marginTop: 10, alignItems: 'flex-end' },
    totalLine: { flexDirection: 'row', width: 180, justifyContent: 'space-between', marginTop: 2 },
    bold: { fontWeight: 700 },
  });

  const lines = [...(receipt.lines ?? [])].sort((a, b) => (a.id ?? 0) - (b.id ?? 0));
  const issue = (receipt.issue_date ?? '').slice(0, 10);

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>
          {docTypeLabel(receipt.document_type_id ?? '')} {receipt.number}
        </Text>
        <Text style={styles.meta}>
          {firmName}
          {firmRuc ? ` · RUC ${firmRuc}` : ''} · Fecha {issue}
        </Text>
        <View>
          <Text style={styles.bold}>Cliente</Text>
          <Text>{receipt.customer_name}</Text>
          <Text>RUC/DNI {receipt.customer_number || '—'}</Text>
        </View>
        <ReceiptLinesTable lines={lines} styles={styles} />
        <ReceiptTotals receipt={receipt} styles={styles} />
        {receipt.notes ? (
          <Text style={{ marginTop: 12, fontSize: 8, color: '#64748b' }}>Notas: {receipt.notes}</Text>
        ) : null}
      </Page>
    </Document>
  );
}

/** Ticket térmico ~80 mm de ancho. */
function FiscalReceiptTicketPdfDoc({ receipt, firmName, firmRuc }: Props) {
  const lineCount = receipt.lines?.length ?? 0;
  const pageHeight = Math.min(1200, Math.max(320, 200 + lineCount * 28));

  const styles = StyleSheet.create({
    page: { padding: 10, fontSize: 7, color: '#0f172a', fontFamily: 'Helvetica' },
    center: { textAlign: 'center' },
    title: { fontSize: 9, fontWeight: 700, textAlign: 'center', marginBottom: 2 },
    meta: { fontSize: 6, color: '#475569', textAlign: 'center', marginBottom: 6 },
    divider: { borderBottomWidth: 1, borderColor: '#cbd5e1', marginVertical: 4 },
    lineRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 },
    lineDesc: { width: '58%', fontSize: 6 },
    lineAmt: { width: '40%', textAlign: 'right', fontSize: 6 },
    totalLine: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 },
    bold: { fontWeight: 700 },
  });

  const lines = [...(receipt.lines ?? [])].sort((a, b) => (a.id ?? 0) - (b.id ?? 0));
  const issue = (receipt.issue_date ?? '').slice(0, 10);

  return (
    <Document>
      <Page size={[227, pageHeight]} style={styles.page}>
        <Text style={styles.title}>{firmName}</Text>
        {firmRuc ? <Text style={[styles.meta, styles.center]}>RUC {firmRuc}</Text> : null}
        <Text style={[styles.title, { marginTop: 4 }]}>
          {docTypeLabel(receipt.document_type_id ?? '')}
        </Text>
        <Text style={[styles.meta, styles.center]}>{receipt.number}</Text>
        <Text style={[styles.meta, styles.center]}>Fecha {issue}</Text>
        <View style={styles.divider} />
        <Text style={styles.bold}>Cliente</Text>
        <Text>{receipt.customer_name}</Text>
        <Text style={{ fontSize: 6, marginBottom: 4 }}>RUC/DNI {receipt.customer_number || '—'}</Text>
        <View style={styles.divider} />
        {lines.map((ln) => (
          <View key={ln.id} style={{ marginBottom: 3 }}>
            <Text style={styles.lineDesc}>{ln.description || ln.product_name}</Text>
            <View style={styles.lineRow}>
              <Text style={{ fontSize: 6 }}>
                {Number(ln.quantity).toFixed(2)} × {money(ln.unit_price)}
              </Text>
              <Text style={styles.lineAmt}>{money(ln.line_total)}</Text>
            </View>
          </View>
        ))}
        <View style={styles.divider} />
        <View style={styles.totalLine}>
          <Text>Subtotal</Text>
          <Text>{money(receipt.subtotal ?? 0)}</Text>
        </View>
        <View style={styles.totalLine}>
          <Text>IGV</Text>
          <Text>{money(receipt.tax_amount ?? 0)}</Text>
        </View>
        <View style={[styles.totalLine, styles.bold, { marginTop: 4 }]}>
          <Text>TOTAL</Text>
          <Text>{money(receipt.total)}</Text>
        </View>
        {receipt.notes ? (
          <Text style={{ marginTop: 8, fontSize: 6, color: '#64748b' }}>{receipt.notes}</Text>
        ) : null}
      </Page>
    </Document>
  );
}

function firmDisplay(firm: FirmBranding) {
  return {
    name: firm.name?.trim() || 'Estudio contable',
    ruc: firm.ruc?.trim() || '',
  };
}

export async function buildFiscalReceiptPdfBlob(
  receipt: PosSaleDetail,
  firm: FirmBranding,
  format: ReceiptPdfFormat = 'a4',
): Promise<Blob> {
  const { name, ruc } = firmDisplay(firm);
  const doc =
    format === 'ticket' ? (
      <FiscalReceiptTicketPdfDoc receipt={receipt} firmName={name} firmRuc={ruc} />
    ) : (
      <FiscalReceiptPdfDoc receipt={receipt} firmName={name} firmRuc={ruc} />
    );
  return pdf(doc).toBlob();
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
