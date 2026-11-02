import { expect, type Page } from '@playwright/test';

export const ADMIN = {
  email: 'admin@ferredemo.com',
  password: 'Admin1234!',
};

export const CLIENT = {
  email: 'cliente@ferredemo.com',
  password: 'Cliente1234!',
};

/* PNG 1x1 válido: alcanza para comprobar selección, compresión y persistencia. */
export const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2n0kAAAAASUVORK5CYII=';

export const pngFile = (name = 'foto-ferredemo.png') => ({
  name,
  mimeType: 'image/png',
  buffer: Buffer.from(PNG_BASE64, 'base64'),
});

export async function loginAsAdmin(page: Page): Promise<void> {
  await page.goto('/admin.html');
  const demoButton = page.getByRole('button', { name: 'Entrar como admin demo' });
  await expect(demoButton).toBeVisible();
  await demoButton.click();
  await expect(page.locator('#admin-shell')).toBeVisible();
  await expect(page.locator('#admin-loading')).toBeHidden();
}

export async function loginWithCredentials(
  page: Page,
  credentials: { email: string; password: string }
): Promise<void> {
  await page.goto('/cuenta.html#ingresar');
  await page.fill('#login-email', credentials.email);
  await page.fill('#login-password', credentials.password);
  await page.getByRole('button', { name: 'Ingresar', exact: true }).click();
  await expect(page.locator('#account-view')).toBeVisible();
}

export async function signOutFromAccount(page: Page): Promise<void> {
  await page.locator('#dashboard-signout').click();
  await expect(page.locator('#auth-view')).toBeVisible();
}

export async function openAdminProduct(page: Page, id: number): Promise<void> {
  const row = page.locator(`#products-body tr[data-product-id="${id}"]`);
  await expect(row).toBeVisible();
  await row.locator('[data-row-action="edit"]').click();
  await expect(page.locator('#product-dialog')).toBeVisible();
}

export async function confirmDialog(page: Page, label = 'Confirmar'): Promise<void> {
  const dialog = page.locator('#confirm-dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: label }).click();
  await expect(dialog).toBeHidden();
}

export async function localReset(page: Page): Promise<void> {
  await page.evaluate(async () => {
    window.localStorage.clear();
    await new Promise((resolve) => {
      const request = window.indexedDB.deleteDatabase('ferromax-demo-images');
      request.onsuccess = () => resolve(undefined);
      request.onerror = () => resolve(undefined);
      request.onblocked = () => resolve(undefined);
    });
  });
}
