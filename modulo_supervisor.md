# Prompt de Desarrollo: Implementación del Módulo de Supervisores Contables

## Contexto del Proyecto

Necesito agregar un nuevo módulo llamado **“Módulo de Supervisores Contables”** dentro de un proyecto ya existente.

### Stack actual del sistema

#### Backend
- Lenguaje: **Go**
- Framework: **Fiber**
- Arquitectura actual: mantener la arquitectura existente del proyecto.
- Base de datos: SQL (respetar la estructura actual del proyecto).
- Autenticación y autorización: **YA EXISTE IMPLEMENTACIÓN DE ROLES Y PERMISOS (RBAC)**.

#### Frontend
- Framework: **React**
- Estilos: **Tailwind CSS**
- UI/UX: **Mantener el diseño visual actual del sistema**.
- Debe respetar:
  - Layout existente
  - Sidebar
  - Navbar
  - Componentes reutilizables
  - Sistema de colores
  - Espaciados
  - Responsividad
  - Convenciones visuales ya implementadas

---

# Restricciones importantes

## 1. NO duplicar funcionalidades existentes

El sistema **ya tiene implementado el sistema de roles y permisos (RBAC)**.

Por lo tanto:

**NO debes crear:**
- tablas nuevas de roles
- tablas de permisos
- middleware de autorización nuevo
- lógica de autenticación
- lógica de login
- guardas duplicadas
- helpers redundantes

Debes **reutilizar completamente el sistema RBAC actual** y simplemente registrar los permisos necesarios del nuevo módulo usando la infraestructura existente.

Antes de implementar cualquier autorización:

1. Analiza cómo funciona actualmente el RBAC.
2. Reutiliza exactamente el mismo patrón.
3. Sigue la convención del proyecto.
4. No reinventes nada.

---

## 2. Principios de arquitectura obligatorios

Toda la implementación debe seguir:

### SOLID
Aplicar estrictamente:

#### S — Single Responsibility Principle
Cada servicio debe tener una única responsabilidad.

Ejemplo:
- `TaskService`
- `DeclarationService`
- `NPSService`
- `MonthlyControlService`

Evitar servicios gigantes.

---

#### O — Open/Closed Principle
El sistema debe ser extensible sin modificar demasiado código existente.

Usar:
- interfaces
- estrategias
- desacoplamiento

para permitir nuevos tipos de declaraciones o tareas futuras.

---

#### L — Liskov Substitution Principle
Las abstracciones deben poder sustituirse correctamente.

---

#### I — Interface Segregation Principle
Interfaces pequeñas y específicas.

NO crear interfaces enormes.

Ejemplo:

```go
type TaskRepository interface {
    Create()
    Update()
    FindByID()
}

No hacer interfaces monolíticas.

D — Dependency Inversion Principle

Usar inyección de dependencias.

Evitar:

db := database.DB

Preferir:

type TaskService struct {
    repo TaskRepository
}
3. Clean Architecture / Clean Code

La implementación debe ser mantenible y escalable.

Backend Structure

Seguir estructura desacoplada.

Ejemplo recomendado:

modules/
└── accounting-supervisor/
    ├── domain/
    │   ├── entities/
    │   ├── repositories/
    │   └── services/
    │
    ├── application/
    │   ├── usecases/
    │   ├── dto/
    │   └── validators/
    │
    ├── infrastructure/
    │   ├── persistence/
    │   ├── repositories/
    │   └── migrations/
    │
    ├── interfaces/
    │   ├── http/
    │   │   ├── handlers/
    │   │   ├── routes/
    │   │   └── middleware/
    │
    └── tests/

Si el proyecto ya usa otra estructura, adaptarse a la estructura actual sin romper consistencia.

4. Buenas prácticas obligatorias
Backend (Go + Fiber)

Implementar:

DTOs
Validators
Request validation
Response estándar
Repository pattern
Service layer
Transactions donde sea necesario
Manejo de errores consistente
Logs reutilizando el sistema actual
Soft delete si el proyecto ya lo usa
Pagination
Filtering
Sorting
Search
Relaciones optimizadas
Evitar N+1 queries
Context timeout
Queries optimizadas

Evitar:

lógica de negocio en handlers
SQL hardcodeado en handlers
funciones gigantes
archivos enormes
código duplicado
magic strings
magic numbers
5. Frontend (React + Tailwind)
MUY IMPORTANTE

NO romper el diseño actual del sistema.

Antes de crear vistas:

Analiza el diseño existente.
Reutiliza componentes actuales.
Mantén consistencia visual.
Usa exactamente el mismo sistema visual.

Debe respetar:

spacing
cards
tablas
modales
botones
badges
colores
tipografía
tamaños
dark mode (si existe)
responsive design
NO hacer

No crear diseños completamente nuevos.

No cambiar:

estilos globales
estructura del layout
sidebar
navbar
navegación
6. Reutilización de componentes

Antes de crear algo nuevo:

Buscar si ya existe:

Table component
Modal component
Confirm dialog
Pagination
Select
Form input
Badge
Toast
Loader
Empty state
Error state
Search bar
Filter component

Si existe → reutilizar.

7. Calidad de UI/UX

Las pantallas deben sentirse profesionales.

Agregar:

Loading states

Skeletons o loaders consistentes.

Empty states

Mensajes claros.

Error states

Errores amigables.

Confirmaciones

Antes de acciones destructivas.

Feedback visual

Toast/snackbar consistente.

Optimistic UI

Donde tenga sentido.

Debounce

Para búsquedas.

Lazy loading

Cuando aplique.

Virtualization

Si existen listas grandes.

Módulo a implementar
1. Dashboard Principal

Crear dashboard del supervisor contable.

Debe mostrar:

Total empresas activas
Empresas al día
Empresas pendientes
Empresas vencidas
Declaraciones observadas
NPS pendientes
Pagos pendientes
Cumplimiento mensual

Agregar:

Filtros
período
supervisor
responsable
estado
empresa
Gráficos

Si el proyecto ya usa librería de charts, reutilizarla.

Si no existe, usar una ligera.

Mostrar:

cumplimiento mensual
estados de empresas
tareas pendientes
productividad
2. Control mensual por empresa

CRUD completo.

Campos:

empresa
RUC
período
régimen tributario
responsable
supervisor
fecha vencimiento
estado general
riesgo
observaciones

Estados:

Al día
Pendiente
Observado
Vencido
Cerrado

Riesgo:

Bajo
Medio
Alto
Crítico
3. Gestión de declaraciones

Tipos:

601
621
SIRE
Renta anual

Estados:

Pendiente
En elaboración
En revisión
Observado
Aprobado
Presentado
Cerrado

Características:

cambio de estado
historial
observaciones
responsable
supervisor aprobador
adjuntos
4. Liquidación de impuestos

Campos:

IGV
renta mensual
otros tributos
total pagar
fecha cálculo
responsable
supervisor aprobador
estado validación

El total debe calcularse automáticamente.

5. Generación de NPS

Campos:

empresa
período
tributo
importe
código NPS
fecha generación
fecha límite pago
estado pago

Estados:

pendiente_generar
generado
enviado_cliente
pendiente_pago
pagado
vencido
6. Flujo del sistema

Implementar este flujo:

Crear período mensual.
Asignar empresa.
Registrar recepción de información.
Crear tareas automáticas:
601
621
SIRE
liquidación
Analista actualiza avance.
Supervisor revisa.
Supervisor aprueba u observa.
Generar NPS.
Registrar pago.
Cerrar período.
7. Base de datos sugerida

Crear únicamente las tablas que realmente sean necesarias y compatibles con el sistema actual.

Posibles entidades:

periodos_contables
tareas_contables
declaraciones
liquidaciones_impuestos
nps_pagos
observaciones
archivos_adjuntos
historial_cambios
notificaciones

NO crear tablas innecesarias.

Primero revisar si ya existen tablas reutilizables.

8. Permisos del módulo

Usar el RBAC existente.

Crear únicamente permisos nuevos.

Ejemplo:

accounting.dashboard.view
accounting.tasks.assign
accounting.tasks.update
accounting.tasks.approve
accounting.tasks.observe
accounting.period.close
accounting.reports.view
accounting.nps.generate

NO duplicar sistema de permisos.

9. Reportes

Implementar:

cuadro mensual
empresas vencidas
declaraciones pendientes
NPS pendientes
pagos pendientes
productividad analista
historial observaciones
cumplimiento empresa

Exportables:

Excel
PDF

Si el proyecto ya tiene exportador:
→ reutilizar.

10. Automatizaciones

Implementar jobs o scheduler reutilizando el mecanismo actual del proyecto.

Automatizar:

creación mensual tareas
alertas vencimiento
tareas observadas
bloqueo cierre incompleto
NPS listo
escalar vencidas supervisor
11. Seguridad

Validar:

permisos por endpoint
ownership
acceso por rol
validaciones backend
sanitización
rate limit si existe

Nunca confiar en frontend.

12. Testing

Agregar pruebas donde el proyecto ya las tenga.

Mínimo:

services
repositories
casos críticos
validaciones
13. Resultado esperado

Al finalizar:

El módulo debe quedar completamente integrado al sistema actual.
Debe verse visualmente igual al resto del sistema.
Debe respetar arquitectura existente.
No debe duplicar RBAC.
Debe ser escalable.
Código limpio y mantenible.
Bajo principios SOLID.
Producción-ready.
Optimizado en performance.
Sin romper funcionalidades existentes.

Antes de programar, primero analiza la arquitectura actual del proyecto y genera un plan técnico de implementación detallado indicando qué se reutilizará y qué se agregará.