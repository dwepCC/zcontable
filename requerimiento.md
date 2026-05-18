Modelo para Desarrollo: Módulo de Supervisores Contables
1. Nombre del módulo
Módulo de Supervisores Contables
2. Objetivo
Permitir que el supervisor controle en tiempo real las tareas contables de cada
empresa, incluyendo declaraciones, liquidación de impuestos, generación de
NPS, pagos y cierre mensual.
3. Roles del sistema
• Gerencia
• Supervisor contable
• Analista contable
• Asistente contable
• Cliente opcional
4. Funcionalidades principales
Dashboard principal
Debe mostrar:
• Total de empresas activas
• Empresas al día
• Empresas pendientes
• Empresas vencidas
• Declaraciones observadas
• NPS pendientes de pago
• Pagos pendientes
• Cumplimiento mensual
Control mensual por empresa
Campos:
• Empresa
• RUC
• Período
• Régimen tributario
• Responsable
• Supervisor
• Fecha de vencimiento
• Estado general
• Riesgo
• Observaciones
Gestión de declaraciones
Tipos:
• Declaración 601
• Declaración 621
• SIRE
• Renta anual
Estados:
• Pendiente
• En elaboración
• En revisión
• Observado
• Aprobado
• Presentado
• Cerrado
Liquidación de impuestos
Campos:
• IGV
• Renta mensual
• Otros tributos
• Total a pagar
• Fecha de cálculo
• Responsable
• Supervisor aprobador
• Estado de validación
Generación de NPS
Campos:
• Empresa
• Período
• Tributo
• Importe
• Código NPS
• Fecha de generación
• Fecha límite de pago
• Estado de pago
Estados:
• Pendiente de generar
• Generado
• Enviado al cliente
• Pendiente de pago
• Pagado
• Vencido
5. Flujo del sistema
1. Crear período mensual.
2. Asignar empresa a responsable.
3. Registrar recepción de información.
4. Crear tareas automáticas: 601, 621, SIRE, liquidación.
5. Analista actualiza avance.
6. Supervisor revisa.
7. Supervisor aprueba u observa.
8. Se genera NPS.
9. Se registra pago.
10. Se cierra el período.
6. Tablas sugeridas para base de datos SQL
usuarios
empresas
periodos_contables
tareas_contables
declaraciones
liquidaciones_impuestos
nps_pagos
observaciones
archivos_adjuntos
historial_cambios
notificaciones
7. Entidad principal: tareas_contables SQL
id
empresa_id
periodo_id
tipo_tarea
responsable_id
supervisor_id
estado
prioridad
porcentaje_avance
fecha_inicio
fecha_vencimiento
fecha_revision
fecha_cierre
observaciones
created_at
updated_at
8. Permisos básicos
Acción Gerencia Supervisor Analista
Ver dashboard Sí Sí Limitado
Acción Gerencia Supervisor Analista
Asignar tareas Sí Sí No
Actualizar avance No Sí Sí
Aprobar tareas Sí Sí No
Observar tareas Sí Sí No
Cerrar período Sí Sí No
Ver reportes Sí Sí Limitado
9. Reportes
• Cuadro general mensual
• Empresas vencidas
• Declaraciones pendientes
• NPS pendientes
• Pagos pendientes
• Productividad por analista
• Historial de observaciones
• Cumplimiento mensual por empresa
10. Automatizaciones
• Crear tareas mensuales automáticamente.
• Alertar antes del vencimiento.
• Notificar tareas observadas.
• Bloquear cierre si falta 601, 621, SIRE o liquidación.
• Notificar cuando el NPS esté listo.
• Escalar tareas vencidas al supervisor.