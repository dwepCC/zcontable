import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { formatInTimeZone } from 'date-fns-tz';
import { companiesService } from '../services/companies';
import { documentsService } from '../services/documents';
import { paymentsService, type PaymentTukifacIssuePayload, type PaymentUpsertInput } from '../services/payments';
import { taxSettlementsService } from '../services/taxSettlements';
import { auth } from '../services/auth';
import type { Company, Document } from '../types/dashboard';
import SearchableSelect from '../components/SearchableSelect';
import { resolveBackendUrl } from '../api/client';

function toDateInput(value?: string): string {
  if (!value) return '';
  if (value.length >= 10) return value.slice(0, 10);
  return value;
}

function toRFC3339FromDateInput(value: string): string | undefined {
  if (!value) return undefined;
  return `${value}T00:00:00Z`;
}

function getErrorMessage(e: unknown): string {
  if (!e || typeof e !== 'object') return 'Error al guardar el pago';
  if (!('response' in e)) return 'Error al guardar el pago';
  const maybe = e as { response?: { data?: unknown } };
  const data = maybe.response?.data;
  if (data && typeof data === 'object' && 'error' in data) {
    const msg = (data as { error?: unknown }).error;
    if (typeof msg === 'string' && msg.trim()) return msg;
  }
  return 'Error al guardar el pago';
}

function getTukifacErrorMessage(e: unknown): string {
  if (!e || typeof e !== 'object') return 'Error al enviar el comprobante a Tukifac';
  if (!('response' in e)) return 'Error al enviar el comprobante a Tukifac';
  const maybe = e as { response?: { data?: unknown } };
  const data = maybe.response?.data;
  if (data && typeof data === 'object' && 'error' in data) {
    const msg = (data as { error?: unknown }).error;
    if (typeof msg === 'string' && msg.trim()) return msg;
  }
  return 'Error al enviar el comprobante a Tukifac';
}

const PaymentForm = () => {
  const navigate = useNavigate();
  const params = useParams();
  const [searchParams] = useSearchParams();
  const paymentId = params.id ? Number(params.id) : null;
  const isEdit = Boolean(paymentId);
  const initialType = searchParams.get('type') ?? '';
  const taxSettlementIdFromUrl = searchParams.get('tax_settlement_id');

  const role = auth.getRole() ?? '';
  const canCreate = useMemo(
    () => role === 'Administrador' || role === 'Supervisor' || role === 'Contador' || role === 'Asistente',
    [role],
  );
  const canEdit = useMemo(() => role === 'Administrador' || role === 'Supervisor' || role === 'Contador', [role]);
  const canUpsert = isEdit ? canEdit : canCreate;
  const canIssueTukifac = useMemo(
    () => role === 'Administrador' || role === 'Supervisor' || role === 'Contador',
    [role],
  );

  const peruvianToday = useMemo(() => formatInTimeZone(new Date(), 'America/Lima', 'yyyy-MM-dd'), []);

  const [companies, setCompanies] = useState<Company[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [editLocked, setEditLocked] = useState(false);

  const [companyId, setCompanyId] = useState(searchParams.get('company_id') ?? '');
  const [documentId, setDocumentId] = useState(searchParams.get('document_id') ?? '');
  const [paymentType, setPaymentType] = useState<'applied' | 'on_account'>(
    initialType === 'applied' || initialType === 'on_account'
      ? (initialType as 'applied' | 'on_account')
      : searchParams.get('document_id')
        ? 'applied'
        : 'on_account',
  );
  const [date, setDate] = useState(() => (isEdit ? '' : peruvianToday));
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('');
  const [reference, setReference] = useState('');
  const [attachment, setAttachment] = useState('');
  const [notes, setNotes] = useState('');
  const [applyMode, setApplyMode] = useState<'single' | 'fifo' | 'manual'>('single');
  const [manualAlloc, setManualAlloc] = useState<{ doc: string; amt: string }[]>([{ doc: '', amt: '' }]);
  /** Pago vinculado a liquidación emitida (precarga imputaciones; se anula si cambia la empresa). */
  const [settlementLink, setSettlementLink] = useState<{ id: number; companyId: number; number: string } | null>(null);
  const [settlementLoadError, setSettlementLoadError] = useState('');
  const settlementLoadedRef = useRef(false);
  const lastSettlementParamRef = useRef<string | null>(null);

  const [issueTukifac, setIssueTukifac] = useState(true);
  const [tukifacKind, setTukifacKind] = useState<'boleta' | 'factura' | 'sale_note'>('boleta');
  const [tukifacSerie, setTukifacSerie] = useState('');
  const [tukifacSaleNoteSeriesId, setTukifacSaleNoteSeriesId] = useState('');
  const [tukifacPayMethodId, setTukifacPayMethodId] = useState('01');
  const [tukifacPayDest, setTukifacPayDest] = useState('cash');
  const [tukifacPayRef, setTukifacPayRef] = useState('Caja');

  const methodOptions = useMemo(() => {
    const base = [
      { value: 'Efectivo', label: 'Efectivo' },
      { value: 'Yape', label: 'Yape' },
      { value: 'Plin', label: 'Plin' },
      { value: 'Tarjeta', label: 'Tarjeta' },
    ];

    const hasCurrent = method.trim() && base.some((o) => o.value === method.trim());
    return [
      { value: '', label: 'Selecciona…' },
      ...(hasCurrent ? [] : method.trim() ? [{ value: method.trim(), label: method.trim() }] : []),
      ...base,
    ];
  }, [method]);

  const handleAttachmentFileChange = async (file: File | null) => {
    if (!file) return;
    if (!canUpsert) {
      setError('No tienes permisos para realizar esta acción');
      return;
    }
    try {
      setUploading(true);
      setError('');
      const url = await paymentsService.uploadAttachment(file);
      setAttachment(url);
    } catch (e) {
      console.error(e);
      setError(getErrorMessage(e));
    } finally {
      setUploading(false);
    }
  };

  useEffect(() => {
    const run = async () => {
      try {
        setLoading(true);
        setError('');

        const [comps, pay] = await Promise.all([
          companiesService.list(),
          isEdit && paymentId ? paymentsService.get(paymentId) : Promise.resolve(null),
        ]);

        setCompanies(comps);

        if (pay) {
          const normalizedType = (pay.type ?? '').toLowerCase().trim();
          const hasAlloc = Array.isArray(pay.allocations) && pay.allocations.length > 0;
          if (pay.document_id || normalizedType === 'applied' || hasAlloc) {
            setEditLocked(true);
            setError('No se puede editar un pago aplicado a deudas o con imputaciones');
            return;
          }
          setCompanyId(String(pay.company_id ?? ''));
          setDocumentId(pay.document_id ? String(pay.document_id) : '');
          setPaymentType(pay.type === 'applied' || pay.type === 'on_account' ? pay.type : pay.document_id ? 'applied' : 'on_account');
          setDate(toDateInput(pay.date));
          setAmount(Number.isFinite(pay.amount) ? pay.amount.toFixed(2) : '');
          setMethod(pay.method ?? '');
          setReference(pay.reference ?? '');
          setAttachment(pay.attachment ?? '');
          setNotes(pay.notes ?? '');
        }
      } catch (e) {
        console.error(e);
        setError(isEdit ? 'Error al cargar el pago' : 'Error al cargar datos');
      } finally {
        setLoading(false);
      }
    };

    run();
  }, [isEdit, paymentId]);

  useEffect(() => {
    const companyIdNum = Number(companyId);
    if (!Number.isFinite(companyIdNum) || companyIdNum <= 0) {
      setDocuments([]);
      return;
    }
    if (paymentType !== 'applied') {
      setDocuments([]);
      return;
    }

    const run = async () => {
      try {
        const list = await documentsService.list({ company_id: String(companyIdNum) });
        setDocuments(list.filter((d) => d.status !== 'pagado' && d.status !== 'anulado'));
      } catch (e) {
        console.error(e);
        setDocuments([]);
      }
    };

    run();
  }, [companyId, paymentType]);

  useEffect(() => {
    if (paymentType === 'on_account' && documentId) {
      setDocumentId('');
    }
  }, [documentId, paymentType]);

  useEffect(() => {
    if (isEdit) return;
    const param = taxSettlementIdFromUrl?.trim() ?? '';
    if (lastSettlementParamRef.current !== param) {
      settlementLoadedRef.current = false;
      lastSettlementParamRef.current = param || null;
    }
    if (!param || settlementLoadedRef.current) return;
    const sid = Number(param);
    if (!Number.isFinite(sid) || sid <= 0) return;
    let cancelled = false;
    void (async () => {
      try {
        setSettlementLoadError('');
        const sug = await taxSettlementsService.paymentSuggestions(sid);
        if (cancelled) return;
        settlementLoadedRef.current = true;
        setCompanyId(String(sug.company_id));
        setPaymentType('applied');
        setApplyMode('manual');
        if (sug.status === 'emitida') {
          setSettlementLink({
            id: sid,
            companyId: sug.company_id,
            number: sug.settlement_number?.trim() ?? '',
          });
        } else {
          setSettlementLink(null);
        }
        if (sug.lines.length > 0) {
          setManualAlloc(sug.lines.map((l) => ({ doc: String(l.document_id), amt: l.amount.toFixed(2) })));
          setAmount(sug.suggested_total.toFixed(2));
          setSettlementLoadError(
            sug.status !== 'emitida'
              ? 'Liquidación en borrador: imputaciones según saldos actuales. Al emitirla podrá vincular este pago a la liquidación.'
              : '',
          );
        } else {
          setManualAlloc([{ doc: '', amt: '' }]);
          setAmount('');
          setSettlementLoadError(
            sug.status !== 'emitida'
              ? 'Liquidación en borrador: no hay saldo pendiente en las deudas de la liquidación. Emítala o cargue imputaciones manualmente.'
              : 'No hay saldo pendiente en las deudas de esta liquidación. Agregue imputaciones manualmente si corresponde.',
          );
        }
        const refLabel = sug.settlement_number?.trim() ? `Liquidación ${sug.settlement_number.trim()}` : `Liquidación #${sid}`;
        setNotes((n) => (n.trim() ? n : refLabel));
      } catch {
        if (!cancelled) {
          setSettlementLoadError('No se pudieron cargar las imputaciones desde la liquidación.');
          settlementLoadedRef.current = true;
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isEdit, taxSettlementIdFromUrl]);

  useEffect(() => {
    if (!settlementLink) return;
    const cid = Number(companyId);
    if (!cid || cid !== settlementLink.companyId) {
      setSettlementLink(null);
    }
  }, [companyId, settlementLink]);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (isEdit && editLocked) {
      setError('No se puede editar un pago aplicado a una deuda');
      return;
    }
    if (!canUpsert) {
      setError('No tienes permisos para realizar esta acción');
      return;
    }

    const companyIdNum = Number(companyId);
    const documentIdNum = Number(documentId);
    const amountNum = Number(amount);

    if (!companyIdNum) {
      setError('La empresa es requerida');
      return;
    }

    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      setError('El monto debe ser mayor a 0');
      return;
    }

    if (paymentType === 'applied') {
      if (applyMode === 'single') {
        if (!documentId || !Number.isFinite(documentIdNum) || documentIdNum <= 0) {
          setError('Seleccione la deuda o use FIFO / manual');
          return;
        }
      }
      if (applyMode === 'manual') {
        const lines = manualAlloc
          .filter((l) => l.doc && Number(l.amt) > 0)
          .map((l) => ({ document_id: Number(l.doc), amount: Number(l.amt) }));
        if (lines.length === 0) {
          setError('Indique al menos una línea de imputación manual');
          return;
        }
        const sum = lines.reduce((a, l) => a + l.amount, 0);
        if (Math.abs(sum - amountNum) > 0.02) {
          setError('La suma de imputaciones debe coincidir con el monto del pago');
          return;
        }
      }
    }

    const tryTukifacAfterCreate =
      !isEdit && issueTukifac && settlementLink && canIssueTukifac && paymentType === 'applied';
    if (tryTukifacAfterCreate && tukifacKind === 'sale_note') {
      const sid = Number(tukifacSaleNoteSeriesId);
      if (!Number.isFinite(sid) || sid <= 0) {
        setError('Para nota de venta indique el ID numérico de la serie en Tukifac.');
        return;
      }
    }

    const payload: PaymentUpsertInput = {
      company_id: companyIdNum,
      amount: amountNum,
      type: paymentType,
      date: toRFC3339FromDateInput(date),
      method: method.trim() ? method.trim() : undefined,
      reference: reference.trim() ? reference.trim() : undefined,
      attachment: attachment.trim() ? attachment.trim() : undefined,
      notes: notes.trim() ? notes.trim() : undefined,
    };

    if (paymentType === 'applied') {
      if (applyMode === 'fifo') {
        payload.allocation_mode = 'fifo';
      } else if (applyMode === 'manual') {
        payload.allocation_mode = 'manual';
        payload.allocations = manualAlloc
          .filter((l) => l.doc && Number(l.amt) > 0)
          .map((l) => ({ document_id: Number(l.doc), amount: Number(l.amt) }));
      } else if (documentId && Number.isFinite(documentIdNum) && documentIdNum > 0) {
        payload.document_id = documentIdNum;
      }
      if (settlementLink && Number(companyId) === settlementLink.companyId) {
        payload.tax_settlement_id = settlementLink.id;
      }
    }

    try {
      setSaving(true);
      setError('');
      if (isEdit && paymentId) {
        await paymentsService.update(paymentId, payload);
        window.dispatchEvent(
          new CustomEvent('miweb:toast', {
            detail: { type: 'success', message: 'Pago actualizado correctamente.' },
          }),
        );
      } else {
        const created = await paymentsService.create(payload);
        window.dispatchEvent(
          new CustomEvent('miweb:toast', {
            detail: { type: 'success', message: 'Pago registrado correctamente.' },
          }),
        );
        if (tryTukifacAfterCreate) {
          try {
            const tukBody: PaymentTukifacIssuePayload = {
              kind: tukifacKind,
              serie_documento: tukifacSerie.trim() || undefined,
              sale_note_series_id:
                tukifacKind === 'sale_note' ? Number(tukifacSaleNoteSeriesId) : undefined,
              payment_method_type_id: tukifacPayMethodId.trim() || undefined,
              payment_destination_id: tukifacPayDest.trim() || undefined,
              payment_reference: tukifacPayRef.trim() || undefined,
            };
            await paymentsService.issueTukifacFromPayment(created.id, tukBody);
            window.dispatchEvent(
              new CustomEvent('miweb:toast', {
                detail: { type: 'success', message: 'Comprobante enviado a Tukifac correctamente.' },
              }),
            );
          } catch (te) {
            console.error(te);
            window.dispatchEvent(
              new CustomEvent('miweb:toast', {
                detail: {
                  type: 'error',
                  message: `Pago guardado. No se pudo emitir en Tukifac: ${getTukifacErrorMessage(te)}`,
                },
              }),
            );
          }
        }
      }
      navigate('/payments', { replace: true });
    } catch (e2) {
      console.error(e2);
      setError(getErrorMessage(e2));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="rounded-lg border border-slate-200 bg-white px-4 py-6 text-sm text-slate-600">
          <i className="fas fa-spinner fa-spin mr-2"></i> Cargando...
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-slate-800">{isEdit ? 'Editar pago' : 'Nuevo pago'}</h2>
          <p className="text-sm text-slate-500">
            Pagos aplicados a deudas (una deuda, FIFO o imputación manual) o a cuenta. Si entra desde una liquidación emitida,
            las imputaciones se precargan y puede añadir más líneas; opcionalmente se emite factura, boleta o nota de venta en Tukifac
            con esas líneas como ítems.
          </p>
        </div>
        <Link
          to="/payments"
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-slate-300 text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          <i className="fas fa-arrow-left text-xs"></i> Volver al listado
        </Link>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      ) : null}

      {settlementLink ? (
        <div className="rounded-xl border border-primary-200 bg-primary-50/90 px-4 py-3 text-sm text-primary-950">
          <span className="font-semibold">Pago vinculado a liquidación</span>
          {settlementLink.number ? ` (${settlementLink.number})` : ` (#${settlementLink.id})`}. Las deudas de la liquidación con
          saldo se cargaron en modo manual: puede ajustar montos o usar «+ Añadir línea» para imputar a otras deudas. Si cambia de
          empresa, se quita el vínculo.
        </div>
      ) : null}

      {settlementLoadError ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">{settlementLoadError}</div>
      ) : null}

      {isEdit && editLocked ? (
        <div className="rounded-lg border border-slate-200 bg-white px-4 py-4 text-sm text-slate-600">
          Este pago está aplicado a una deuda. Puedes eliminarlo desde el listado de pagos.
        </div>
      ) : (
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label htmlFor="company_id" className="block text-sm font-medium text-slate-700 mb-1">
              Empresa
            </label>
            <SearchableSelect
              id="company_id"
              name="company_id"
              required
              value={companyId}
              onChange={setCompanyId}
              placeholder="Selecciona una empresa…"
              searchPlaceholder="Buscar empresa..."
              options={companies.map((c) => ({ value: String(c.id), label: c.business_name }))}
            />
          </div>
          <div>
            <label htmlFor="type" className="block text-sm font-medium text-slate-700 mb-1">
              Tipo
            </label>
            <SearchableSelect
              id="type"
              name="type"
              value={paymentType}
              onChange={(v) => setPaymentType(v as 'applied' | 'on_account')}
              options={[
                { value: 'applied', label: 'Aplicado a deuda' },
                { value: 'on_account', label: 'Pago a cuenta' },
              ]}
            />
          </div>
          {paymentType === 'applied' ? (
            <div className="md:col-span-3 space-y-3">
              <span className="block text-sm font-medium text-slate-700">Imputación del pago</span>
              <div className="flex flex-wrap gap-4 text-sm">
                <label className="flex items-center gap-2">
                  <input type="radio" checked={applyMode === 'single'} onChange={() => setApplyMode('single')} />
                  Una deuda
                </label>
                <label className="flex items-center gap-2">
                  <input type="radio" checked={applyMode === 'fifo'} onChange={() => setApplyMode('fifo')} />
                  FIFO (más antiguo primero)
                </label>
                <label className="flex items-center gap-2">
                  <input type="radio" checked={applyMode === 'manual'} onChange={() => setApplyMode('manual')} />
                  Manual (varias deudas)
                </label>
              </div>
              {applyMode === 'single' ? (
                <div>
                  <label htmlFor="document_id" className="block text-sm font-medium text-slate-700 mb-1">
                    Deuda
                  </label>
                  <SearchableSelect
                    id="document_id"
                    name="document_id"
                    value={documentId}
                    disabled={!companyId}
                    onChange={setDocumentId}
                    placeholder="Selecciona una deuda…"
                    searchPlaceholder="Buscar deuda..."
                    options={[
                      { value: '', label: 'Selecciona una deuda…' },
                      ...documents.map((d) => ({
                        value: String(d.id),
                        label: `${d.number} (${Number.isFinite(d.total_amount) ? d.total_amount.toFixed(2) : '0.00'}) ${d.status}${
                          d.due_date ? ` - vcto ${d.due_date.slice(0, 10)}` : ''
                        }`,
                        searchText: [d.number, d.status, d.due_date ? d.due_date.slice(0, 10) : ''].filter(Boolean).join(' '),
                      })),
                    ]}
                  />
                </div>
              ) : null}
              {applyMode === 'manual' ? (
                <div className="space-y-2">
                  {manualAlloc.map((row, idx) => (
                    <div key={idx} className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      <SearchableSelect
                        value={row.doc}
                        onChange={(v) => {
                          const n = [...manualAlloc];
                          n[idx] = { ...n[idx], doc: v };
                          setManualAlloc(n);
                        }}
                        placeholder="Deuda"
                        options={[
                          { value: '', label: '—' },
                          ...documents.map((d) => ({
                            value: String(d.id),
                            label: `${d.number} (${d.total_amount.toFixed(2)})`,
                          })),
                        ]}
                      />
                      <input
                        type="number"
                        step="0.01"
                        placeholder="Monto a imputar"
                        value={row.amt}
                        onChange={(ev) => {
                          const n = [...manualAlloc];
                          n[idx] = { ...n[idx], amt: ev.target.value };
                          setManualAlloc(n);
                        }}
                        className="px-3 py-2 rounded-lg border border-slate-300 text-sm"
                      />
                    </div>
                  ))}
                  <button
                    type="button"
                    className="text-xs text-primary-700"
                    onClick={() => setManualAlloc([...manualAlloc, { doc: '', amt: '' }])}
                  >
                    + Línea
                  </button>
                </div>
              ) : null}
            </div>
          ) : (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Deuda</label>
              <p className="text-sm text-slate-400 py-2">No aplica para pagos a cuenta</p>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label htmlFor="date" className="block text-sm font-medium text-slate-700 mb-1">
              Fecha
            </label>
            <input
              type="date"
              id="date"
              name="date"
              value={date}
              onChange={(ev) => setDate(ev.target.value)}
              className="w-full px-3 py-2.5 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
            />
          </div>
          <div>
            <label htmlFor="amount" className="block text-sm font-medium text-slate-700 mb-1">
              Monto
            </label>
            <div className="flex items-center rounded-lg border border-slate-300 focus-within:ring-2 focus-within:ring-primary-500 focus-within:border-primary-500">
              <span className="px-3 text-slate-500 text-sm">$</span>
              <input
                type="number"
                step="0.01"
                min="0"
                id="amount"
                name="amount"
                required
                value={amount}
                onChange={(ev) => setAmount(ev.target.value)}
                className="w-full px-2 py-2.5 rounded-r-lg outline-none text-sm"
              />
            </div>
          </div>
          <div>
            <label htmlFor="method" className="block text-sm font-medium text-slate-700 mb-1">
              Método
            </label>
            <SearchableSelect
              id="method"
              name="method"
              value={method}
              onChange={setMethod}
              placeholder="Selecciona…"
              options={methodOptions}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="reference" className="block text-sm font-medium text-slate-700 mb-1">
              Referencia
            </label>
            <input
              type="text"
              id="reference"
              name="reference"
              value={reference}
              onChange={(ev) => setReference(ev.target.value)}
              className="w-full px-3 py-2.5 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
              placeholder="N° operación bancaria, recibo, etc."
            />
          </div>
          <div>
            <label htmlFor="attachment" className="block text-sm font-medium text-slate-700 mb-1">
              Comprobante (imagen o PDF)
            </label>
            <div className="space-y-2">
              <input
                type="file"
                accept="image/*,.pdf"
                disabled={uploading || saving || !canUpsert}
                onChange={(ev) => handleAttachmentFileChange(ev.target.files?.[0] ?? null)}
                className="w-full text-sm text-slate-700 file:mr-4 file:rounded-full file:border-0 file:bg-primary-50 file:px-4 file:py-2 file:text-sm file:font-medium file:text-primary-700 hover:file:bg-primary-100"
              />
              <input type="hidden" id="attachment" name="attachment" value={attachment} />
              {uploading ? (
                <div className="text-xs text-slate-500">
                  <i className="fas fa-spinner fa-spin mr-2"></i> Subiendo comprobante...
                </div>
              ) : null}
              {attachment ? (
                <a
                  href={resolveBackendUrl(attachment)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center text-xs font-medium text-primary-700 hover:text-primary-800"
                >
                  <i className="fas fa-paperclip mr-2"></i> Ver comprobante
                </a>
              ) : null}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="notes" className="block text-sm font-medium text-slate-700 mb-1">
              Notas
            </label>
            <textarea
              id="notes"
              name="notes"
              rows={2}
              value={notes}
              onChange={(ev) => setNotes(ev.target.value)}
              className="w-full px-3 py-2.5 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none resize-none"
            />
          </div>
        </div>

        {!isEdit && settlementLink && paymentType === 'applied' && canIssueTukifac ? (
          <div className="rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-4 space-y-3 text-sm">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                className="mt-1 rounded border-slate-300"
                checked={issueTukifac}
                onChange={(ev) => setIssueTukifac(ev.target.checked)}
              />
              <span>
                <span className="font-semibold text-slate-800">Emitir comprobante en Tukifac</span>
                <span className="block text-slate-600 mt-0.5">
                  Los ítems salen de las imputaciones de este pago (deudas de la liquidación y líneas extra que agregue). No hace falta
                  pegar JSON.
                </span>
              </span>
            </label>
            {issueTukifac ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1 pl-0 md:pl-7">
                <div>
                  <label htmlFor="tukifac_kind" className="block text-xs font-medium text-slate-600 mb-1">
                    Tipo de comprobante
                  </label>
                  <select
                    id="tukifac_kind"
                    value={tukifacKind}
                    onChange={(ev) => setTukifacKind(ev.target.value as 'boleta' | 'factura' | 'sale_note')}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white"
                  >
                    <option value="boleta">Boleta (03)</option>
                    <option value="factura">Factura (01)</option>
                    <option value="sale_note">Nota de venta</option>
                  </select>
                </div>
                {tukifacKind === 'sale_note' ? (
                  <div>
                    <label htmlFor="tukifac_nv_series" className="block text-xs font-medium text-slate-600 mb-1">
                      ID de serie NV en Tukifac
                    </label>
                    <input
                      id="tukifac_nv_series"
                      type="number"
                      min={1}
                      placeholder="Ej. 1"
                      value={tukifacSaleNoteSeriesId}
                      onChange={(ev) => setTukifacSaleNoteSeriesId(ev.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                    />
                  </div>
                ) : (
                  <div>
                    <label htmlFor="tukifac_serie" className="block text-xs font-medium text-slate-600 mb-1">
                      Serie SUNAT (opcional)
                    </label>
                    <input
                      id="tukifac_serie"
                      type="text"
                      placeholder={tukifacKind === 'factura' ? 'F001' : 'B001'}
                      value={tukifacSerie}
                      onChange={(ev) => setTukifacSerie(ev.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                    />
                  </div>
                )}
                <div>
                  <label htmlFor="tukifac_pay_method" className="block text-xs font-medium text-slate-600 mb-1">
                    Método de pago (Tukifac)
                  </label>
                  <input
                    id="tukifac_pay_method"
                    type="text"
                    value={tukifacPayMethodId}
                    onChange={(ev) => setTukifacPayMethodId(ev.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                    placeholder="01"
                  />
                </div>
                <div>
                  <label htmlFor="tukifac_pay_dest" className="block text-xs font-medium text-slate-600 mb-1">
                    Destino del pago
                  </label>
                  <input
                    id="tukifac_pay_dest"
                    type="text"
                    value={tukifacPayDest}
                    onChange={(ev) => setTukifacPayDest(ev.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                    placeholder="cash"
                  />
                </div>
                <div className="md:col-span-2">
                  <label htmlFor="tukifac_pay_ref" className="block text-xs font-medium text-slate-600 mb-1">
                    Referencia de pago (Tukifac)
                  </label>
                  <input
                    id="tukifac_pay_ref"
                    type="text"
                    value={tukifacPayRef}
                    onChange={(ev) => setTukifacPayRef(ev.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                    placeholder="Caja"
                  />
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="pt-2">
          <button
            type="submit"
            disabled={saving || uploading || !canUpsert}
            className="inline-flex items-center justify-center px-5 py-2.5 rounded-full bg-primary-600 text-white text-sm font-medium shadow-sm hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-primary-500 disabled:opacity-60"
          >
            <i className="fas fa-save mr-2 text-xs"></i>
            {saving ? 'Guardando...' : uploading ? 'Subiendo...' : isEdit ? 'Guardar cambios' : 'Registrar pago'}
          </button>
        </div>
      </form>
      )}
    </div>
  );
};

export default PaymentForm;
