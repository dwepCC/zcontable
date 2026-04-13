import { Document, Image, Page, StyleSheet, Text, View, pdf } from '@react-pdf/renderer';
import type { AccountLedger, Company, FirmConfig } from '../types/dashboard';

export { loadLogoDataUrlForPdf as getLogoDataUrlForAccountPdf } from '../utils/pdfLogo';

const money = (n: number) =>
  `S/ ${Number(n ?? 0).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

type Props = {
  company: Company;
  ledger: AccountLedger;
  firm: FirmConfig | null;
  logoDataUrl: string | null;
};

export function CompanyAccountStatementPdfDocument({ company, ledger, firm, logoDataUrl }: Props) {
  const brand = firm?.name?.trim() || 'Estudio contable';
  const firmRuc = firm?.ruc?.trim() || '';

  const styles = StyleSheet.create({
    page: {
      paddingTop: 22,
      paddingBottom: 28,
      paddingHorizontal: 24,
      fontSize: 7,
      color: '#0f172a',
      fontFamily: 'Helvetica',
    },
    headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
    brandBlock: { flexDirection: 'row', alignItems: 'center', maxWidth: '45%' },
    logo: { width: 52, height: 52, objectFit: 'contain', marginRight: 10 },
    brandName: { fontSize: 11, fontWeight: 700, color: '#0c4a6e' },
    brandSub: { fontSize: 7, color: '#64748b', marginTop: 2 },
    titleBlock: { alignItems: 'center', flexGrow: 1 },
    mainTitle: { fontSize: 11, fontWeight: 700, textAlign: 'center' },
    periodLine: { fontSize: 8, marginTop: 4, color: '#334155', textAlign: 'center' },
    clientBox: {
      borderWidth: 1,
      borderColor: '#cbd5e1',
      borderRadius: 4,
      padding: 8,
      marginBottom: 10,
      backgroundColor: '#f8fafc',
    },
    clientLine: { fontSize: 7, marginBottom: 3, color: '#1e293b' },
    clientLabel: { fontWeight: 700, color: '#475569' },
    summaryTitle: {
      backgroundColor: '#e2e8f0',
      paddingVertical: 4,
      paddingHorizontal: 6,
      fontSize: 7,
      fontWeight: 700,
      color: '#334155',
      marginBottom: 0,
    },
    summaryRow: { flexDirection: 'row', marginBottom: 10 },
    sumCell: { flex: 1, paddingVertical: 6, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center' },
    sumGray: { backgroundColor: '#f1f5f9' },
    sumGreen: { backgroundColor: '#dcfce7' },
    sumRed: { backgroundColor: '#fee2e2' },
    sumLabel: { fontSize: 6, fontWeight: 700, textAlign: 'center', color: '#334155', marginBottom: 4 },
    sumVal: { fontSize: 8, fontWeight: 700, textAlign: 'center' },
    valGreen: { color: '#15803d' },
    valRed: { color: '#b91c1c' },
    valNeutral: { color: '#0f172a' },
    tableMoneyCargo: { color: '#b91c1c', fontWeight: 700 },
    tableMoneyAbono: { color: '#15803d', fontWeight: 700 },
    tableMoneySaldo: { color: '#0f172a', fontWeight: 700 },
    tableMoneyDash: { color: '#94a3b8' },
    tableHead: {
      flexDirection: 'row',
      backgroundColor: '#475569',
      color: '#ffffff',
      paddingVertical: 4,
      paddingHorizontal: 2,
      fontSize: 5.5,
      fontWeight: 700,
    },
    tableRow: {
      flexDirection: 'row',
      borderBottomWidth: 1,
      borderBottomColor: '#e2e8f0',
      paddingVertical: 3,
      paddingHorizontal: 2,
      fontSize: 5.5,
    },
    rowAlt: { backgroundColor: '#f8fafc' },
    c1: { width: '8%' },
    c2: { width: '8%' },
    c3: { width: '9%' },
    c4: { width: '10%' },
    c5: { width: '20%' },
    c6: { width: '9%' },
    c7: { width: '10%' },
    c8: { width: '8%', textAlign: 'right' },
    c9: { width: '8%', textAlign: 'right' },
    c10: { width: '10%', textAlign: 'right' },
    footer: {
      position: 'absolute',
      bottom: 12,
      left: 24,
      right: 24,
      fontSize: 6,
      color: '#94a3b8',
      textAlign: 'center',
    },
  });

  const movs = ledger.movements ?? [];

  return (
    <Document>
      <Page size="A4" orientation="landscape" style={styles.page}>
        <View style={styles.headerRow}>
          <View style={styles.brandBlock}>
            {logoDataUrl ? <Image style={styles.logo} src={logoDataUrl} /> : null}
            <View>
              <Text style={styles.brandName}>{brand}</Text>
              {firmRuc ? <Text style={styles.brandSub}>RUC {firmRuc}</Text> : null}
            </View>
          </View>
          <View style={styles.titleBlock}>
            <Text style={styles.mainTitle}>ESTADO DE CUENTA CLIENTES</Text>
            <Text style={styles.periodLine}>MES: {ledger.period_label}</Text>
          </View>
          <View style={{ width: '18%' }} />
        </View>

        <View style={styles.clientBox}>
          <Text style={styles.clientLine}>
            <Text style={styles.clientLabel}>CÓDIGO CLIENTE: </Text>
            {company.code?.trim() || '—'}
          </Text>
          <Text style={styles.clientLine}>
            <Text style={styles.clientLabel}>RAZÓN SOCIAL: </Text>
            {company.business_name}
          </Text>
          <Text style={styles.clientLine}>
            <Text style={styles.clientLabel}>RUC: </Text>
            {company.ruc}
          </Text>
          <Text style={styles.clientLine}>
            <Text style={styles.clientLabel}>DIRECCIÓN: </Text>
            {company.address?.trim() || '—'}
          </Text>
        </View>

        <Text style={styles.summaryTitle}>RESUMEN DEL MES</Text>
        <View style={styles.summaryRow}>
          <View style={[styles.sumCell, styles.sumGray]}>
            <Text style={styles.sumLabel}>SALDO ANTERIOR</Text>
            <Text style={[styles.sumVal, styles.valNeutral]}>{money(ledger.saldo_anterior)}</Text>
          </View>
          <View style={[styles.sumCell, styles.sumGreen]}>
            <Text style={styles.sumLabel}>ABONOS / PAGOS</Text>
            <Text style={[styles.sumVal, styles.valGreen]}>{money(ledger.total_abonos)}</Text>
          </View>
          <View style={[styles.sumCell, styles.sumRed]}>
            <Text style={styles.sumLabel}>CARGOS / DEUDAS</Text>
            <Text style={[styles.sumVal, styles.valRed]}>{money(ledger.total_cargos)}</Text>
          </View>
          <View style={[styles.sumCell, styles.sumGray]}>
            <Text style={styles.sumLabel}>SALDO FINAL</Text>
            <Text
              style={[
                styles.sumVal,
                ledger.saldo_final > 0.005 ? styles.valRed : ledger.saldo_final < -0.005 ? styles.valGreen : styles.valNeutral,
              ]}
            >
              {money(ledger.saldo_final)}
            </Text>
          </View>
        </View>

        <View style={styles.tableHead}>
          <Text style={styles.c1}>FECHA OP.</Text>
          <Text style={styles.c2}>FECHA PROC.</Text>
          <Text style={styles.c3}>TIPO</Text>
          <Text style={styles.c4}>NRO DOC.</Text>
          <Text style={styles.c5}>DETALLE</Text>
          <Text style={styles.c6}>MEDIO PAGO</Text>
          <Text style={styles.c7}>COD. OP.</Text>
          <Text style={styles.c8}>CARGO</Text>
          <Text style={styles.c9}>ABONO</Text>
          <Text style={styles.c10}>SALDO</Text>
        </View>

        {movs.map((row, idx) => (
          <View key={`${row.type_code}-${idx}`} style={[styles.tableRow, idx % 2 === 1 ? styles.rowAlt : {}]} wrap={false}>
            <Text style={styles.c1}>{row.operation_date?.slice(0, 10) || '—'}</Text>
            <Text style={styles.c2}>{row.process_date?.slice(0, 10) || '—'}</Text>
            <Text style={styles.c3}>{row.type_code}</Text>
            <Text style={styles.c4}>{row.document_number}</Text>
            <Text style={styles.c5}>{row.detail?.slice(0, 120) || '—'}</Text>
            <Text style={styles.c6}>{row.payment_method || '—'}</Text>
            <Text style={styles.c7}>{row.operation_code || '—'}</Text>
            <Text style={[styles.c8, row.cargo > 0 ? styles.tableMoneyCargo : styles.tableMoneyDash]}>
              {row.cargo > 0 ? money(row.cargo) : '—'}
            </Text>
            <Text style={[styles.c9, row.abono > 0 ? styles.tableMoneyAbono : styles.tableMoneyDash]}>
              {row.abono > 0 ? money(row.abono) : '—'}
            </Text>
            <Text
              style={[
                styles.c10,
                row.balance > 0.005
                  ? styles.tableMoneyCargo
                  : row.balance < -0.005
                    ? styles.tableMoneyAbono
                    : styles.tableMoneySaldo,
              ]}
            >
              {money(row.balance)}
            </Text>
          </View>
        ))}

        <Text
          style={styles.footer}
          render={({ pageNumber, totalPages }) =>
            `${brand} · Estado de cuenta ${company.ruc} · ${ledger.period_label} · Pág. ${pageNumber}/${totalPages}`
          }
          fixed
        />
      </Page>
    </Document>
  );
}

export async function generateCompanyAccountStatementPdfBlob(
  company: Company,
  ledger: AccountLedger,
  firm: FirmConfig | null,
  logoDataUrl: string | null,
): Promise<Blob> {
  const el = <CompanyAccountStatementPdfDocument company={company} ledger={ledger} firm={firm} logoDataUrl={logoDataUrl} />;
  return pdf(el).toBlob();
}

export function companyAccountStatementPdfFilename(company: Company, ledger: AccountLedger): string {
  const ruc = String(company.ruc ?? '').replace(/\W+/g, '');
  const p = `${ledger.period_year}-${String(ledger.period_month).padStart(2, '0')}`;
  return `EstadoCuenta-${ruc || 'cliente'}-${p}.pdf`;
}
