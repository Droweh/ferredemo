import { test as base, expect } from '@playwright/test';

/* Todos los tests de navegador fuerzan el modo local. Así la suite nunca
   escribe en el Supabase de la demo pública aunque config.js apunte a él. */
export const test = base.extend({
  page: async ({ page }, use) => {
    await page.route('**/*', async (route) => {
      const url = new URL(route.request().url());
      if (url.hostname === '127.0.0.1' || url.hostname === 'localhost') {
        await route.continue();
        return;
      }
      await route.abort('blockedbyclient');
    });

    await page.route('**/js/config.js', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'text/javascript; charset=utf-8',
        body: [
          '/* Configuración inyectada por la suite de tests. */',
          "window.FERROMAX_CONFIG = { mode: 'local', supabaseUrl: '', supabaseAnonKey: '', turnstileSiteKey: '' };",
        ].join('\n'),
      });
    });

    await use(page);
  },
});

export { expect };
