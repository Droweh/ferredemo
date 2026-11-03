import { expect, test } from './support/fixtures';

const PREVIOUS_PREFIX = ['ferro', 'max'].join('');
const PREVIOUS_DB = `${PREVIOUS_PREFIX}-demo-images`;

test('migra las claves y las fotos guardadas por la versión anterior', async ({ page }) => {
  await page.goto('/index.html');

  await page.evaluate(
    async ({ previousPrefix, previousDb }) => {
      window.localStorage.clear();
      window.localStorage.setItem(`${previousPrefix}.theme.v1`, 'dark');

      await new Promise<void>((resolve, reject) => {
        const request = window.indexedDB.open(previousDb, 1);
        request.onupgradeneeded = () => request.result.createObjectStore('images');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const transaction = db.transaction('images', 'readwrite');
          transaction.objectStore('images').put('data:image/webp;base64,AAAA', 'seed-1');
          transaction.oncomplete = () => {
            db.close();
            resolve();
          };
          transaction.onerror = () => reject(transaction.error);
        };
      });
    },
    { previousPrefix: PREVIOUS_PREFIX, previousDb: PREVIOUS_DB }
  );

  await page.reload();
  await page.waitForFunction(() => Boolean(window.FerreDemoBackend && window.FerreDemoBackend.ready));

  const result = await page.evaluate(
    async ({ previousPrefix, previousDb }) => {
      const theme = window.localStorage.getItem('ferredemo.theme.v1');
      const previousTheme = window.localStorage.getItem(`${previousPrefix}.theme.v1`);
      const databases = await window.indexedDB.databases();
      const previousExists = databases.some((database) => database.name === previousDb);

      const image = await new Promise<string | null>((resolve) => {
        const request = window.indexedDB.open('ferredemo-demo-images');
        request.onerror = () => resolve(null);
        request.onsuccess = () => {
          const db = request.result;
          const transaction = db.transaction('images', 'readonly');
          const read = transaction.objectStore('images').get('seed-1');
          read.onsuccess = () => resolve(read.result ?? null);
          read.onerror = () => resolve(null);
          transaction.oncomplete = () => db.close();
        };
      });

      return { theme, previousTheme, previousExists, image };
    },
    { previousPrefix: PREVIOUS_PREFIX, previousDb: PREVIOUS_DB }
  );

  expect(result.theme).toBe('dark');
  expect(result.previousTheme).toBeNull();
  expect(result.previousExists).toBe(false);
  expect(result.image).toBe('data:image/webp;base64,AAAA');
});
