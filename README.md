# FerreDemo · demo de ferretería

Sitio de demostración con catálogo, fichas de producto, carrito, favoritos, cuentas y panel de administración. Funciona **100 % en el navegador**: no tiene servidor propio, base de datos ni servicios externos.

**Demo publicada:** <https://droweh.github.io/ferredemo/>

**Repositorio:** <https://github.com/Droweh/ferredemo>

La interfaz mantiene una estética industrial en naranja y carbón, con esquinas rectas, iconos SVG lineales y sin emojis. Las fichas combinan fotos grandes, precio, stock, código, descripción y productos relacionados.

> Cada navegador guarda su propia copia del catálogo, las cuentas y las fotos. Los cambios no se comparten entre dispositivos ni entre navegadores distintos.

Las fotos del catálogo son referencias de **DIT Ferretería** descargadas al proyecto y se usan solo para esta demo sin fines comerciales. No hay hotlinks ni afiliación con la marca.

## Puesta en marcha

Requiere Node.js 20 o superior.

```powershell
npm install
npm run serve
```

Abrí <http://127.0.0.1:4173>.

No abras `index.html` con doble clic: el navegador necesita un servidor HTTP para tratar los archivos como un sitio. También sirve la extensión Live Server de VS Code apuntando a `public`.

### Cuentas de demostración

| Rol | Email | Contraseña |
| --- | --- | --- |
| Administrador | `admin@ferredemo.com` | `Admin1234!` |
| Cliente | `cliente@ferredemo.com` | `Cliente1234!` |

El botón **Panel** aparece en el encabezado únicamente cuando la cuenta tiene rol admin.

## Qué incluye

- 9 categorías y 36 subcategorías con 32 productos y códigos `FD1001–FD1038`.
- Ficha de producto con galería ampliable, precio anterior, stock, código, descripción, características y relacionados.
- Búsqueda, orden por precio/nombre, estados vacíos y diseño responsive.
- Carrito y favoritos persistentes en el navegador.
- Slider automático cada 5 segundos, con pausa al pasar el mouse y respeto por `prefers-reduced-motion`.
- Registro e inicio de sesión sin verificación por correo.
- Panel solo para administradores:
  - Resumen de productos, publicados, stock agotado, fotos y papelera.
  - Edición de nombre, código, categoría, precio, precio anterior, stock, estado y descripción.
  - Hasta 5 fotos por producto, con portada, reordenamiento y borrado.
  - Publicar/ocultar productos.
  - Papelera con restaurar y eliminar definitivamente.
  - Historial de cambios.
  - Restauración completa de los 32 productos originales.
- Tema claro y oscuro: sigue al sistema por defecto y el switch guarda una preferencia manual.
- Suite de pruebas unitarias, de seguridad y E2E con Playwright en escritorio y móvil.
- Publicación automática en GitHub Pages, solo si las pruebas pasan.

## Dónde viven los datos

| Dato | Almacenamiento |
| --- | --- |
| Productos, cuentas, sesión e historial | `localStorage` |
| Fotos subidas desde el panel | IndexedDB (`ferredemo-demo-images`) |
| Tema elegido | `localStorage` (`ferredemo.theme.v1`) |

Las claves internas de la demo incluyen `ferredemo.demo.products.v1`, `ferredemo.demo.users.v1`, `ferredemo.demo.session.v1`, `ferredemo.demo.audit.v1` y `ferredemo.demo.version.v1`.

La primera vez que se abre esta versión, `public/js/legacy-data.js` migra automáticamente los datos guardados por versiones anteriores y elimina las claves viejas. Es el único archivo que conserva la marca anterior.

Para empezar de cero: **Panel > Restaurar demo** restaura el catálogo, o borrá los datos del sitio desde la configuración del navegador.

## Tema claro y oscuro

Sin preferencia guardada, el sitio sigue siempre al sistema operativo mediante `prefers-color-scheme` y no escribe `data-theme` en el documento. Al usar el switch, se guarda `light` o `dark` en `localStorage` con la clave `ferredemo.theme.v1`, se aplica `data-theme` en `<html>` y la elección se mantiene en las cinco páginas y entre recargas.

El switch es un control accesible con `role="switch"`, `aria-checked` y una etiqueta que cambia entre **Cambiar a modo oscuro** y **Cambiar a modo claro**.

La API `window.FerreDemoTheme` expone `current()`, `set(theme)`, `toggle()`, `clear()` y `subscribe(listener)`. Cada cambio emite el evento `ferredemo:themechange`. Para volver a seguir al sistema, ejecutá `window.FerreDemoTheme.clear()` desde la consola.

## Operación del panel

- **Publicar/ocultar:** el producto deja de verse en la tienda, pero conserva fotos y datos.
- **Papelera:** borrado lógico. Restaurar lo devuelve al catálogo con el estado anterior.
- **Eliminar definitivamente:** borra el producto y sus fotos. No se puede deshacer.
- **Restaurar demo:** deja los 32 productos originales, elimina fotos y vacía la papelera.
- **Historial:** muestra los últimos cambios, incluyendo productos, fotos y restauración.

Las fotos se comprimen en el navegador a WebP de hasta 1200 px antes de guardarse.

## Publicar en GitHub Pages

1. Creá un repositorio **público** y vacío en GitHub.
2. Subí la rama `main`:

```powershell
git remote add origin https://github.com/TU_USUARIO/TU_REPO.git
git push -u origin main
```

3. En GitHub: **Settings > Pages > Build and deployment > Source: GitHub Actions**.
4. El workflow `.github/workflows/deploy.yml` ejecuta las pruebas y publica `public/`.

URL esperada:

```text
https://USUARIO.github.io/NOMBRE_DEL_REPO/
```

Si alguna prueba falla, el sitio no se publica y el reporte de Playwright queda como artefacto del workflow.

## Pruebas

```powershell
npm ci
npm run test:install   # Chromium para CI o equipos sin Edge
npm run test:all
```

| Comando | Qué prueba |
| --- | --- |
| `npm run test:unit` | 9 categorías, 36 subcategorías, 32 productos, fotos locales y migración de datos viejos. |
| `npm run test:security` | Backend local, validación de fotos, sesión, archivos base y ausencia de configuración externa. |
| `npm run test:e2e` | Tienda, fichas, galería, cuentas, panel, fotos, tema, migración, XSS, accesibilidad y responsive. |

En Windows, Playwright ejecuta el Microsoft Edge instalado; en GitHub Actions usa el Chromium que descarga el workflow. Las pruebas de navegador bloquean cualquier pedido externo.

## Estructura del proyecto

```text
.
├─ public/
│  ├─ index.html
│  ├─ categoria.html
│  ├─ producto.html
│  ├─ cuenta.html
│  ├─ admin.html
│  ├─ css/
│  │  ├─ styles.css
│  │  ├─ auth.css
│  │  └─ admin.css
│  ├─ images/
│  │  └─ products/          (33 fotos locales de la demo)
│  └─ js/
│     ├─ legacy-data.js     (migración de datos viejos)
│     ├─ data.js
│     ├─ backend.js
│     ├─ app.js
│     ├─ auth.js
│     ├─ admin.js
│     └─ theme.js
├─ tests/
│  ├─ unit/
│  ├─ security/
│  └─ e2e/
├─ scripts/
│  └─ serve-public.mjs
├─ .github/workflows/
├─ package.json
├─ playwright.config.ts
└─ README.md
```

### Flujo de datos

- `public/js/data.js`: categorías, subcategorías y los 32 productos semilla con fotos locales.
- `public/js/backend.js`: backend local con `localStorage` + IndexedDB. Expone `getCatalog`, `getSession`, `signIn`, `signUp`, `signOut`, `updatePassword` y `admin.*`.
- `public/js/legacy-data.js`: copia las claves y las fotos de versiones anteriores antes de que arranque el backend.
- `public/js/app.js`: tienda, ficha de producto, galería, carrito y favoritos.
- `public/js/auth.js`: ingreso, registro y cambio de contraseña.
- `public/js/admin.js`: panel, fotos, papelera, historial y reset.
- `public/js/theme.js`: tema del sistema, preferencia manual, switch y API pública.

## Seguridad y alcance

Esta es una demo de interfaz, no un sistema real:

- No hay backend, cobros ni correos transaccionales.
- Las cuentas viven en el navegador. La contraseña se guarda con hash SHA-256 y sal, pero cualquier persona con acceso al navegador o a las herramientas de desarrollo puede leer o modificar los datos.
- El panel de administración es una restricción de la interfaz, no un control de seguridad.
- No uses datos personales, contraseñas reales ni información sensible.
- El checkout termina en un mensaje de demostración.

Los datos de contacto y las marcas son ficticios y se usan solo para mostrar el diseño. Las fotos son referencias de DIT Ferretería para una demo sin fines comerciales; no existe relación con esa empresa.

## Problemas frecuentes

**Los cambios no aparecen en otro dispositivo**

Es el comportamiento esperado: cada navegador tiene su propia copia local.

**Recargué y perdí los cambios**

Verificá que no estés en una ventana privada y que el navegador no esté borrando los datos del sitio al cerrar.

**No puedo subir una foto**

Cada archivo debe ser JPG, PNG o WebP, pesar como máximo 5 MB y no superar las 5 fotos por producto.

**El panel no aparece**

Iniciá sesión con `admin@ferredemo.com` o usá **Entrar como admin demo**.

**Quiero borrar todo y empezar de nuevo**

Usá **Panel > Restaurar demo** o borrá los datos del sitio desde el navegador.
