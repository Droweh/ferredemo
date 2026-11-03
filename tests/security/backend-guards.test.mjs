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

async function loadBackend(initialStorage = {}) {
  const localStorage = createStorage();
  for (const [key, value] of Object.entries(initialStorage)) {
    localStorage.setItem(key, value);
  }
  const window = {
    FERREDEMO: catalog,
    crypto: webcrypto,
    localStorage,
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
  await window.FerreDemoBackend.ready;
  return { window, localStorage };
}

describe('Backend local', () => {
  test('expone el modo local y no requiere configuración', async () => {
    const { window } = await loadBackend();
    const backend = window.FerreDemoBackend;

    assert.equal(backend.mode, 'local');
    assert.equal(backend.isLocal, true);
    const status = backend.getSetupStatus();
    assert.equal(status.mode, 'local');
    assert.equal(status.configured, true);
    assert.equal(status.error, '');
  });
});

describe('Validación de fotos del backend', () => {
  test('acepta JPG, PNG y WebP dentro del límite', async () => {
    const { window } = await loadBackend();
    const backend = window.FerreDemoBackend;

    for (const type of ['image/jpeg', 'image/png', 'image/webp']) {
      assert.equal(backend.validateImageFile({ type, size: 1024 }), '');
    }
    assert.equal(backend.maxImages, 5);
    assert.equal(backend.maxFileSize, 5 * 1024 * 1024);
  });

  test('rechaza archivos vacíos, formatos peligrosos y exceso de tamaño', async () => {
    const { window } = await loadBackend();
    const validate = window.FerreDemoBackend.validateImageFile;

    assert.match(validate(null), /Elegí una foto/);
    assert.match(validate({ type: 'image/svg+xml', size: 100 }), /JPG, PNG o WebP/);
    assert.match(validate({ type: 'text/html', size: 100 }), /JPG, PNG o WebP/);
    assert.match(validate({ type: 'image/png', size: 0 }), /vacía o dañada/);
    assert.match(validate({ type: 'image/png', size: 5 * 1024 * 1024 + 1 }), /5 MB/);
    assert.equal(validate({ type: 'image/png', size: 5 * 1024 * 1024 }), '');
  });
});

describe('Migración del catálogo local', () => {
  test('actualiza códigos FM, descripciones y fotos sin pisar precios ni stock', async () => {
    const oldProducts = catalog.products.map((product) => ({
      ...product,
      code: product.code.replace(/^FD/, 'FM'),
      description: '',
      features: [],
      images: [],
      price: product.price + 1,
      stock: product.inStock ? 3 : 0,
      status: 'published',
      deletedAt: null,
    }));

    const { window, localStorage } = await loadBackend({
      'ferredemo.demo.products.v1': JSON.stringify(oldProducts),
    });

    const result = await window.FerreDemoBackend.getCatalog();
    const first = result.products.find((product) => Number(product.id) === 1);
    const outOfStock = result.products.find((product) => Number(product.id) === 4);
    assert.ok(first);
    assert.equal(first.code, 'FD1001');
    assert.ok(first.description.length > 40);
    assert.equal(first.features.length, 4);
    assert.equal(first.images.length, 1);
    assert.equal(first.images[0].url, 'images/products/p01-1.jpg');
    assert.equal(first.price, catalog.products[0].price + 1);
    assert.equal(first.inStock, true);
    assert.equal(outOfStock.code, 'FD1004');
    assert.equal(outOfStock.inStock, false);
    assert.equal(result.products.length, 32);
    assert.equal(localStorage.getItem('ferredemo.demo.version.v1'), '2');
  });
});

describe('Sesión local', () => {
  test('crea las cuentas demo con hash y sin contraseñas en claro', async () => {
    const { localStorage } = await loadBackend();
    const users = JSON.parse(localStorage.getItem('ferredemo.demo.users.v1'));
    assert.equal(users.length, 2);

    for (const user of users) {
      assert.ok(user.passwordHash);
      assert.ok(user.salt);
      assert.equal(user.password, undefined);
      assert.doesNotMatch(JSON.stringify(user), /Admin1234!|Cliente1234!/);
    }
    const admin = users.find((user) => user.email === 'admin@ferredemo.com');
    assert.equal(admin.role, 'admin');
  });

  test('una sesión vencida se descarta', async () => {
    const { window, localStorage } = await loadBackend();
    const users = JSON.parse(localStorage.getItem('ferredemo.demo.users.v1'));
    const admin = users.find((user) => user.email === 'admin@ferredemo.com');
    localStorage.setItem(
      'ferredemo.demo.session.v1',
      JSON.stringify({ userId: admin.id, expiresAt: Date.now() - 1000 })
    );

    const session = await window.FerreDemoBackend.getSession();
    assert.equal(session, null);
    assert.equal(localStorage.getItem('ferredemo.demo.session.v1'), null);
  });
});
