-- Auditoría dominio de deudas (Fase 1+2)
-- Ejecutar antes y después del backfill para comparar resúmenes.

SELECT '=== RESUMEN ===' AS section;

SELECT 'deu_liq_duplicados' AS metric, COUNT(*) AS cnt
FROM documents
WHERE deleted_at IS NULL AND number LIKE 'DEU-LIQ-%';

SELECT 'tax_settlement_id_faltante_en_liquidacion' AS metric, COUNT(*) AS cnt
FROM tax_settlement_lines tsl
JOIN documents d ON d.id = tsl.document_id AND d.deleted_at IS NULL
WHERE tsl.document_id IS NOT NULL
  AND (d.tax_settlement_id IS NULL OR d.tax_settlement_id <> tsl.tax_settlement_id);

SELECT 'documentos_huerfanos_liquidacion' AS metric, COUNT(*) AS cnt
FROM documents d
LEFT JOIN tax_settlements ts ON ts.id = d.tax_settlement_id AND ts.deleted_at IS NULL
WHERE d.deleted_at IS NULL
  AND d.tax_settlement_id IS NOT NULL
  AND ts.id IS NULL;

SELECT 'balance_negativo' AS metric, COUNT(*) AS cnt
FROM documents
WHERE deleted_at IS NULL AND balance_amount < -0.005;

SELECT 'balance_inconsistente' AS metric, COUNT(*) AS cnt
FROM documents d
WHERE d.deleted_at IS NULL AND d.status <> 'anulado'
  AND ABS(
    d.balance_amount - GREATEST(0, d.total_amount - COALESCE((
      SELECT SUM(pa.amount)
      FROM payment_allocations pa
      JOIN payments p ON p.id = pa.payment_id AND p.deleted_at IS NULL
      WHERE pa.document_id = d.id AND pa.deleted_at IS NULL
    ), 0) - COALESCE((
      SELECT SUM(p.amount)
      FROM payments p
      WHERE p.document_id = d.id AND p.deleted_at IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM payment_allocations pa
          WHERE pa.payment_id = p.id AND pa.deleted_at IS NULL
        )
    ), 0))
  ) > 0.02;

SELECT 'allocations_documento_inexistente' AS metric, COUNT(*) AS cnt
FROM payment_allocations pa
LEFT JOIN documents d ON d.id = pa.document_id AND d.deleted_at IS NULL
WHERE pa.deleted_at IS NULL AND d.id IS NULL;

SELECT 'pagos_inconsistentes_estado' AS metric, COUNT(*) AS cnt
FROM documents d
WHERE d.deleted_at IS NULL AND d.status <> 'anulado'
  AND (
    (d.balance_amount <= 0.005 AND d.status <> 'pagado')
    OR (d.balance_amount > 0.005 AND d.balance_amount + 0.005 >= d.total_amount AND d.status <> 'pendiente')
    OR (d.balance_amount > 0.005 AND d.balance_amount + 0.005 < d.total_amount AND d.status NOT IN ('parcial', 'pendiente'))
  );

SELECT '=== DETALLE DEU-LIQ (muestra) ===' AS section;

SELECT d.id, d.number, d.tax_settlement_id, d.total_amount, d.balance_amount, d.status, tsl.tax_settlement_id AS line_settlement_id
FROM documents d
LEFT JOIN tax_settlement_lines tsl ON tsl.document_id = d.id
WHERE d.deleted_at IS NULL AND d.number LIKE 'DEU-LIQ-%'
ORDER BY d.id DESC
LIMIT 50;
