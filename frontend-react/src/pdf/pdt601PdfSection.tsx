import { StyleSheet, Text, View } from '@react-pdf/renderer';
import {
  formatPdt621DetractionPaymentNote,
  formatTaxMoney,
  formatTaxTotalMoney,
  isNonZeroTaxAmount,
  listPdt601DisplayRows,
  type TaxSectionPdt601,
} from '../utils/taxSettlementSections';
import { PDF_LIQ } from './pdfLiquidationTheme';
import { PdfPdtSectionFooterRow } from './pdfPdtSectionFooter';

const COL_NUM = '17%';

const styles = StyleSheet.create({
  headerText: {
    fontSize: 7,
    fontWeight: 700,
    color: PDF_LIQ.text,
    textTransform: 'uppercase',
  },
  label: { fontSize: 7, color: PDF_LIQ.textMuted },
  value: { fontSize: 7, color: PDF_LIQ.text, textAlign: 'right' },
  dataRow: { flexDirection: 'row', paddingVertical: 2, borderBottomWidth: 0.5, borderBottomColor: '#E5E7EB' },
  detractionNote: {
    fontSize: 6.5,
    color: PDF_LIQ.textMuted,
    textAlign: 'right',
    marginTop: 1,
    marginBottom: 3,
    paddingRight: 2,
  },
});

function PdfListRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.dataRow}>
      <Text style={[styles.label, { width: '66%', textAlign: 'right', paddingRight: 4 }]}>{label}</Text>
      <Text style={[styles.value, { width: COL_NUM }]}>{value}</Text>
      <View style={{ width: COL_NUM }} />
    </View>
  );
}

type Props = {
  p601: TaxSectionPdt601;
  showFooter?: boolean;
  detractionNote?: string | null;
};

export function Pdt601PdfSection({ p601, showFooter = true, detractionNote }: Props) {
  const rows = listPdt601DisplayRows(p601).filter((item) => isNonZeroTaxAmount(item.value));
  const note = detractionNote ?? formatPdt621DetractionPaymentNote(p601.detraction_payment);

  return (
    <View>
      {rows.length > 0 ? (
        <View style={styles.dataRow}>
          <View style={{ width: '66%' }} />
          <Text style={[styles.headerText, { width: COL_NUM, textAlign: 'right' }]}>Impuesto</Text>
          <View style={{ width: COL_NUM }} />
        </View>
      ) : null}
      {rows.map((item) => (
        <PdfListRow key={item.label} label={item.label} value={formatTaxMoney(item.value)} />
      ))}
      {note ? <Text style={styles.detractionNote}>{note}. AFP no aplica detracción.</Text> : null}
      {showFooter ? (
        <PdfPdtSectionFooterRow
          label="Impuesto a pagar — PDT 601"
          value={formatTaxTotalMoney(p601.impuesto_a_pagar)}
        />
      ) : null}
    </View>
  );
}

export default Pdt601PdfSection;
