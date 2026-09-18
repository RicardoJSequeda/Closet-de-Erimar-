# Supabase — Closet de Erimar

Este directorio contiene todo lo que se ejecuta en la base de datos.
Nada de esto se sube a GitHub Pages: vive solo en tu proyecto Supabase.

## Orden de ejecución

1. `schema.sql` — crea tablas, índices, restricciones y activa RLS.
2. `functions.sql` — crea todas las funciones RPC (la lógica de negocio).

Ambos se ejecutan desde **Supabase Dashboard → SQL Editor → New query**,
pegando el contenido completo de cada archivo y presionando "Run".
Ejecuta primero `schema.sql`, después `functions.sql`.

## Cómo funciona la seguridad

- Todas las tablas tienen **Row Level Security (RLS)** activado y **sin
  política pública de lectura/escritura**. Un usuario anónimo (la app
  pública) no puede hacer `select * from coupons` ni nada parecido:
  Postgres lo rechaza directamente.
- La única puerta de entrada pública es la función `reveal_coupon(token)`,
  que:
  - recibe el token en texto plano,
  - calcula su SHA-256 y busca ese hash (nunca se guarda el token real),
  - bloquea la fila de la tarjeta (`for update`) para que dos aperturas
    simultáneas del mismo QR no puedan crear dos cupones,
  - si ya existe un cupón para esa tarjeta, devuelve siempre ese mismo,
  - si no existe, descuenta un cupón real del inventario (con bloqueo de
    fila también) y lo crea.
- Las funciones administrativas (`create_qr_card`, `validate_coupon`,
  `mark_coupon_used`, `create_campaign`, `update_campaign_duration`,
  `update_terms`) comprueban `is_admin()` internamente. Esta función
  revisa si el `auth.uid()` de la sesión está en la tabla `admins`.
- La tabla `admins` la administras tú manualmente (ver paso E más abajo
  en el README raíz). No hay forma de auto-registrarse como admin desde
  el frontend.

## Cambiar la vigencia de los cupones sin tocar código

Usa la función `update_campaign_duration(campaign_id, dias)` desde el
panel `/admin` (pestaña Campañas), o directamente en el SQL Editor:

```sql
select update_campaign_duration('<id-de-la-campaña>', 30);
```

Esto solo afecta a los cupones que se emitan **después** del cambio; los
ya emitidos conservan su fecha de vencimiento original.

## Crear el primer usuario administrador

1. Ve a **Authentication → Users → Add user** en el Dashboard de
   Supabase y crea un usuario con correo y contraseña (este será el
   inicio de sesión del panel `/admin`).
2. Copia el UUID de ese usuario.
3. En el **SQL Editor**, ejecuta:

   ```sql
   insert into admins (user_id) values ('<uuid-del-usuario>');
   ```

Sin este paso, aunque el correo y la contraseña sean correctos, el
panel rechazará el acceso (la cuenta existe en Auth pero no está en la
lista blanca de `admins`).
