import { test as base, expect } from '@playwright/test';

/* La demo es 100 % local: la suite bloquea cualquier pedido externo. */
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

    await use(page);
  },
});

export { expect };
