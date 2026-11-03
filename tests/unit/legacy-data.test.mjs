import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { describe, test } from 'node:test';
import { projectRoot } from './support/catalog.mjs';

const source = readFileSync(join(projectRoot, 'public/js/legacy-data.js'), 'utf8');
const PREVIOUS_PREFIX = ['ferro', 'max'].join('');

function createStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    get length() {
      return values.size;
    },
    key(index) {
      return Array.from(values.keys())[index] ?? null;
    },
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

function runMigration(initial) {
  const localStorage = createStorage(initial);
  const window = { localStorage };
  runInNewContext(source, { window, console, Promise }, { filename: 'public/js/legacy-data.js' });
  return { window, localStorage };
}

describe('Compatibilidad con datos guardados', () => {
  test('copia las claves locales viejas y las borra', async () => {
    const { window, localStorage } = runMigration({
      [`${PREVIOUS_PREFIX}.theme.v1`]: 'dark',
      [`${PREVIOUS_PREFIX}.demo.users.v1`]: '{"admin":true}',
      'otra.app': 'sin tocar',
    });

    await window.FerreDemoLegacy.ready;

    assert.equal(localStorage.getItem('ferredemo.theme.v1'), 'dark');
    assert.equal(localStorage.getItem('ferredemo.demo.users.v1'), '{"admin":true}');
    assert.equal(localStorage.getItem(`${PREVIOUS_PREFIX}.theme.v1`), null);
    assert.equal(localStorage.getItem(`${PREVIOUS_PREFIX}.demo.users.v1`), null);
    assert.equal(localStorage.getItem('otra.app'), 'sin tocar');
  });

  test('no pisa una clave nueva que ya existe', async () => {
    const { window, localStorage } = runMigration({
      [`${PREVIOUS_PREFIX}.theme.v1`]: 'dark',
      'ferredemo.theme.v1': 'light',
    });

    await window.FerreDemoLegacy.ready;
    window.FerreDemoLegacy.migrateLocalStorage();

    assert.equal(localStorage.getItem('ferredemo.theme.v1'), 'light');
    assert.equal(localStorage.getItem(`${PREVIOUS_PREFIX}.theme.v1`), null);
  });
});
