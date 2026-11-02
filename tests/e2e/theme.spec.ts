import { expect, test } from './support/fixtures';

test.describe('Tema claro y oscuro', () => {
  test('por defecto sigue al sistema sin escribir data-theme', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('/');

    const html = page.locator('html');
    const toggle = page.getByRole('switch');

    await expect(html).not.toHaveAttribute('data-theme', /.*/);
    await expect(toggle).toHaveAttribute('aria-checked', 'false');
    await expect(toggle).toHaveAttribute('aria-label', 'Cambiar a modo oscuro');
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#f3f1ec');

    await page.emulateMedia({ colorScheme: 'dark' });
    await expect(toggle).toHaveAttribute('aria-checked', 'true');
    await expect(toggle).toHaveAttribute('aria-label', 'Cambiar a modo claro');
    await expect(html).not.toHaveAttribute('data-theme', /.*/);
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#0f1112');
  });

  test('el switch fija una preferencia manual y la conserva entre páginas', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('/');

    const html = page.locator('html');
    const toggle = page.getByRole('switch');

    await toggle.click();
    await expect(html).toHaveAttribute('data-theme', 'dark');
    await expect(toggle).toHaveAttribute('aria-checked', 'true');
    await expect
      .poll(() => page.evaluate(() => window.localStorage.getItem('ferromax.theme.v1')))
      .toBe('dark');
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#0f1112');

    await page.reload();
    await expect(html).toHaveAttribute('data-theme', 'dark');
    await expect(page.getByRole('switch')).toHaveAttribute('aria-checked', 'true');

    await page.goto('/categoria.html?cat=maquinas');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(page.getByRole('switch')).toHaveAttribute('aria-checked', 'true');

    await page.getByRole('switch').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await expect
      .poll(() => page.evaluate(() => window.localStorage.getItem('ferromax.theme.v1')))
      .toBe('light');
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#f3f1ec');
  });

  test('la preferencia manual gana sobre el tema del sistema', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('/');
    await page.getByRole('switch').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

    await page.emulateMedia({ colorScheme: 'light' });
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(page.getByRole('switch')).toHaveAttribute('aria-checked', 'true');

    await page.evaluate(() => window.FerroMaxTheme.clear());
    await expect(page.locator('html')).not.toHaveAttribute('data-theme', /.*/);
    await expect(page.getByRole('switch')).toHaveAttribute('aria-checked', 'false');
    await expect
      .poll(() => page.evaluate(() => window.localStorage.getItem('ferromax.theme.v1')))
      .toBeNull();
  });

  test('el switch existe y responde en las cuatro páginas', async ({ page }) => {
    const pages = ['/', '/categoria.html?cat=maquinas', '/cuenta.html'];

    for (const path of pages) {
      await page.goto(path);
      const toggle = page.getByRole('switch');
      await expect(toggle).toBeVisible();
      const before = await toggle.getAttribute('aria-checked');
      await toggle.click();
      await expect(toggle).not.toHaveAttribute('aria-checked', before ?? '');
      await page.evaluate(() => window.FerroMaxTheme.clear());
    }

    await page.goto('/admin.html');
    await page.getByRole('button', { name: 'Entrar como admin demo' }).click();
    await expect(page.locator('#admin-shell')).toBeVisible();
    const adminToggle = page.getByRole('switch');
    await expect(adminToggle).toBeVisible();
    await adminToggle.click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  });
});

test.describe('Tema del sistema oscuro', () => {
  test.use({ colorScheme: 'dark' });

  test('sin preferencia manual aplica oscuro y el switch permite aclarar', async ({ page }) => {
    await page.goto('/');
    const html = page.locator('html');
    const toggle = page.getByRole('switch');

    await expect(html).not.toHaveAttribute('data-theme', /.*/);
    await expect(toggle).toHaveAttribute('aria-checked', 'true');
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#0f1112');

    await toggle.click();
    await expect(html).toHaveAttribute('data-theme', 'light');
    await expect(toggle).toHaveAttribute('aria-checked', 'false');
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#f3f1ec');
  });
});
