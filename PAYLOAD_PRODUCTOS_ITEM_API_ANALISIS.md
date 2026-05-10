# Productos en API externa: análisis (sin cambios de código)

Este documento resume **cómo el backend decide** si reutiliza un producto (`items` del tenant) o **crea uno nuevo**, para:

- `POST /api/documents` (facturas, boletas, notas crédito/débito)
- `POST /api/sale-note` (notas de venta)

La conclusión principal: **no es un “bug” aleatorio**; la lógica está acotada a unos pocos campos. Si el frontend envía valores que **no coinciden** con lo que el backend usa para buscar, **se creará un producto nuevo**.

---

## 1. Documentos electrónicos (`POST /api/documents`)

### 1.1 ¿Qué campo usa el backend para encontrar el producto?

En la validación API de documentos, cada línea pasa por `Functions::item()`. Esa función **solo** busca por la columna `internal_id` de la tabla `items`:

- Entrada API (JSON): **`codigo_interno`** en cada elemento de `items[]`.
- Tras el transform: se mapea a **`internal_id`** interno.
- Búsqueda: `Item::where('internal_id', $inputs['internal_id'])->first()`.
- Si **no** encuentra fila: **crea** un registro nuevo en `items` con los datos enviados en esa línea.

**No existe** en este flujo un campo tipo “si ya tengo el `item_id` numérico de mi BD, úsalo y no crees nada”: la resolución pasa exclusivamente por **`codigo_interno` → `internal_id`**.

### 1.2 Payload exacto para NO duplicar productos (producto ya existente)

Para cada ítem del array `items` debes enviar:

| Campo API (JSON) | Debe coincidir con |
|------------------|---------------------|
| **`codigo_interno`** | El valor **`internal_id`** del producto en la tabla `items` de ese tenant (misma cadena). |

Recomendaciones prácticas:

1. **Consultar antes** el producto en el tenant (por pantalla de ítems, exportación, o endpoint de listado que devuelva `internal_id` / SKU interno) y copiar **exactamente** ese valor en `codigo_interno`.
2. Cuidar **mayúsculas/minúsculas**, espacios y caracteres invisibles: la comparación es literal en SQL (`where internal_id = ...`), no hay “normalización” visible en esta función.
3. Si omites `codigo_interno`, el transform puede terminar con **`internal_id` vacío (`''`)**. Una búsqueda por cadena vacía puede no encontrar tu producto y disparar **creación** de un ítem con `internal_id` vacío (y repetir el problema en siguientes envíos).

### 1.3 Comportamiento si el producto ya existe

Si encuentra el ítem por `internal_id`, **por defecto** puede **actualizar la descripción** del maestro si envías `actualizar_descripcion: true` (comportamiento pensado para API). Si no quieres mutar el maestro, revisa en tu payload ese flag por línea.

### 1.4 “Producto manual” (como en la pantalla web)

En la interfaz web, el modo **producto manual** suele apoyarse en un **único artículo catálogo** (en el front aparece asociado al código de barras `VARIOUS_ITEM`): la descripción detallada va en la **línea del documento**, no se crea un producto nuevo por cada texto distinto.

Desde **API de documentos**, el backend **no** tiene un modo especial “manual”: cada línea sigue el mismo `Functions::item()`.

Para **no registrar un producto nuevo en cada venta manual**:

- Debes usar **siempre el mismo** `codigo_interno` que corresponda al **`internal_id`** del ítem “genérico” / varios que tenga tu tenant (equivalente al que usa la web con `VARIOUS_ITEM`; el **id numérico** del maestro es distinto en cada instalación).
- La descripción libre del servicio/producto manual va en **`descripcion`** de esa línea (y el PDF/XML pueden usar lógica distinta si el maestro es el ítem especial, como en `DocumentInput` para `VARIOUS_ITEM` en flujo web transformado).

Si envías un **`codigo_interno` nuevo en cada pedido** (por ejemplo generando un SKU aleatorio por línea), el backend **creará** un producto nuevo por cada envío: es coherente con el código actual, no es un fallo de deduplicación por descripción.

---

## 2. Nota de venta (`POST /api/sale-note`)

Aquí hay **dos comportamientos** según `force_create_if_not_exist`.

### 2.1 `force_create_if_not_exist: false` (típico si ya tienes catálogo)

En este modo, el bloque que “busca o crea” productos **no se ejecuta** en el `mergeData` de la API de nota de venta. Se espera que envíes líneas ya ligadas al catálogo.

Para **no crear productos**:

- En cada elemento de `items[]`, envía **`item_id`** con el **ID numérico** del registro en `items` (el mismo que usarías en la aplicación web al elegir un producto del listado).
- Incluye el objeto anidado **`item`** coherente con ese id (como en los ejemplos de `PAYLOADS_API_DOCUMENTS_Y_SALE_NOTE.md`).

Si envías datos como si fueran “manual” sin un `item_id` válido del tenant, el comportamiento no está pensado para deduplicar por texto: corres riesgo de errores o de rutas que acaben creando ítems en otros flujos.

### 2.2 `force_create_if_not_exist: true` (autocreación de cliente/producto)

Se ejecuta lógica extra por cada línea:

**A) Si la línea trae `full_item`**

- Se arma un array `$item_in` y se eliminan varios campos (`item_id`, `internal_id`, etc.).
- Se quitan claves con valor vacío.
- Búsqueda: `Item::where($item_in)->first()` (coincidencia **de todos** los campos restantes en conjunto).
- Si no hay coincidencia exacta: **`new Item(...)`** y `push()` → **producto nuevo**.

**B) Si la línea NO trae `full_item`**

- Búsqueda: `Item::where('internal_id', $item_in['internal_id'])->first()`.
- Si no existe: **`new Item($item_in)`** → **producto nuevo**.

Por tanto:

- Para **reutilizar** productos existentes con este flag, o bien el **`internal_id`** enviado debe ser **idéntico** al del maestro, o bien `full_item` debe coincidir **exactamente** con una fila (poco práctico si cambia cualquier campo).
- Para **ventas manuales** sin multiplicar maestros: la opción alineada con el diseño actual es reutilizar **un mismo `internal_id`** (producto “varios/manual” único en catálogo) o bien usar **`force_create_if_not_exist: false`** y **`item_id`** fijo del ítem manual predefinido en tu tenant.

---

## 3. ¿El error está en el backend o en el payload?

| Síntoma | Interpretación según el código |
|--------|--------------------------------|
| En **documentos**, cada envío crea productos nuevos | Casi siempre **`codigo_interno` no coincide** con `items.internal_id` (o está vacío / distinto al que creías). |
| En **nota de venta** con `force_create: true`, crece el catálogo | Normal si **`internal_id`** es distinto cada vez o **`full_item`** no iguala una fila existente. |
| En **nota de venta** con `force_create: false` | El backend **no** autocrea por `internal_id` en ese ramal; hay que mandar **`item_id`** correcto. |
| “Manual” como en la web | La web reutiliza un maestro (`VARIOUS_ITEM`); la API debe reutilizar el **mismo identificador** (`codigo_interno` / `internal_id` o `item_id`) que ese maestro en **tu** tenant. |

En conjunto: el comportamiento observado encaja con la implementación actual; la corrección más estable es **ajustar el payload** (y/o obtener del tenant los valores exactos de `internal_id` e `item_id` del ítem genérico).

---

## 4. Ejemplos mínimos de referencia (valores ilustrativos)

### 4.1 Documento: una línea reutilizando un producto existente

Sustituye `TU_INTERNAL_ID_EXACTO` por el valor real de la columna `internal_id` en `items` (no el id numérico autoincremental, salvo que en tu BD coincidan).

```json
{
  "items": [
    {
      "codigo_interno": "TU_INTERNAL_ID_EXACTO",
      "descripcion": "Texto que quieras en la línea",
      "unidad_de_medida": "NIU",
      "cantidad": 1,
      "valor_unitario": 100,
      "codigo_tipo_precio": "01",
      "precio_unitario": 118,
      "codigo_tipo_afectacion_igv": "10",
      "total_base_igv": 100,
      "porcentaje_igv": 18,
      "total_igv": 18,
      "total_impuestos": 18,
      "total_valor_item": 100,
      "total_item": 118,
      "codigo_tipo_item": "01",
      "codigo_producto_sunat": "10000000",
      "actualizar_descripcion": false
    }
  ]
}
```

*(El resto de campos de cabecera, totales, cliente y tipo de documento son los mismos que ya documenta `PAYLOADS_API_DOCUMENTS_Y_SALE_NOTE.md`.)*

### 4.2 Nota de venta: producto ya existente sin autocreación

```json
{
  "force_create_if_not_exist": false,
  "items": [
    {
      "id": null,
      "item_id": 456,
      "item": {
        "id": 456,
        "description": "NOMBRE EN CATÁLOGO",
        "unit_type_id": "NIU",
        "has_igv": true
      },
      "quantity": 1,
      "unit_value": 100,
      "affectation_igv_type_id": "10",
      "total_base_igv": 100,
      "percentage_igv": 18,
      "total_igv": 18,
      "total_taxes": 18,
      "price_type_id": "01",
      "unit_price": 118,
      "total_value": 100,
      "total": 118
    }
  ]
}
```

`456` debe ser el **id real** del ítem en tu base tenant.

### 4.3 Nota de venta: línea “manual” sin multiplicar productos (autocreación)

Usa **un solo** `internal_id` reservado para manual (creado una vez en catálogo o el que ya usa tu tenant para “varios”):

```json
{
  "force_create_if_not_exist": true,
  "items": [
    {
      "internal_id": "VARIOUS_ITEM",
      "description": "Servicio de instalación según cotización X",
      "unit_type_id": "ZZ",
      "unit_price": 50,
      "unit_value": 50,
      "quantity": 1,
      "affectation_igv_type_id": "10",
      "total_base_igv": 42.37,
      "percentage_igv": 18,
      "total_igv": 7.63,
      "total_taxes": 7.63,
      "total_value": 42.37,
      "total": 50,
      "price_type_id": "01",
      "item": {
        "description": "Servicio de instalación según cotización X",
        "unit_type_id": "ZZ",
        "has_igv": true
      }
    }
  ]
}
```

La primera vez puede crear el maestro `MANUAL_UNICO_TENANT`; las siguientes ventas con el **mismo** `internal_id` deben **encontrar** el mismo registro y no duplicar (salvo que cambies campos obligatorios del `new Item($item_in)` de forma que falle la primera búsqueda — en ese caso conviene fijar el maestro en UI y pasar solo `item_id` con `force_create: false`).

---

## 5. Referencias de código (lectura)

- Resolución de producto en API de documentos: `App\CoreFacturalo\Requests\Api\Validation\Functions::item()` (búsqueda por `internal_id` únicamente).
- Transformación de ítems del JSON API: `App\CoreFacturalo\Requests\Api\Transform\DocumentTransform::items()` (`codigo_interno` → `internal_id`).
- Nota de venta API, rama `force_create_if_not_exist`: `App\Http\Controllers\Tenant\Api\SaleNoteController::mergeData()` (bloque que usa `internal_id` / `full_item`).

---

*Documento generado para integración de frontend externo; no modifica el código de la aplicación.*
