import { StyleSheet, Text, View } from '@react-pdf/renderer';
import { formatRentaRateLabel } from '../utils/companyTaxRegime';
import {
  formatImpuestoPeriodo,
  formatTaxMoney,
  formatTaxRowMoney,
  listPdt621IgvDisplayRows,
  type TaxSectionPdt621,
} from '../utils/taxSettlementSections';
import { PDF_LIQ } from './pdfLiquidationTheme';

const COL_CONCEPT = '32%';
const COL_NUM = '17%';

const styles = StyleSheet.create({
  sectionTitle: {
    fontSize: 8,
    fontWeight: 700,
    color: PDF_LIQ.blueDark,
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  headerText: {
    fontSize: 7,
    fontWeight: 700,
    color: PDF_LIQ.text,
    textTransform: 'uppercase',
  },
  headerRow: {
    flexDirection: 'row',
    paddingVertical: 3,
    paddingHorizontal: 2,
    marginBottom: 2,
    borderBottomWidth: 1,
    borderBottomColor: PDF_LIQ.grayBorder,
  },
  rowText: { fontSize: 7, color: PDF_LIQ.text },
  label: { fontSize: 7, color: PDF_LIQ.textMuted },
  labelEmphasis: { fontSize: 7.5, fontWeight: 700, color: PDF_LIQ.blueDark, textTransform: 'uppercase' },
  value: { fontSize: 7, color: PDF_LIQ.text, textAlign: 'right' },
  dataRow: { flexDirection: 'row', paddingVertical: 2, borderBottomWidth: 0.5, borderBottomColor: '#E5E7EB' },
  sectionDivider: { borderTopWidth: 1, borderTopColor: PDF_LIQ.grayBorder, marginTop: 6, paddingTop: 4 },
  footerBox: { marginTop: 6, alignSelf: 'flex-end', width: '42%' },
  footerLabel: { fontSize: 7, color: PDF_LIQ.textMuted, textAlign: 'right' },
  footerValue: { fontSize: 10, fontWeight: 700, color: PDF_LIQ.blueDark, textAlign: 'right', marginTop: 2 },
});

function PdfHeaderRow() {
  return (
    <View style={styles.headerRow}>
      <Text style={[styles.headerText, { width: COL_CONCEPT }]}>Concepto</Text>
      <Text style={[styles.headerText, { width: COL_NUM, textAlign: 'right' }]}>Base imponible</Text>
      <Text style={[styles.headerText, { width: COL_NUM, textAlign: 'right' }]}>No gravadas</Text>
      <Text style={[styles.headerText, { width: COL_NUM, textAlign: 'right' }]}>Impuesto</Text>
      <Text style={[styles.headerText, { width: COL_NUM, textAlign: 'right' }]}>Total</Text>
    </View>
  );
}

function PdfIgvDataRow({
  label,
  base,
  noGravadas,
  impuesto,
  total,
}: {
  label: string;
  base: string;
  noGravadas: string;
  impuesto: string;
  total: string;
}) {
  return (
    <View style={styles.dataRow}>
      <Text style={[styles.rowText, { width: COL_CONCEPT }]}>{label}</Text>
      <Text style={[styles.value, { width: COL_NUM }]}>{base}</Text>
      <Text style={[styles.value, { width: COL_NUM }]}>{noGravadas}</Text>
      <Text style={[styles.value, { width: COL_NUM }]}>{impuesto}</Text>
      <Text style={[styles.value, { width: COL_NUM }]}>{total}</Text>
    </View>
  );
}

function PdfSummaryRow({
  label,
  value,
  emphasized = false,
}: {
  label: string;
  value: string;
  emphasized?: boolean;
}) {
  return (
    <View style={styles.dataRow}>
      <Text style={[emphasized ? styles.labelEmphasis : styles.label, { width: '66%', textAlign: 'right', paddingRight: 4 }]}>
        {label}
      </Text>
      <Text style={[styles.value, { width: COL_NUM }]}>{value}</Text>
      <Text style={{ width: COL_NUM }} />
    </View>
  );
}

type Props = {
  p621: TaxSectionPdt621;
  rentaRatePct?: number | null;
  showFooter?: boolean;
};

export function Pdt621PdfSection({ p621, rentaRatePct, showFooter = true }: Props) {
  const igvRows = listPdt621IgvDisplayRows(p621);
  const rentaRateLabel = rentaRatePct != null ? formatRentaRateLabel(rentaRatePct) : null;

  const summaryRows = [
    { label: 'Impuesto del periodo', value: formatImpuestoPeriodo(p621.impuesto_periodo), emphasized: false },
    { label: 'Crédito periodo anterior', value: formatTaxMoney(p621.credito_periodo_anterior), emphasized: false },
    { label: 'Saldo a favor', value: formatTaxMoney(p621.saldo_favor), emphasized: true },
    { label: 'Percepciones del periodo', value: formatTaxMoney(p621.percepciones_periodo), emphasized: false },
    {
      label: 'Percepciones periodos anteriores',
      value: formatTaxMoney(p621.percepciones_anteriores),
      emphasized: false,
    },
    { label: 'Retenciones del periodo', value: formatTaxMoney(p621.retenciones_periodo), emphasized: false },
    {
      label: 'Retenciones periodos anteriores',
      value: formatTaxMoney(p621.retenciones_anteriores),
      emphasized: false,
    },
    { label: 'Saldo a favor (final)', value: formatTaxMoney(p621.saldo_favor_final), emphasized: true },
  ] as const;

  const rentaRows = [
    { label: 'Ingresos netos (base)', value: formatTaxRowMoney(p621.renta_ventas_base), emphasized: false },
    {
      label: `Impuesto renta${rentaRateLabel ? ` (${rentaRateLabel})` : ''}`,
      value: formatTaxRowMoney(p621.renta_ventas_impuesto),
      emphasized: false,
    },
    { label: 'Saldo a favor ITAN', value: formatTaxMoney(p621.renta_saldo_favor_itan), emphasized: false },
    { label: 'Impuesto a pagar (renta)', value: formatTaxMoney(p621.renta_impuesto_a_pagar), emphasized: true },
  ] as const;

  return (
    <View>
      <Text style={styles.sectionTitle}>1. IGV mensual</Text>
      <PdfHeaderRow />
      {igvRows.map(({ label, row }) => (
        <PdfIgvDataRow
          key={label}
          label={label}
          base={formatTaxMoney(row.base)}
          noGravadas={formatTaxMoney(row.no_gravadas ?? 0)}
          impuesto={formatTaxMoney(row.impuesto)}
          total={formatTaxMoney(row.total)}
        />
      ))}
      {summaryRows.map((item) => (
        <PdfSummaryRow key={item.label} label={item.label} value={item.value} emphasized={item.emphasized} />
      ))}

      <View style={styles.sectionDivider}>
        <Text style={styles.sectionTitle}>2. Renta mensual</Text>
        <View style={styles.dataRow}>
          <Text style={{ width: '66%' }} />
          <Text style={[styles.headerText, { width: COL_NUM, textAlign: 'right' }]}>Impuesto</Text>
          <Text style={{ width: COL_NUM }} />
        </View>
        {rentaRows.map((item) => (
          <PdfSummaryRow key={item.label} label={item.label} value={item.value} emphasized={item.emphasized} />
        ))}
      </View>

      {showFooter ? (
        <View style={styles.footerBox}>
          <Text style={styles.footerLabel}>Impuesto a pagar — PDT 621</Text>
          <Text style={styles.footerValue}>{formatTaxMoney(p621.impuesto_a_pagar)}</Text>
        </View>
      ) : null}
    </View>
  );
}

export default Pdt621PdfSection;
