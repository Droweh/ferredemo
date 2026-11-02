import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { loadCatalogData, projectRoot } from '../unit/support/catalog.mjs';

const backendSource = readFileSync(join(projectRoot, 'public/js/backend.js'), 'utf8');
const catalog = loadCatalogData();

function createStorage() {
  const values = new Map();
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(String(key), String(value));
    },
    removeItem(key) {
      values.delete(key);
    },
    clear() {
      values.clear();
    },
  };
}

function jwt(payload) {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode(payload)}.firma-de-prueba`;
}

async function loadBackend(config) {
  const localStorage = createStorage();
  const window = {
    FERROMAX_CONFIG: config,
    FERROMAX: catalog,
    crypto: webcrypto,
    localStorage,
    atob: (value) => Buffer.from(value, 'base64').toString('binary'),
    supabase: {
      createClient() {
        return { stub: true };
      },
    },
  };
  const sandbox = {
    window,
    console,
    Buffer,
    URL,
    setTimeout,
    clearTimeout,
    TextEncoder,
    TextDecoder,
    Promise,
  };
  runInNewContext(backendSource, sandbox, { filename: 'public/js/backend.js' });
  await window.FerroMaxBackend.ready;
  return { window, localStorage };
}

describe('Validación de fotos del backend', () => {
  test('acepta JPG, PNG y WebP dentro del límite', async () => {
    const { window } = await loadBackend({
      mode: 'local',
      supabaseUrl: '',
      supabaseAnonKey: '',
      turnstileSiteKey: '',
    });
    const backend = window.FerroMaxBackend;

    for (const type of ['image/jpeg', 'image/png', 'image/webp']) {
      assert.equal(backend.validateImageFile({ type, size: 1024 }), '');
    }
    assert.equal(backend.maxImages, 5);
    assert.equal(backend.maxFileSize, 5 * 1024 * 1024);
  });

  test('rechaza archivos vacíos, formatos peligrosos y exceso de tamaño', async () => {
    const { window } = await loadBackend({
      mode: 'local',
      supabaseUrl: '',
      supabaseAnonKey: '',
      turnstileSiteKey: '',
    });
    const validate = window.FerroMaxBackend.validateImageFile;

    assert.match(validate(null), /Elegí una foto/);
    assert.match(validate({ type: 'image/svg+xml', size: 100 }), /JPG, PNG o WebP/);
    assert.match(validate({ type: 'text/html', size: 100 }), /JPG, PNG o WebP/);
    assert.match(validate({ type: 'image/png', size: 0 }), /vacía o dañada/);
    assert.match(validate({ type: 'image/png', size: 5 * 1024 * 1024 + 1 }), /5 MB/);
    assert.equal(validate({ type: 'image/png', size: 5 * 1024 * 1024 }), '');
  });
});

describe('Detección de claves secretas en la configuración', () => {
  test('rechaza sb_secret_ sin intentar conectar', async () => {
    const { window } = await loadBackend({
      mode: 'supabase',
      supabaseUrl: 'https://proyecto-de-prueba.supabase.co',
      supabaseAnonKey: ['sb', 'secret', 'clave_que_nunca_debe_llegar_al_navegador'].join('_'),
      turnstileSiteKey: '',
    });
    const status = window.FerroMaxBackend.getSetupStatus();
    assert.match(status.error, /clave secreta/i);
  });

  test('rechaza un JWT con rol service_role', async () => {
    const { window } = await loadBackend({
      mode: 'supabase',
      supabaseUrl: 'https://proyecto-de-prueba.supabase.co',
      supabaseAnonKey: jwt({ role: 'service_role' }),
      turnstileSiteKey: '',
    });
    const status = window.FerroMaxBackend.getSetupStatus();
    assert.match(status.error, /clave secreta/i);
  });

  test('acepta una publishable key y un JWT anon', async () => {
    for (const key of ['sb_publishable_clave_publica_de_prueba', jwt({ role: 'anon' })]) {
      const { window } = await loadBackend({
        mode: 'supabase',
        supabaseUrl: 'https://proyecto-de-prueba.supabase.co',
        supabaseAnonKey: key,
        turnstileSiteKey: '',
      });
      assert.equal(window.FerroMaxBackend.getSetupStatus().error, '');
    }
  });
});

describe('Sesión local', () => {
  test('crea las cuentas demo con hash y sin contraseñas en claro', async () => {
    const { localStorage } = await loadBackend({
      mode: 'local',
      supabaseUrl: '',
      supabaseAnonKey: '',
      turnstileSiteKey: '',
    });
    const users = JSON.parse(localStorage.getItem('ferromax.demo.users.v1'));
    assert.equal(users.length, 2);

    for (const user of users) {
      assert.ok(user.passwordHash);
      assert.ok(user.salt);
      assert.equal(user.password, undefined);
      assert.doesNotMatch(JSON.stringify(user), /Admin1234!|Cliente1234!/);
    }
    const admin = users.find((user) => user.email === 'admin@ferromax.com');
    assert.equal(admin.role, 'admin');
  });

  test('una sesión vencida se descarta', async () => {
    const { window, localStorage } = await loadBackend({
      mode: 'local',
      supabaseUrl: '',
      supabaseAnonKey: '',
      turnstileSiteKey: '',
    });
    const users = JSON.parse(localStorage.getItem('ferromax.demo.users.v1'));
    const admin = users.find((user) => user.email === 'admin@ferromax.com');
    localStorage.setItem(
      'ferromax.demo.session.v1',
      JSON.stringify({ userId: admin.id, expiresAt: Date.now() - 1000 })
    );

    const session = await window.FerroMaxBackend.getSession();
    assert.equal(session, null);
    assert.equal(localStorage.getItem('ferromax.demo.session.v1'), null);
  });
});
