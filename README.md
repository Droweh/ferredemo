# FerroMax · demo de ferretería

Sitio de demostración con catálogo, carrito, favoritos, cuentas y panel de administración. Está pensado para publicarse gratis con **GitHub Pages + Supabase Free + Cloudflare Turnstile**, sin servidor propio ni dominio.

La interfaz mantiene una estética industrial en naranja y carbón, con esquinas rectas, iconos SVG lineales y sin emojis.

**Demo publicada:** <https://droweh.github.io/ferromax-demo/>  
**Repositorio:** <https://github.com/Droweh/ferromax-demo>

La versión publicada funciona en modo local: los datos y las fotos se guardan en el navegador. Para activar cuentas y catálogo compartidos, configurá Supabase como se explica más abajo.

## Puesta en marcha rápida

1. Creá un proyecto **Supabase Free** y anotá la **Project URL** y la **publishable key**.
2. En el **SQL Editor**, ejecutá las 5 migraciones de `supabase/migrations/` en orden.
3. Desactivá **Confirm email** en Authentication > Providers > Email.
4. Creá el usuario administrador y asignale `{"role":"admin"}` en `raw_app_meta_data` (ver [Crear la cuenta administradora](#5-crear-la-cuenta-administradora)).
5. Configurá **Turnstile** con el dominio de GitHub Pages (opcional, recomendado).
6. Creá un repositorio **público** en GitHub y subí este proyecto a `main`.
7. Cargá `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` y `TURNSTILE_SITE_KEY` en **Settings > Secrets and variables > Actions**.
8. En **Settings > Pages**, elegí **Source: GitHub Actions**. El workflow publica `public/`.
9. Abrí `https://TU_USUARIO.github.io/TU_REPO/`.

También podés ejecutar `configurar.bat` para generar la configuración local y, si tenés GitHub CLI, cargar los secretos y disparar el deploy automáticamente.

## Qué incluye

- 9 categorías y 36 subcategorías con 32 productos.
- Búsqueda, orden por precio/nombre, estados vacíos y diseño responsive.
- Carrito y favoritos persistentes en el navegador.
- Slider automático cada 5 segundos, con pausa al pasar el mouse y respeto por `prefers-reduced-motion`.
- Registro e inicio de sesión sin verificación por correo.
- Turnstile en el acceso cuando Supabase lo exige.
- Panel solo para administradores:
  - Resumen de productos, publicados, stock agotado, fotos y papelera.
  - Edición de nombre, código, categoría, precio, precio anterior, stock, estado y descripción.
  - Hasta 5 fotos por producto, con portada, reordenamiento y borrado.
  - Publicar/ocultar productos.
  - Papelera con restaurar y eliminar definitivamente.
  - Historial de cambios.
  - Restauración completa de los 32 productos originales.
- Tema claro y oscuro: sigue al sistema por defecto y el switch guarda una preferencia manual.
- Suite de pruebas: unitarias, seguridad, RLS de integración y E2E con Playwright en escritorio y móvil.
- Modo local de respaldo: todo funciona sin Supabase usando `localStorage` + IndexedDB.
- Publicación automática en GitHub Pages y keep-alive para Supabase Free.

## Modos de datos

El modo se elige en `public/js/config.js` o con `configurar.bat`.

| Modo | Datos | Cuentas | Fotos |
| --- | --- | --- | --- |
| `local` | `localStorage` de este navegador | Locales, con hash SHA-256 | IndexedDB |
| `supabase` | Postgres + RLS | Supabase Auth | Storage público |

El modo local sirve para probar la demo completa sin crear ningún servicio. Los cambios no se comparten entre navegadores ni se publican.

Si el sitio se despliega sin los secretos de Supabase, GitHub Pages publica automáticamente el modo local.

## Probar en local

No abras `index.html` con doble clic. Usá un servidor HTTP para que el navegador trate los archivos como un sitio:

```powershell
py -m http.server 8080 --directory public
```

Abrí `http://localhost:8080`.

También sirve la extensión Live Server de VS Code apuntando a `public`.

### Credenciales del modo local

| Rol | Email | Contraseña |
| --- | --- | --- |
| Administrador | `admin@ferromax.com` | `Admin1234!` |
| Cliente | `cliente@ferromax.com` | `Cliente1234!` |

> Esas cuentas existen solo en el modo local. En Supabase hay que crear los usuarios desde Authentication > Users; las migraciones no los crean.

El botón **Panel** aparece en el encabezado únicamente cuando la cuenta tiene rol admin. El acceso real está protegido por RLS en Supabase.

### Configurador automático

En Windows, ejecutá `configurar.bat` desde la raíz del proyecto. Pide:

1. Modo Supabase o demo local.
2. Project URL de Supabase.
3. Publishable key o anon public key. El script rechaza `service_role` y `sb_secret_`.
4. Site key pública de Turnstile (opcional, recomendada).

Genera `public/js/config.js` con UTF-8, sin tocar el resto del proyecto. Si Git y GitHub CLI están instalados, también puede cargar los secretos del repositorio y disparar el deploy.

GitHub CLI es opcional. Si no lo tenés, instalalo desde [cli.github.com](https://cli.github.com/) o cargá los secretos a mano en GitHub.

> La `service_role` nunca debe llegar al navegador ni al repositorio. La publishable key y la site key son datos públicos.

## Tema claro y oscuro

Sin preferencia guardada, el sitio sigue siempre al sistema operativo mediante `prefers-color-scheme` y no escribe `data-theme` en el documento. Al usar el switch, se guarda `light` o `dark` en `localStorage` con la clave `ferromax.theme.v1`, se aplica `data-theme` en `<html>` y la elección se mantiene en las cuatro páginas y entre recargas.

El switch es un control accesible con `role="switch"`, `aria-checked` y una etiqueta que cambia entre **Cambiar a modo oscuro** y **Cambiar a modo claro**.

La API `window.FerroMaxTheme` expone `current()`, `set(theme)`, `toggle()`, `clear()` y `subscribe(listener)`. Cada cambio emite el evento `ferromax:themechange`. Para volver a seguir al sistema, ejecutá `window.FerroMaxTheme.clear()` desde la consola.

## Configurar Supabase Free

### 1. Crear el proyecto

1. Entrá a [supabase.com](https://supabase.com) y creá un proyecto Free.
2. Anotá la **Project URL** y la **publishable key** (o la anon public key) desde *Project Settings > API*.
3. No pongas la `service_role` en el frontend.

### 2. Aplicar las migraciones

En el **SQL Editor** de Supabase, ejecutá los archivos en este orden:

1. `supabase/migrations/20261031000100_schema.sql`
2. `supabase/migrations/20261031000200_rls.sql`
3. `supabase/migrations/20261031000300_storage.sql`
4. `supabase/migrations/20261031000400_seed.sql`
5. `supabase/migrations/20261031000500_reset.sql`

El archivo de seed carga los 32 productos con los IDs originales y configura la secuencia para productos nuevos.

También podés usar la CLI de Supabase si ya está instalada:

```powershell
supabase link --project-ref TU_PROJECT_REF
supabase db push
```

### 3. Desactivar la confirmación por email

En **Authentication > Providers > Email** (o la sección equivalente de tu proyecto), desactivá **Confirm email**.

La demo no usa SMTP, Resend ni Brevo. Si la confirmación queda activa, el registro devuelve un error explicativo y no crea una sesión inmediata.

Recomendado:

- Mantener la contraseña mínima en 8 caracteres.
- No configurar recuperación por correo en esta demo.
- La contraseña se puede cambiar desde **Mi cuenta** con la sesión iniciada.

### 4. Configurar Turnstile

1. En el dashboard de Cloudflare, creá un widget de Turnstile.
2. Agregá el dominio de GitHub Pages, por ejemplo `usuario.github.io`.
3. Si vas a probar Supabase en local con CAPTCHA activo, agregá también `localhost` al widget. Si no, desactivá CAPTCHA temporalmente.
4. Copiá la **site key** al configurador, al secreto `TURNSTILE_SITE_KEY` o a `public/js/config.js`.
5. Copiá la **secret key** en Supabase: **Authentication > Attack Protection > CAPTCHA protection**, proveedor Turnstile.
6. Activá la protección CAPTCHA para registro e inicio de sesión.

La secret key de Turnstile se queda en Supabase. Solo la site key llega al navegador.

### 5. Crear la cuenta administradora

1. En **Authentication > Users**, agregá un usuario con email y contraseña y confirmalo.
2. Copiá su email y ejecutá en el SQL Editor:

```sql
update auth.users
set raw_app_meta_data =
  coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role":"admin"}'::jsonb
where email = 'admin@tudominio.com';
```

3. Cerrá y volvé a iniciar sesión. El rol se lee desde `app_metadata`; una sesión vieja puede seguir teniendo el rol anterior.
4. Verificá que el botón **Panel** aparezca al iniciar sesión.

> No reutilices la contraseña de la demo local para el administrador de Supabase. Elegí una contraseña única y fuerte: el sitio publicado es público.

El rol `admin` es el único que puede cambiar productos o ver el historial. Las políticas RLS son la seguridad real; el botón es solo la parte visible.

### 6. Bucket de fotos

La migración de Storage crea el bucket público `product-images` y sus políticas. Si el SQL Editor no permite crear políticas de Storage, creá el bucket a mano:

- Nombre: `product-images`
- Público: sí
- Límite: 5 MB
- MIME: `image/webp`, `image/jpeg`, `image/png`

Las fotos se comprimen en el navegador a WebP de hasta 1200 px antes de subirse.

## Publicar en GitHub Pages

### Subir el proyecto

1. Creá un repositorio **público** y vacío en GitHub (sin README, sin `.gitignore`, sin licencia).
2. Desde la raíz de este proyecto, conectá el remoto y subí la rama `main`:

```powershell
git remote add origin https://github.com/TU_USUARIO/TU_REPO.git
git push -u origin main
```

Si `origin` ya existe, usá `git remote set-url origin https://github.com/TU_USUARIO/TU_REPO.git`. Si Git Credential Manager lo pide, iniciá sesión con tu cuenta de GitHub.

### Opción A: configurador

1. Subí el proyecto a un repositorio **público** de GitHub.
2. Ejecutá `configurar.bat` y elegí Supabase.
3. Dejá que cargue los secretos con `gh` al final del asistente.
4. En GitHub: **Settings > Pages > Build and deployment > Source: GitHub Actions**.
5. Hacé push a `main`. El workflow `.github/workflows/deploy.yml` publica `public/`.

### Opción B: manual

1. Creá un repositorio público.
2. Configurá **Settings > Pages > Source: GitHub Actions**.
3. Cargá en **Settings > Secrets and variables > Actions**:
   - `SUPABASE_URL`
   - `SUPABASE_PUBLISHABLE_KEY` (o tu anon public key)
   - `TURNSTILE_SITE_KEY` (opcional)
4. Hacé push a `main`.

El workflow ejecuta las pruebas y, solo si pasan, genera `public/js/config.js` con los secretos y publica la carpeta `public`. El archivo local `public/js/config.js` está en `.gitignore`, así que las claves no se versionan.

URL esperada:

```text
https://USUARIO.github.io/NOMBRE_DEL_REPO/
```

Si el sitio aparece en modo local, revisá que los secretos existan y que el último deploy se haya ejecutado después de cargarlos.

## Pruebas

La suite usa Node 20 o superior y Playwright. En Windows, Playwright ejecuta el Microsoft Edge instalado; en GitHub Actions usa el Chromium que descarga el workflow.

```powershell
npm ci
npm run test:install   # Chromium para CI o equipos sin Edge
npm run test:all
```

| Comando | Qué prueba |
| --- | --- |
| `npm run test:unit` | 9 categorías, 36 subcategorías, 32 productos y paridad entre `data.js` y el seed SQL. |
| `npm run test:security` | Validación de fotos, detección de claves secretas, sesión local, RLS declarado y configuración pública. |
| `npm run test:e2e` | Tienda, cuentas, panel, fotos, tema, XSS, accesibilidad y responsive en escritorio y móvil. |
| `npm run test:security:rls` | Integración real contra un proyecto Supabase exclusivo de pruebas. |

Las pruebas de navegador siempre fuerzan el modo local e interceptan `js/config.js`; además bloquean pedidos externos. Así nunca escriben en la demo pública ni necesitan credenciales de Supabase.

En GitHub Actions, el job **Pruebas** corre unitarias, seguridad y E2E antes de **Desplegar**. Si alguna falla, no se publica y el reporte de Playwright queda como artefacto.

### Pruebas RLS contra un proyecto de pruebas

Las pruebas de integración RLS y Storage necesitan un proyecto Supabase **exclusivo de pruebas**, con las migraciones aplicadas. No uses el proyecto de la demo pública.

```powershell
$env:SUPABASE_TEST_URL = 'https://tu-proyecto-de-pruebas.supabase.co'
$env:SUPABASE_TEST_ANON_KEY = 'tu-anon-key-de-pruebas'
$env:SUPABASE_TEST_SERVICE_ROLE_KEY = 'tu-service-role-de-pruebas'
$env:SUPABASE_TEST_ALLOW_WRITES = 'true'
npm run test:security:rls
```

- `SUPABASE_TEST_SERVICE_ROLE_KEY` se usa solo dentro del runner para preparar y limpiar datos; no se escribe en archivos ni llega al navegador.
- `SUPABASE_TEST_ALLOW_WRITES=true` es obligatorio para las pruebas que crean datos.
- La suite se niega a correr si `SUPABASE_TEST_URL` coincide con `SUPABASE_URL`.
- Sin esas variables, la suite se marca como omitida con el motivo visible y el resto de las pruebas sigue pasando.

## Mantener Supabase activo

Supabase Free pausa un proyecto tras 7 días sin actividad. El workflow `.github/workflows/keepalive.yml` consulta la API cada 3 días.

- Se puede ejecutar manualmente desde **Actions > Mantener Supabase activo > Run workflow**.
- Los secretos tienen que estar cargados.
- GitHub puede desactivar workflows programados después de 60 días sin actividad en el repositorio. En ese caso, volvé a habilitarlo o corré el workflow a mano antes de una demo.

## Estructura del proyecto

```text
.
├─ public/
│  ├─ index.html
│  ├─ categoria.html
│  ├─ cuenta.html
│  ├─ admin.html
│  ├─ css/
│  │  ├─ styles.css
│  │  ├─ auth.css
│  │  └─ admin.css
│  └─ js/
│     ├─ config.js          (generado, ignorado por Git)
│     ├─ config.example.js
│     ├─ data.js
│     ├─ backend.js
│     ├─ app.js
│     ├─ auth.js
│     ├─ admin.js
│     ├─ theme.js
│     └─ vendor/supabase.js
├─ supabase/migrations/
├─ tests/
│  ├─ unit/
│  ├─ security/
│  └─ e2e/
├─ scripts/
│  ├─ configurar.ps1
│  └─ serve-public.mjs
├─ .github/workflows/
├─ configurar.bat
├─ package.json
├─ playwright.config.ts
└─ README.md
```

### Flujo de datos

- `public/js/data.js`: categorías, subcategorías y los 32 productos semilla.
- `public/js/backend.js`: adaptador común para modo local y Supabase. Expone `getCatalog`, `getSession`, `signIn`, `signUp`, `signOut`, `updatePassword` y `admin.*`.
- `public/js/app.js`: tienda, carrito y favoritos.
- `public/js/auth.js`: ingreso, registro, Turnstile y cambio de contraseña.
- `public/js/admin.js`: panel, fotos, papelera, historial y reset.
- `public/js/theme.js`: tema del sistema, preferencia manual, switch y API pública.
- `tests/`: suites unitarias, de seguridad, RLS de integración y E2E con Playwright.

## Seguridad

- RLS activo en `products`, `product_images` y `audit_log`.
- Los visitantes anónimos solo leen productos publicados y no eliminados.
- Solo `is_admin()` puede insertar, actualizar o borrar productos.
- El admin se detecta con `auth.jwt() -> 'app_metadata' ->> 'role'`.
- Las claves publicables no dan permisos por sí solas; las políticas RLS sí importan.
- Los triggers de auditoría corren con `SECURITY DEFINER` y guardan `before`/`after`.
- `reset_demo_catalog()` verifica el rol admin antes de borrar y recargar.
- `public/js/config.js` y los secretos de GitHub no se versionan.
- La demo no procesa pagos reales ni envía correos.

## Operación del panel

- **Publicar/ocultar:** el producto deja de verse en la tienda, pero conserva fotos y datos.
- **Papelera:** borrado lógico. Restaurar lo devuelve al catálogo con el estado anterior.
- **Eliminar definitivamente:** borra el producto y sus fotos. No se puede deshacer.
- **Restaurar demo:** deja los 32 productos originales, elimina fotos y vacía la papelera. En Supabase también deja un registro `RESET_DEMO` en el historial.
- **Historial:** muestra los últimos cambios, incluyendo productos, fotos y restauración.

## Problemas frecuentes

**“La confirmación por email está activa...”**
Desactivá **Confirm email** en Supabase y volvé a probar el registro.

**“No tenés permisos para hacer esta operación” o errores RLS**
Aplicá las migraciones, asigná `{"role":"admin"}` en `raw_app_meta_data` y cerrá/volvé a iniciar sesión.

**Supabase aparece pausado**
Entrá al dashboard y restaurá el proyecto. Después ejecutá el workflow de keep-alive.

**Las fotos no suben**
Revisá que exista el bucket público `product-images`, que las políticas de Storage estén aplicadas y que la clave configurada sea la publishable/anon (no la secreta).

**El deploy quedó en modo local**
Faltan `SUPABASE_URL` o `SUPABASE_PUBLISHABLE_KEY`, o el deploy se ejecutó antes de cargarlos. Volvé a correr el workflow.

**El registro falla solo en el sitio publicado**
Agregá el dominio de GitHub Pages al widget de Turnstile y verificá que la secret key esté cargada en Supabase.

**Cambié el rol del admin y el botón Panel no aparece**
Cerrá sesión y volvé a entrar. El JWT anterior conserva los roles viejos.

## Alcance de la demo

Es una demo funcional sin backend propio, sin cobros y sin emails transaccionales. El checkout termina en un mensaje de demostración. La recuperación de contraseña por correo no está incluida a propósito para que todo el flujo funcione con Supabase Free y sin SMTP.

Los datos de contacto y las marcas son ficticios y se usan solo para mostrar el diseño.
