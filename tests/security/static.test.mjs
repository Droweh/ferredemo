import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { readRelative, relativeToProject, walkProject } from './support/scan.mjs';
import { projectRoot } from '../unit/support/catalog.mjs';

const files = walkProject();
const pages = ['index.html', 'categoria.html', 'producto.html', 'cuenta.html', 'admin.html'];

describe('Demo 100 % local', () => {
  test('la marca anterior solo aparece en el archivo de compatibilidad', () => {
    const previousBrand = ['ferro', 'max'].join('');
    const pattern = new RegExp(previousBrand, 'i');
    const allowed = new Set(['public/js/legacy-data.js']);

    const findings = files
      .filter((file) => pattern.test(readFileSync(file, 'utf8')))
      .map(relativeToProject)
      .filter((file) => !allowed.has(file));

    assert.deepEqual(findings, []);
  });

  test('el sitio no carga scripts, estilos ni configuración externos', () => {
    for (const page of pages) {
      const html = readRelative(join('public', page));
      assert.doesNotMatch(html, /<script[^>]+src="https?:/i, `${page} carga un script externo`);
      assert.doesNotMatch(html, /<link[^>]+href="https?:/i, `${page} carga un estilo externo`);
      assert.doesNotMatch(html, /js\/config\.js|\/vendor\//, `${page} conserva configuración vieja`);
    }
  });

  test('no quedan dependencias ni artefactos de un backend externo', () => {
    const pkg = JSON.parse(readRelative('package.json'));
    assert.deepEqual(Object.keys(pkg.devDependencies).sort(), [
      '@axe-core/playwright',
      '@playwright/test',
    ]);
    assert.equal(existsSync(join(projectRoot, 'supabase')), false);
    assert.equal(files.some((file) => file.endsWith('.sql')), false);
  });

  test('el workflow de Pages prueba y publica sin secretos', () => {
    const workflow = readRelative('.github/workflows/deploy.yml');
    for (const step of [
      'npm run test:unit',
      'npm run test:security',
      'npm run test:e2e',
    ]) {
      assert.match(workflow, new RegExp(step.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    }
    assert.match(workflow, /path: public/);
    assert.doesNotMatch(workflow, /secrets\./);
    assert.doesNotMatch(workflow, /config\.js/);
  });

  test('la documentación describe solo la demo local', () => {
    const readme = readRelative('README.md');
    assert.doesNotMatch(readme, /supabase|turnstile|\brls\b|keep-?alive/i);
    assert.match(readme, /ferredemo/i);
  });

  test('los archivos del sitio no exponen credenciales ni configuración remota', () => {
    const publicFiles = files.filter((file) => relativeToProject(file).startsWith('public/'));
    const content = publicFiles.map((file) => readFileSync(file, 'utf8')).join('\n');
    assert.doesNotMatch(content, /sb_secret_|service_role|FERREDEMO_CONFIG/i);
  });
});

describe('Archivos base del sitio', () => {
  test('las páginas cargan la compatibilidad y el tema antes de la hoja de estilos', () => {
    for (const page of pages) {
      const html = readRelative(join('public', page));
      const legacyIndex = html.indexOf('<script src="js/legacy-data.js"></script>');
      const themeIndex = html.indexOf('<script src="js/theme.js"></script>');
      const styleIndex = html.indexOf('<link rel="stylesheet" href="css/styles.css">');
      assert.ok(legacyIndex > 0, `${page} no carga legacy-data.js`);
      assert.ok(themeIndex > legacyIndex, `${page} carga theme.js antes de la compatibilidad`);
      assert.ok(styleIndex > themeIndex, `${page} carga styles.css antes de theme.js`);
      assert.match(html, /data-theme-toggle/);
      assert.match(html, /role="switch"/);
    }
  });

  test('los archivos JS no evalúan datos externos', () => {
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
