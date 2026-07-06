import { Document, Image, Page, StyleSheet, Text, View, pdf } from '@react-pdf/renderer';
import type { FirmConfig, TaxSettlement, TaxSettlementLine } from '../types/dashboard';
import { loadLogoPngBlobForPdf } from '../utils/pdfLogo';
import { formatTaxMoney, parseTaxSectionsJson, type TaxSettlementSectionsPayload, formatImpuestoPeriodo } from '../utils/taxSettlementSections';

export function lineTypeLabelForPdf(t: string): string {
  if (t === 'document_ref') return 'Deuda';
  if (t === 'tax_manual' || t === 'adjustment') return 'Concepto';
  return t;
}

function sumLines(lines: TaxSettlementLine[] | undefined) {
  let honorarios = 0;
  let impuestos = 0;
  for (const ln of lines ?? []) {
    if (ln.line_type === 'tax_manual') impuestos += Number(ln.amount) || 0;
    else honorarios += Number(ln.amount) || 0;
  }
  return { honorarios, impuestos, total: honorarios + impuestos };
}

export function settlementTotalsForPdf(row: TaxSettlement) {
  const emitted = row.status === 'emitida' || row.status === 'cerrada';
  if (emitted) {
    return {
      honorarios: Number(row.total_honorarios) || 0,
      impuestos: Number(row.total_impuestos) || 0,
      total: Number(row.total_general) || 0,
      emitted: true,
    };
  }
  const s = sumLines(row.lines);
  const sections = parseTaxSectionsJson(row.pdt621_json);
  const sectionTax = sections?.grand_total_impuesto_a_pagar ?? 0;
  const impuestos = s.impuestos > 0 ? s.impuestos : sectionTax > 0 ? sectionTax : Number(row.total_impuestos) || 0;
  const total = s.honorarios + impuestos;
  return { honorarios: s.honorarios, impuestos, total, emitted: false };
}

export async function getLogoPngBlobForPdf(logoUrl: string): Promise<Blob | null> {
  return loadLogoPngBlobForPdf(logoUrl);
}

const formatMoney = (value: number) => `S/ ${Number(value ?? 0).toFixed(2)}`;

type TaxSettlementPdfDocumentProps = {
  settlement: TaxSettlement;
  firm: FirmConfig | null;
  logoPng: Blob | null;
};

export function TaxSettlementPdfDocument({ settlement, firm, logoPng }: TaxSettlementPdfDocumentProps) {
  const firmName = firm?.name?.trim() || 'Estudio contable';
  const firmRuc = firm?.ruc?.trim() || '';
  const firmAddr = firm?.address?.trim() || '';
  const totals = settlementTotalsForPdf(settlement);
  const client = settlement.company;
  const docTitle = `Liquidación ${settlement.number?.trim() || `#${settlement.id}`}`;
  const issueStr = (settlement.issue_date ?? '').slice(0, 10) || '—';
  const sortedLines = [...(settlement.lines ?? [])].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || (a.id ?? 0) - (b.id ?? 0));

  const styles = StyleSheet.create({
    page: { paddingTop: 28, paddingBottom: 36, paddingHorizontal: 28, fontSize: 9, color: '#0f172a' },
    header: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 },
    headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, maxWidth: '70%' },
    logo: { width: 44, height: 44, objectFit: 'contain' },
    firmName: { fontSize: 12, fontWeight: 700 },
    firmMeta: { fontSize: 8, color: '#475569', marginTop: 2 },
    docTitle: { fontSize: 14, fontWeight: 700, marginBottom: 4 },
    docMeta: { fontSize: 9, color: '#475569', marginBottom: 12 },
    draftBanner: {
      backgroundColor: '#fff7ed',
      borderWidth: 1,
      borderColor: '#fed7aa',
      borderRadius: 6,
      padding: 8,
      marginBottom: 12,
    },
    draftBannerText: { fontSize: 8, color: '#9a3412', fontWeight: 700 },
    block: { marginBottom: 12 },
    blockTitle: { fontSize: 9, fontWeight: 700, color: '#334155', marginBottom: 4 },
    clientLine: { fontSize: 9, color: '#0f172a', marginBottom: 2 },
    table: { borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8, overflow: 'hidden' },
    rowHead: { flexDirection: 'row', backgroundColor: '#f8fafc', borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
    row: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
    cell: { paddingVertical: 7, paddingHorizontal: 8 },
    colTipo: { width: '14%' },
    colPeriodo: { width: '14%' },
    colConcepto: { width: '42%' },
    colMonto: { width: '30%', textAlign: 'right' },
    headText: { fontSize: 8, fontWeight: 700, color: '#475569' },
    rowText: { fontSize: 8, color: '#0f172a' },
    totalsBox: { marginTop: 12, alignSelf: 'flex-end', width: '48%', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8, padding: 10 },
    totalRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
    totalLabel: { fontSize: 8, color: '#64748b' },
    totalValue: { fontSize: 9, fontWeight: 700 },
    totalGrand: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6, paddingTop: 6, borderTopWidth: 1, borderTopColor: '#e2e8f0' },
    notes: { marginTop: 10, padding: 8, backgroundColor: '#f8fafc', borderRadius: 6 },
    notesText: { fontSize: 8, color: '#334155' },
    pdtBlock: { marginTop: 10 },
    pdtText: { fontSize: 7, color: '#475569' },
    footer: { position: 'absolute', bottom: 14, left: 28, right: 28, fontSize: 8, color: '#94a3b8' },
  });

  const pdtSnippet = (settlement.pdt621_json ?? '').trim();
  const taxSections = parseTaxSectionsJson(settlement.pdt621_json);

  const renderTaxSections = (sections: TaxSettlementSectionsPayload) => (
    <View style={styles.pdtBlock}>
      <Text style={styles.blockTitle}>Detalle fiscal</Text>
      {sections.pdt621?.enabled ? (
        <View style={{ marginBottom: 8 }}>
          <Text style={{ fontSize: 8, fontWeight: 700, marginBottom: 4 }}>PDT 621 — IGV y Renta</Text>
          {(
            [
              ['Ventas netas', sections.pdt621.ventas_netas],
              ['Notas de crédito', sections.pdt621.notas_credito],
              ['Compras 10.5 %', sections.pdt621.compras_105],
              ['Compras 18 %', sections.pdt621.compras_18],
            ] as const
          ).map(([label, r]) => (
            <Text key={label} style={styles.pdtText}>
              {label}: base {formatTaxMoney(r.base)} · imp. {formatTaxMoney(r.impuesto)} · total {formatTaxMoney(r.total)}
            </Text>
          ))}
          <Text style={styles.pdtText}>Impuesto del periodo: {formatImpuestoPeriodo(sections.pdt621.impuesto_periodo)}</Text>
          <Text style={styles.pdtText}>Saldo a favor (final): {formatTaxMoney(sections.pdt621.saldo_favor_final)}</Text>
          <Text style={styles.pdtText}>Renta — impuesto a pagar: {formatTaxMoney(sections.pdt621.renta_impuesto_a_pagar)}</Text>
          <Text style={styles.pdtText}>Subtotal PDT 621: {formatTaxMoney(sections.pdt621.impuesto_a_pagar)}</Text>
        </View>
      ) : null}
      {sections.pdt601?.enabled ? (
        <View style={{ marginBottom: 8 }}>
          <Text style={{ fontSize: 8, fontWeight: 700, marginBottom: 4 }}>PDT 601 — Planilla electrónica</Text>
          <Text style={styles.pdtText}>
            ESSALUD {formatTaxMoney(sections.pdt601.essalud)} · ONP {formatTaxMoney(sections.pdt601.onp)} · AFP{' '}
            {formatTaxMoney(sections.pdt601.afp)}
          </Text>
          <Text style={styles.pdtText}>
            Rta 4ta {formatTaxMoney(sections.pdt601.rta_4ta)} · Rta 5ta {formatTaxMoney(sections.pdt601.rta_5ta)}
          </Text>
          <Text style={styles.pdtText}>Subtotal PDT 601: {formatTaxMoney(sections.pdt601.impuesto_a_pagar)}</Text>
        </View>
      ) : null}
      {sections.itan?.enabled ? (
        <View style={{ marginBottom: 8 }}>
          <Text style={{ fontSize: 8, fontWeight: 700, marginBottom: 4 }}>
            ITAN {sections.itan.year} — Cuota {sections.itan.cuota_nro}
          </Text>
          <Text style={styles.pdtText}>Impuesto a pagar: {formatTaxMoney(sections.itan.impuesto_a_pagar)}</Text>
        </View>
      ) : null}
      <Text style={{ fontSize: 9, fontWeight: 700, marginTop: 4 }}>
        Total impuestos a pagar: {formatTaxMoney(sections.grand_total_impuesto_a_pagar)}
      </Text>
    </View>
  );

  return (
    <Document title={docTitle}>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            {logoPng ? <Image style={styles.logo} src={logoPng} /> : null}
            <View>
              <Text style={styles.firmName}>{firmName}</Text>
              {firmRuc ? <Text style={styles.firmMeta}>RUC {firmRuc}</Text> : null}
              {firmAddr ? <Text style={styles.firmMeta}>{firmAddr}</Text> : null}
            </View>
          </View>
        </View>

        <Text style={styles.docTitle}>Liquidación de impuestos y honorarios</Text>
        <Text style={styles.docMeta}>
          {docTitle} · Emisión {issueStr}
          {settlement.period_label ? ` · Periodo ${settlement.period_label}` : ''}
        </Text>

        {!totals.emitted ? (
          <View style={styles.draftBanner}>
            <Text style={styles.draftBannerText}>BORRADOR — Los totales se calculan desde las líneas; emita la liquidación para fijar el documento final.</Text>
          </View>
        ) : null}

        <View style={styles.block}>
          <Text style={styles.blockTitle}>Cliente</Text>
          <Text style={styles.clientLine}>{client?.business_name ?? '—'}</Text>
          {client?.ruc ? <Text style={styles.clientLine}>RUC {client.ruc}</Text> : null}
          {client?.address ? <Text style={styles.clientLine}>{client.address}</Text> : null}
        </View>

        <View style={styles.table}>
          <View style={styles.rowHead}>
            <View style={[styles.cell, styles.colTipo]}>
              <Text style={styles.headText}>Tipo</Text>
            </View>
            <View style={[styles.cell, styles.colPeriodo]}>
              <Text style={styles.headText}>Periodo</Text>
            </View>
            <View style={[styles.cell, styles.colConcepto]}>
              <Text style={styles.headText}>Concepto</Text>
            </View>
            <View style={[styles.cell, styles.colMonto]}>
              <Text style={styles.headText}>Monto</Text>
            </View>
          </View>
          {sortedLines.length > 0 ? (
            sortedLines.map((ln, idx) => (
              <View key={ln.id ?? idx} style={styles.row} wrap={false}>
                <View style={[styles.cell, styles.colTipo]}>
                  <Text style={styles.rowText}>{lineTypeLabelForPdf(ln.line_type)}</Text>
                </View>
                <View style={[styles.cell, styles.colPeriodo]}>
                  <Text style={styles.rowText}>
                    {(() => {
                      const p = (ln.period_ym ?? '').trim();
                      if (p) return p;
                      if (ln.period_date && ln.period_date.length >= 10) return ln.period_date.slice(0, 10);
                      return settlement.liquidation_period || '—';
                    })()}
                  </Text>
                </View>
                <View style={[styles.cell, styles.colConcepto]}>
                  <Text style={styles.rowText}>{ln.concept}</Text>
                </View>
                <View style={[styles.cell, styles.colMonto]}>
                  <Text style={styles.rowText}>{formatMoney(ln.amount)}</Text>
                </View>
              </View>
            ))
          ) : (
            <View style={styles.row}>
              <View style={[styles.cell, { width: '100%' }]}>
                <Text style={styles.rowText}>Sin líneas.</Text>
              </View>
            </View>
          )}
        </View>

        <View style={styles.totalsBox}>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Honorarios y cargos</Text>
            <Text style={styles.totalValue}>{formatMoney(totals.honorarios)}</Text>
          </View>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Fiscal / PDT</Text>
            <Text style={styles.totalValue}>{formatMoney(totals.impuestos)}</Text>
          </View>
          <View style={styles.totalGrand}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={styles.totalValue}>{formatMoney(totals.total)}</Text>
          </View>
        </View>

        {settlement.notes?.trim() ? (
          <View style={styles.notes}>
            <Text style={styles.blockTitle}>Notas</Text>
            <Text style={styles.notesText}>{settlement.notes.trim()}</Text>
          </View>
        ) : null}

        {taxSections ? renderTaxSections(taxSections) : pdtSnippet ? (
          <View style={styles.pdtBlock}>
            <Text style={styles.blockTitle}>Referencia fiscal (JSON)</Text>
            <Text style={styles.pdtText}>{pdtSnippet.length > 1200 ? `${pdtSnippet.slice(0, 1200)}…` : pdtSnippet}</Text>
          </View>
        ) : null}

        <Text
          style={styles.footer}
          render={({ pageNumber, totalPages }) => `${firmName} · ${docTitle} · Página ${pageNumber} de ${totalPages}`}
          fixed
        />
      </Page>
    </Document>
  );
}

export async function generateTaxSettlementPdfBlob(
  settlement: TaxSettlement,
  firm: FirmConfig | null,
  logoPng: Blob | null,
): Promise<Blob> {
  const el = <TaxSettlementPdfDocument settlement={settlement} firm={firm} logoPng={logoPng} />;
  return pdf(el).toBlob();
}

export function taxSettlementPdfFilename(settlement: TaxSettlement): string {
  const n = (settlement.number ?? '').replace(/[^\w.-]+/g, '_').replace(/^_|_$/g, '');
  return n ? `Liquidacion-${n}.pdf` : `Liquidacion-id-${settlement.id}.pdf`;
}
