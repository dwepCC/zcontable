Aprobado el análisis.

Vamos a implementar un sistema de Roles y Permisos usando un MODELO PROPIO EN BASE DE DATOS (NO Casbin por ahora).

IMPORTANTE:
El objetivo es construir una arquitectura sólida, escalable y preparada para que el sistema evolucione hacia un ERP modular completo.

NO quiero una implementación improvisada ni hardcodeada.
La implementación debe seguir buenas prácticas, clean architecture y minimizar deuda técnica.

Contexto del proyecto:
- Backend: Go
- Framework: Fiber
- ORM: GORM
- Base de datos: MySQL
- Frontend: React + TypeScript
- Sistema actual ya está funcionando y tiene autenticación JWT
- Existen roles legacy por string:
  - Administrador
  - Supervisor
  - Contador
  - Asistente

Actualmente existen validaciones distribuidas con:
- RequireRole(...)
- auth.getRole()
- comparaciones de strings de rol
- lógica repetida en Sidebar y múltiples vistas.

TODO esto debe migrarse gradualmente al nuevo sistema de permisos.

REGLA CRÍTICA:
NO romper funcionalidades existentes.
La migración debe ser incremental y compatible con el sistema actual mientras se completa.

==================================================
FASE 1 — ANÁLISIS DEL SISTEMA ACTUAL
==================================================

Antes de programar:

1. Analiza TODO el backend y frontend.

2. Genera un inventario completo de permisos inferidos del sistema actual.

Debes analizar:

BACKEND
- Todas las rutas protegidas
- Todos los RequireRole(...)
- Todos los middlewares
- Todos los endpoints sensibles
- CRUDs
- Acciones especiales

FRONTEND
- Sidebar
- Menús
- Botones
- Vistas protegidas
- auth.getRole()
- Condiciones basadas en role
- Acciones habilitadas/deshabilitadas

Genera una matriz inicial:

ROL × PERMISO

Ejemplo:

Administrador:
- users.view
- users.create
- users.update
- users.delete

Supervisor:
- sales.view
- sales.create

etc.

NO inventar permisos.
Inferirlos del sistema existente.

==================================================
FASE 2 — DISEÑO DE ARQUITECTURA
==================================================

Implementaremos MODELO PROPIO EN BASE DE DATOS.

Diseña las tablas definitivas.

Debe existir:

modules
permissions
roles
role_permissions
user_roles

Estructura requerida:

modules
- id
- code
- name
- icon
- sort_order
- active
- timestamps

permissions
- id
- module_id
- code (UNIQUE)
- action
- name
- description
- timestamps

roles
- id
- code
- name
- description
- is_system
- timestamps

role_permissions
- role_id
- permission_id

user_roles
- user_id
- role_id

IMPORTANTE:
No eliminar inmediatamente el campo role string legacy del usuario.
Debe mantenerse temporalmente para compatibilidad.

==================================================
FASE 3 — ESTÁNDAR DE PERMISOS
==================================================

Usar nomenclatura obligatoria:

module.action

Ejemplos:

users.view
users.create
users.update
users.delete

companies.view
companies.create
companies.update

sales.view
sales.create
sales.delete
sales.cancel
sales.export

inventory.view
inventory.adjust

payments.view
payments.create

settings.view
settings.roles
settings.users

reports.financial
reports.inventory

NO mezclar formatos.
TODO debe seguir la misma convención.

==================================================
FASE 4 — IMPLEMENTACIÓN BACKEND
==================================================

Crear un AuthorizationService centralizado.

Debe existir algo similar a:

HasPermission(userID, permissionCode)

o

Can(userID, permissionCode)

NO hacer validaciones dispersas.

NO usar strings hardcodeados de rol.

NO usar RequireRole nuevo.

Debe existir middleware reutilizable:

RequirePermission("users.create")

Ejemplo:

app.Post(
    "/users",
    Auth(),
    RequirePermission("users.create"),
    controller.CreateUser,
)

El middleware debe:

1. Obtener user_id del JWT
2. Resolver permisos del usuario
3. Verificar permiso
4. Responder 403 consistente

Formato de error:

{
  "success": false,
  "code": "INSUFFICIENT_PERMISSIONS",
  "message": "No tienes permisos para realizar esta acción"
}

==================================================
FASE 5 — PERFORMANCE
==================================================

MUY IMPORTANTE:

No consultar permisos a DB en cada request.

Implementar cache en memoria.

El sistema debe:

- cargar permisos del usuario
- cachearlos
- invalidarlos al modificar:
  - roles
  - role_permissions
  - user_roles

Evitar N+1 queries.

Optimizar joins GORM.

==================================================
FASE 6 — FRONTEND
==================================================

Implementar un sistema centralizado de permisos.

NO usar más:

auth.getRole()

NO comparar strings de roles.

Debe existir:

hasPermission(permission)

o hook:

usePermissions()

Ejemplo:

hasPermission("users.create")

o

can("users.create")

Implementar en TODO el sistema actual.

Debe actualizar:

1. Sidebar
- mostrar/ocultar módulos

2. Rutas protegidas

3. Botones:
- crear
- editar
- eliminar
- exportar
- aprobar
- anular

4. Formularios

5. Acciones especiales

TODO debe quedar alineado con backend.

Si backend niega permiso,
frontend también debe ocultar.

Pero backend SIEMPRE es la autoridad final.

==================================================
FASE 7 — COMPATIBILIDAD LEGACY
==================================================

Durante la migración:

El sistema debe seguir funcionando.

Si aún no existe permiso configurado,
usar fallback temporal basado en role string legacy.

Ejemplo:

Administrador → acceso total temporal

Esto solo mientras termina migración.

Marcar claramente qué partes son temporales.

==================================================
FASE 8 — UI DE ADMINISTRACIÓN
==================================================

Agregar dentro del módulo Usuarios:

1. Gestión de Roles
- listar
- crear
- editar
- eliminar

2. Gestión de permisos por rol

Pantalla tipo matriz:

Módulo:
Usuarios

☑ Ver
☑ Crear
☑ Editar
☑ Eliminar

Módulo:
Ventas

☑ Ver
☑ Crear
☑ Anular

Agrupar permisos por módulo.

UI limpia y profesional.

NO generar algo básico o improvisado.

==================================================
REGLA CRÍTICA DE IMPLEMENTACIÓN
==================================================

Antes de escribir código:

1. Mostrar plan exacto de implementación.
2. Mostrar migraciones.
3. Mostrar arquitectura propuesta.
4. Mostrar lista final de permisos inferidos.
5. Mostrar estrategia de compatibilidad.

NO empezar a modificar archivos hasta aprobación.

Una vez aprobado:
hacer cambios pequeños, seguros e incrementales.

Evitar romper funcionalidades existentes.
Priorizar estabilidad del sistema.