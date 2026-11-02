import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import {
  fileSize,
  readRelative,
  relativeToProject,
  walkProject,
} from './support/scan.mjs';
import { projectRoot } from '../unit/support/catalog.mjs';

const files = walkProject();

function decodeJwtPayload(token) {
  const segment = token.split('.')[1];
  if (!segment) return null;
  try {
    return JSON.parse(Buffer.from(segment, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

describe('Secretos y configuración pública', () => {
  test('ningún archivo del proyecto contiene claves secretas reales', () => {
    const secretPattern = /sb_secret_[A-Za-z0-9_-]{20,}/g;
    const jwtPattern = /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g;
    const findings = [];

    for (const file of files) {
      const content = readFileSync(file, 'utf8');
      for (const match of content.matchAll(secretPattern)) {
        findings.push(`${relativeToProject(file)}: ${match[0].slice(0, 16)}…`);
      }
      for (const match of content.matchAll(jwtPattern)) {
        const payload = decodeJwtPayload(match[0]);
        if (payload && payload.role === 'service_role') {
          findings.push(`${relativeToProject(file)}: JWT con rol service_role`);
        }
      }
      if (fileSize(file) > 2 * 1024 * 1024) {
        findings.push(`${relativeToProject(file)}: archivo inesperadamente grande en el repositorio`);
      }
    }

    assert.deepEqual(findings, []);
  });

  test('la configuración local no se versiona y el ejemplo usa claves públicas', () => {
    const gitignore = readRelative('.gitignore');
    assert.match(gitignore, /^public\/js\/config\.js$/m);
    assert.match(gitignore, /^public\/js\/config\.local\.js$/m);
    assert.match(gitignore, /^\.env$/m);
    assert.match(gitignore, /^\.env\.\*$/m);

    const example = readRelative('public/js/config.example.js');
    assert.match(example, /sb_publishable_/);
    assert.match(example, /site key pública/i);
    assert.match(example, /NUNCA la service_role/i);
    assert.doesNotMatch(example, /sb_secret_[A-Za-z0-9_-]{10,}/);
  });

  test('el workflow de Pages solo consume secretos públicos', () => {
    const workflow = readRelative('.github/workflows/deploy.yml');
    assert.match(workflow, /secrets\.SUPABASE_URL/);
    assert.match(workflow, /secrets\.SUPABASE_PUBLISHABLE_KEY/);
    assert.match(workflow, /secrets\.TURNSTILE_SITE_KEY/);
    assert.doesNotMatch(workflow, /secrets\.[A-Z_]*SERVICE_ROLE/);
    assert.match(workflow, /if \(isSecretKey\(key\)\)/);
    assert.match(workflow, /La clave cargada es secreta/);
    assert.match(workflow, /mode: url && key \? 'supabase' : 'local'/);
  });

  test('las pruebas RLS usan variables exclusivas y no tocan la demo pública', () => {
    const source = readRelative('tests/security/rls.integration.test.mjs');
    assert.match(source, /SUPABASE_TEST_URL/);
    assert.match(source, /SUPABASE_TEST_ANON_KEY/);
    assert.match(source, /SUPABASE_TEST_SERVICE_ROLE_KEY/);
    assert.match(source, /SUPABASE_TEST_ALLOW_WRITES/);
    assert.doesNotMatch(source, /https:\/\/[a-z0-9]{20}\.supabase\.co/);
    assert.match(source, /process\.env\.SUPABASE_URL/);
    assert.match(source, /proyecto exclusivo de pruebas/i);
  });
});

describe('RLS declarado en las migraciones', () => {
  const schema = readRelative('supabase/migrations/20261031000100_schema.sql');
  const rls = readRelative('supabase/migrations/20261031000200_rls.sql');
  const storage = readRelative('supabase/migrations/20261031000300_storage.sql');
  const reset = readRelative('supabase/migrations/20261031000500_reset.sql');

  test('RLS está activo en products, product_images y audit_log', () => {
    for (const table of ['products', 'product_images', 'audit_log']) {
      assert.match(rls, new RegExp(`alter table public\\.${table} enable row level security`, 'i'));
    }
  });

  test('solo admin puede escribir productos y fotos', () => {
    for (const policy of [
      'products_admin_insert',
      'products_admin_update',
      'products_admin_delete',
      'product_images_admin_insert',
      'product_images_admin_update',
      'product_images_admin_delete',
    ]) {
      assert.match(rls, new RegExp(`create policy "${policy}"`, 'i'));
    }
    const adminChecks = rls.match(/public\.is_admin\(\)/g) || [];
    assert.ok(adminChecks.length >= 8, 'Faltan comprobaciones de is_admin() en las políticas');
    assert.match(rls, /audit_log_admin_read/);
  });

  test('la función is_admin lee el rol desde app_metadata', () => {
    assert.match(schema, /auth\.jwt\(\) -> 'app_metadata' ->> 'role'/);
    assert.match(schema, /security definer/i);
    assert.match(schema, /set search_path = public, auth/i);
  });

  test('Storage limita escrituras al admin y valida tamaño y MIME', () => {
    assert.match(storage, /file_size_limit/);
    assert.match(storage, /allowed_mime_types/);
    assert.match(storage, /array\['image\/webp', 'image\/jpeg', 'image\/png'\]/);
    assert.match(storage, /ferromax_images_public_read/);
    assert.match(storage, /public\.is_admin\(\)/);
    assert.doesNotMatch(storage, /for insert\s+to anon/i);
  });

  test('reset_demo_catalog exige admin y está revocado para anon', () => {
    assert.match(reset, /if not public\.is_admin\(\) then/);
    assert.match(reset, /revoke all on function public\.reset_demo_catalog\(\) from anon/i);
    assert.match(reset, /grant execute on function public\.reset_demo_catalog\(\) to authenticated/i);
  });
});

describe('Archivos base del sitio', () => {
  test('todas las páginas cargan theme.js antes que la hoja de estilos', () => {
    for (const page of ['index.html', 'categoria.html', 'cuenta.html', 'admin.html']) {
      const html = readRelative(join('public', page));
      const themeIndex = html.indexOf('<script src="js/theme.js"></script>');
      const styleIndex = html.indexOf('<link rel="stylesheet" href="css/styles.css">');
      assert.ok(themeIndex > 0, `${page} no carga theme.js`);
      assert.ok(styleIndex > themeIndex, `${page} carga styles.css antes de theme.js`);
      assert.match(html, /data-theme-toggle/);
      assert.match(html, /role="switch"/);
    }
  });

  test('los archivos JS no exponen la service_role ni evalúan datos externos', () => {
    for (const file of files.filter((entry) => /public[\\/]js[\\/].*\.js$/.test(entry))) {
      const content = readFileSync(file, 'utf8');
      assert.doesNotMatch(content, /\beval\s*\(/, `${relativeToProject(file)} usa eval()`);
      assert.doesNotMatch(
        content,
        /new Function\s*\(/,
        `${relativeToProject(file)} usa el constructor Function`
      );
      assert.doesNotMatch(content, /document\.write\s*\(/, `${relativeToProject(file)} usa document.write`);
    }
  });

  test('el servidor de pruebas no permite salir de public/', () => {
    const server = readRelative('scripts/serve-public.mjs');
    assert.match(server, /filePath !== root && !filePath\.startsWith\(root \+ sep\)/);
    assert.match(server, /send\(response, 403/);
    assert.match(server, /X-Content-Type-Options/);
  });
});
