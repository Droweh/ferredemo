import { expect, test } from './support/fixtures';
import { loginAsAdmin, openAdminProduct, pngFile } from './support/helpers';

test.describe('Seguridad del navegador', () => {
  test('escapa nombres de producto maliciosos en panel, catálogo y ficha', async ({ page }) => {
    await loginAsAdmin(page);
    const malicious = '<img src=x onerror="window.__ferredemoXss=1">Producto XSS';

    await page.evaluate(async (name) => {
      await window.FerreDemoBackend.admin.saveProduct(null, {
        code: 'FDXSS1',
        name,
        category: 'herramientas',
        subcategory: null,
        collection: null,
        icon: 'toolbox',
        price: 5,
        oldPrice: 0,
        stock: 1,
        status: 'published',
        description: '<script>window.__ferredemoXss = 2</script>',
      });
    }, malicious);

    await page.reload();
    await expect(page.locator('#admin-shell')).toBeVisible();
    await page.fill('#admin-search', 'FDXSS1');
    const row = page.locator('#products-body tr[data-product-id]', { hasText: 'FDXSS1' });
    await expect(row).toBeVisible();
    await expect(row.locator('.admin-product__name')).toHaveText(malicious);
    await expect(row.locator('img[src="x"]')).toHaveCount(0);
    expect(await page.evaluate(() => window.__ferredemoXss)).toBeUndefined();
    const productId = await row.getAttribute('data-product-id');
    expect(productId).toBeTruthy();

    await page.goto('/categoria.html?cat=herramientas&q=FDXSS1');
    const card = page.locator('#category-grid .product-card', { hasText: 'FDXSS1' });
    await expect(card).toBeVisible();
    await expect(card.locator('.product-card__name')).toHaveText(malicious);
    await expect(card.locator('img[src="x"]')).toHaveCount(0);
    await expect(card.locator('script')).toHaveCount(0);
    expect(await page.evaluate(() => window.__ferredemoXss)).toBeUndefined();

    await page.goto(`/producto.html?id=${productId}`);
    await expect(page.locator('#product-name')).toHaveText(malicious);
    await expect(page.locator('#product-description')).toContainText('<script>');
    await expect(page.locator('#product-description script')).toHaveCount(0);
    await expect(page.locator('#product-content img[src="x"]')).toHaveCount(0);
    expect(await page.evaluate(() => window.__ferredemoXss)).toBeUndefined();
  });

  test('rechaza SVG y archivos mayores a 5 MB en la subida de fotos', async ({ page }) => {
    await loginAsAdmin(page);
    await openAdminProduct(page, 1);
    const alert = page.locator('#editor-alert');
    await expect(page.locator('#editor-photos .editor-photo')).toHaveCount(1);
    await expect(page.locator('#editor-photos .editor-photo--pending')).toHaveCount(0);

    await page.setInputFiles('#photo-input', {
      name: 'archivo-peligroso.svg',
      mimeType: 'image/svg+xml',
      buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'),
    });
    await expect(alert).toBeVisible();
    await expect(alert).toContainText('La foto tiene que ser JPG, PNG o WebP.');
    await expect(page.locator('#editor-photos .editor-photo--pending')).toHaveCount(0);

    await page.setInputFiles('#photo-input', {
      name: 'foto-gigante.png',
      mimeType: 'image/png',
      buffer: Buffer.alloc(5 * 1024 * 1024 + 1, 0),
    });
    await expect(alert).toContainText('Cada foto puede pesar como máximo 5 MB.');
    await expect(page.locator('#editor-photos .editor-photo--pending')).toHaveCount(0);
  });

  test('limita a cinco fotos pendientes antes de guardar', async ({ page }) => {
    await loginAsAdmin(page);
    await page.getByRole('button', { name: 'Nuevo producto' }).click();
    await expect(page.locator('#product-dialog')).toBeVisible();

    const files = Array.from({ length: 6 }, (_, index) => pngFile(`foto-${index + 1}.png`));
    await page.setInputFiles('#photo-input', files);

    await expect(page.locator('#editor-photos .editor-photo--pending')).toHaveCount(5);
    await expect(page.locator('#editor-alert')).toContainText('hasta 5 fotos');
    await expect(page.locator('#editor-upload-button')).toBeDisabled();

    await page.locator('#editor-photos [data-pending-action="remove"]').first().click();
    await expect(page.locator('#editor-photos .editor-photo--pending')).toHaveCount(4);
    await expect(page.locator('#editor-upload-button')).toBeEnabled();
  });

  test('una sesión expirada no se restaura', async ({ page }) => {
    await loginAsAdmin(page);
    await page.evaluate(() => {
      const raw = window.localStorage.getItem('ferredemo.demo.session.v1');
      const session = raw ? JSON.parse(raw) : {};
      window.localStorage.setItem(
        'ferredemo.demo.session.v1',
        JSON.stringify({ ...session, expiresAt: Date.now() - 60_000 })
      );
    });

    await page.goto('/cuenta.html');
    await expect(page.locator('#auth-view')).toBeVisible();
    await expect(page.locator('#session-chip')).toHaveText('Sin sesión');
    expect(
      await page.evaluate(() => window.localStorage.getItem('ferredemo.demo.session.v1'))
    ).toBeNull();
  });

  test('el admin no se otorga por parámetros de URL ni por query string', async ({ page }) => {
    await page.goto('/admin.html?role=admin&isAdmin=true#admin');
    await expect(page.locator('#admin-gate')).toBeVisible();
    await expect(page.locator('#admin-shell')).toBeHidden();
    await expect(page.locator('#gate-title')).toHaveText('Necesitás iniciar sesión');
  });
});
