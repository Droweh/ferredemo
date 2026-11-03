/* Compatibilidad con datos guardados por versiones anteriores de FerreDemo.
   Se carga antes que theme.js y backend.js. */
(() => {
  'use strict';

  const LEGACY_PREFIX = 'ferromax.';
  const PREFIX = 'ferredemo.';
  const LEGACY_DB = 'ferromax-demo-images';
  const DB_NAME = 'ferredemo-demo-images';
  const STORE = 'images';

  function migrateLocalStorage() {
    try {
      const pending = [];
      for (let index = 0; index < window.localStorage.length; index += 1) {
        const key = window.localStorage.key(index);
        if (key && key.indexOf(LEGACY_PREFIX) === 0) pending.push(key);
      }

      for (const key of pending) {
        const nextKey = PREFIX + key.slice(LEGACY_PREFIX.length);
        const value = window.localStorage.getItem(key);
        if (value !== null && window.localStorage.getItem(nextKey) === null) {
          window.localStorage.setItem(nextKey, value);
        }
        window.localStorage.removeItem(key);
      }
    } catch (error) {
      /* Si el navegador bloquea localStorage, la demo arranca vacía. */
    }
  }

  function requestAsPromise(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('No pudimos leer IndexedDB.'));
    });
  }

  function openDatabase(name, version) {
    return new Promise((resolve, reject) => {
      const request = version ? window.indexedDB.open(name, version) : window.indexedDB.open(name);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('No pudimos abrir IndexedDB.'));
    });
  }

  async function legacyDatabaseExists() {
    if (!window.indexedDB || typeof window.indexedDB.databases !== 'function') return null;
    try {
      const databases = await window.indexedDB.databases();
      return databases.some((database) => database.name === LEGACY_DB);
    } catch (error) {
      return null;
    }
  }

  function openLegacyDatabase() {
    return new Promise((resolve) => {
      const request = window.indexedDB.open(LEGACY_DB);
      request.onupgradeneeded = () => {
        request.transaction.abort();
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    });
  }

  async function readRecords(db) {
    if (!db.objectStoreNames.contains(STORE)) return [];

    const transaction = db.transaction(STORE, 'readonly');
    const store = transaction.objectStore(STORE);
    const keysRequest = store.getAllKeys();
    const valuesRequest = store.getAll();

    await new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error('No pudimos leer las fotos.'));
      transaction.onabort = () => reject(transaction.error || new Error('No pudimos leer las fotos.'));
    });

    return keysRequest.result.map((key, index) => ({
      key,
      value: valuesRequest.result[index],
    }));
  }

  async function writeRecords(db, records) {
    if (!records.length) return;

    const transaction = db.transaction(STORE, 'readwrite');
    const store = transaction.objectStore(STORE);
    for (const record of records) store.put(record.value, record.key);

    await new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error('No pudimos copiar las fotos.'));
      transaction.onabort = () => reject(transaction.error || new Error('No pudimos copiar las fotos.'));
    });
  }

  function closeDatabase(db) {
    if (!db) return;
    try {
      db.close();
    } catch (error) {
      /* La base ya estaba cerrada. */
    }
  }

  function deleteDatabase(name) {
    return new Promise((resolve) => {
      const request = window.indexedDB.deleteDatabase(name);
      request.onsuccess = () => resolve();
      request.onerror = () => resolve();
      request.onblocked = () => resolve();
    });
  }

  async function migrateImages() {
    if (!window.indexedDB) return;

    let legacyDb = null;
    let currentDb = null;

    try {
      const exists = await legacyDatabaseExists();
      if (exists === false) return;

      legacyDb = exists === true ? await openDatabase(LEGACY_DB) : await openLegacyDatabase();
      if (!legacyDb) return;

      const records = await readRecords(legacyDb);
      if (!records.length) {
        closeDatabase(legacyDb);
        legacyDb = null;
        await deleteDatabase(LEGACY_DB);
        return;
      }

      currentDb = await openDatabase(DB_NAME, 1);
      const transaction = currentDb.transaction(STORE, 'readonly');
      const count = await requestAsPromise(transaction.objectStore(STORE).count());

      /* shortcut: la copia es todo o nada; si la base nueva ya tiene fotos, no se mezclan.
         Migrar por clave si alguna vez conviven datos de las dos versiones. */
      if (count === 0) await writeRecords(currentDb, records);

      closeDatabase(currentDb);
      currentDb = null;
      closeDatabase(legacyDb);
      legacyDb = null;
      await deleteDatabase(LEGACY_DB);
    } catch (error) {
      /* Si falla la copia, se conserva la base vieja y la demo sigue funcionando. */
    } finally {
      closeDatabase(currentDb);
      closeDatabase(legacyDb);
    }
  }

  migrateLocalStorage();
  const ready = migrateImages().catch(() => {});
  window.FerreDemoLegacy = { ready, migrateLocalStorage };
})();
