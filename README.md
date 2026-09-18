# Closet de Erimar — Sistema de fidelización con QR

Sistema de cupones de regalo por QR: cada clienta escanea la tarjeta que
recibe con su pedido, ve una animación de sobre elegante y descubre un
cupón de descuento (5%, 10% o 15%) que queda permanentemente ligado a su
tarjeta. Todo el descuento, el inventario y la vigencia se deciden en el
backend (Supabase/Postgres) — nunca en el navegador.

```
closet-erimar/
├── index.html              → página pública (experiencia del QR)
├── css/                    → estilos (tokens, animaciones, responsive)
├── js/                     → lógica del frontend público
├── admin/                  → panel administrativo (requiere login)
├── assets/                 → imágenes, íconos, sonidos
├── supabase/                → schema.sql + functions.sql + su propio README
└── README.md               → este archivo
```

---

## A. Crear el proyecto en Supabase

1. Entra a [supabase.com](https://supabase.com) y crea una cuenta o
   inicia sesión.
2. **New project** → elige un nombre (ej. `closet-erimar`), una
   contraseña de base de datos (guárdala aparte, no se usa en el
   frontend) y la región más cercana a Colombia.
3. Espera a que el proyecto termine de aprovisionarse (1–2 minutos).

## B. Ejecutar el SQL

1. En el menú lateral, ve a **SQL Editor → New query**.
2. Pega el contenido completo de `supabase/schema.sql` y presiona
   **Run**.
3. Repite con `supabase/functions.sql`.

(Ver `supabase/README.md` para el detalle de qué hace cada archivo.)

## C. Configurar la URL y la anon key en el frontend

1. En Supabase, ve a **Project Settings → API**.
2. Copia **Project URL** y **anon public key**.
3. Abre `js/config.js` y reemplaza:

   ```js
   SUPABASE_URL: "SUPABASE_URL",
   SUPABASE_ANON_KEY: "SUPABASE_ANON_KEY",
   ```

   por tus valores reales. La anon key es pública por diseño (está
   protegida por las políticas RLS y las funciones RPC), pero la
   **service_role key nunca debe copiarse aquí ni en ningún otro
   archivo del repositorio.**

## D. Crear la primera campaña

Opción rápida (SQL Editor):

```sql
select create_campaign(
  'Septiembre 2026',
  10,
  20,
  '[
    {"discount_percent": 5,  "total": 6},
    {"discount_percent": 10, "total": 3},
    {"discount_percent": 15, "total": 1}
  ]'::jsonb
);
```

O desde el panel `/admin` → pestaña **Campañas** → "Nueva campaña"
(una vez tengas tu usuario administrador, ver paso E).

## E. Crear al administrador y registrar a María

1. **Authentication → Users → Add user** en Supabase: crea tu cuenta de
   acceso al panel (correo + contraseña).
2. Copia su UUID y en el SQL Editor ejecuta:

   ```sql
   insert into admins (user_id) values ('<uuid-del-usuario>');
   ```

3. Abre `admin/index.html` (en local o ya desplegado), inicia sesión, y
   en la pestaña **Clientes** crea a "María" (nombre, WhatsApp opcional).

## F. Generar el QR de María

1. En el panel, pestaña **Crear QR**.
2. Selecciona a María y la campaña "Septiembre 2026".
3. Presiona **Generar QR**: verás el código QR y la URL que contiene
   (algo como `https://tu-dominio.com/?qr=9fA7kLm2...`).
4. Descarga el QR y colócalo en la tarjeta física.

El token nunca se vuelve a mostrar después de este paso — solo se
guarda su hash en la base de datos — así que descárgalo ahora.

## G. Probar el QR

1. Abre la URL generada (o escanea el QR con tu teléfono).
2. Verás la intro → el sobre animado → al tocarlo, la animación de
   apertura → el cupón de María.
3. Vuelve a abrir el mismo enlace: debe mostrar directamente "Hola
   nuevamente, María" con el mismo cupón, sin repetir la animación de
   regalo.

## H. Marcar un cupón como utilizado

En el panel, pestaña **Cupones** → "Validar cupón": escribe el código
(ej. `ERIMAR-X7K29`), revisa los datos y presiona **✓ Marcar como
utilizado**. También puedes hacerlo desde la tabla general de cupones
en la misma pestaña.

## I. Publicar el frontend en GitHub Pages

1. Crea un repositorio en GitHub y sube **todo el contenido de esta
   carpeta excepto `supabase/`** (puedes subir `supabase/` también si
   quieres tenerlo versionado — no contiene secretos, solo SQL — pero
   no es necesario para que la página funcione).
2. En el repositorio: **Settings → Pages → Build and deployment →
   Source: Deploy from a branch**, elige la rama `main` y la carpeta
   `/ (root)`.
3. Espera unos minutos: GitHub te dará una URL como
   `https://tu-usuario.github.io/closet-erimar/`.
4. Genera los QR desde `/admin` **después** de tener la URL final, para
   que apunten al dominio correcto (o regenera los que ya hiciste en
   local: basta con crear una nueva tarjeta para la misma clienta si
   necesitas cambiar el dominio, ya que el token no se puede migrar de
   un dominio a otro por sí solo — la URL completa se construye en el
   momento de generar el QR).

### Nunca subas al repositorio

- La `service_role key` de Supabase.
- Contraseñas de administrador.
- Datos reales de clientas (nombres, teléfonos) fuera de la base de
  datos.
- Tokens de QR en texto plano.

Si prefieres no tener siquiera la anon key en texto plano dentro del
repositorio público, usa **GitHub Actions** con un *secret* del
repositorio (`SUPABASE_URL`, `SUPABASE_ANON_KEY`) que genere
`js/config.js` en tiempo de build, en vez de subir el archivo ya
relleno. Esto es opcional: la anon key está diseñada para ser pública.

---

## Casos de prueba

| # | Escenario | Resultado esperado |
|---|---|---|
| 1 | María escanea su QR por primera vez | Se crea un único cupón |
| 2 | María vuelve a escanear el mismo QR | Aparece el mismo cupón, sin nueva animación de regalo |
| 3 | María intenta usar el QR de Angélica | Cada QR está atado a su propia tarjeta; el token de Angélica nunca revela el cupón de María ni viceversa |
| 4 | Dos personas abren QR simultáneamente | `reveal_coupon` bloquea la fila de la tarjeta y de la campaña (`for update`), así que no se duplica el inventario |
| 5 | Se entregan los 10 cupones | El cupón 11 es rechazado con `campaign_exhausted` |
| 6 | Cupón vencido | Se marca `expired` de forma perezosa y no puede usarse |
| 7 | Cupón utilizado | `mark_coupon_used` rechaza un cupón ya usado (`already_used`) |
| 8 | Alguien modifica `discount` desde DevTools | No tiene efecto: el descuento nunca viaja como variable editable, lo devuelve el backend en cada carga |
| 9 | Usuario abre la URL sin `?qr=` | Se muestra la pantalla "Esta sorpresa vive en tu tarjeta" |
| 10 | QR inexistente o inactivo | Se muestra "Esta tarjeta no es válida o ya no está activa." |

Para probar el caso 4 manualmente, abre la misma URL de QR en dos
pestañas o dispositivos al mismo tiempo justo después de generarla: en
ambas debe aparecer exactamente el mismo cupón, y el inventario en
`/admin` solo debe descontar una unidad.

## Sonidos (opcional)

Coloca tus archivos en:

```
assets/sounds/envelope-open.mp3
assets/sounds/success.mp3
```

Si no los agregas, la app sigue funcionando normalmente, en silencio
(el código detecta el fallo de reproducción y lo ignora).
