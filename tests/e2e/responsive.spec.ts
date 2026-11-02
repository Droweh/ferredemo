import { expect, test } from './support/fixtures';
import { loginAsAdmin } from './support/helpers';

async function expectNoPageOverflow(page: import('@playwright/test').Page) {
  const metrics = await page.evaluate(() => ({
    viewport: window.innerWidth,
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
  }));
  expect(metrics.document, JSON.stringify(metrics)).toBeLessThanOrEqual(metrics.viewport + 1);
  expect(metrics.body, JSON.stringify(metrics)).toBeLessThanOrEqual(metrics.viewport + 1);
}

test.describe('Diseño responsive', () => {
  test('la portada móvil no desborda y el menú se abre', async ({ page }) => {
    await page.goto('/');
    await page.locator('#grid-combos .product-card').first().waitFor();
    await expectNoPageOverflow(page);
    await expect(page.getByRole('switch')).toBeVisible();

    const toggle = page.locator('#menu-toggle');
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('#menu')).toHaveClass(/is-open/);
    await expect(page.locator('#menu .category-nav__link')).toHaveCount(9);

    await page.locator('#menu .category-nav__link', { hasText: 'Agro' }).click();
    await expect(page).toHaveURL(/categoria\.html\?cat=agro$/);
  });

  test('el catálogo móvil mantiene los filtros utilizables', async ({ page }) => {
    await page.goto('/categoria.html?cat=maquinas');
    await expect(page.locator('#category-grid .product-card').first()).toBeVisible();
    await expectNoPageOverflow(page);
    await expect(page.locator('#subcategory-section')).toBeVisible();
    await expect(page.locator('#sort-select')).toBeVisible();

    await page.locator('#subcategory-list .subcategory-link', { hasText: 'Taladros' }).click();
    await expect(page).toHaveURL(/sub=taladros$/);
    await expect(page.locator('#category-grid .product-card').first()).toBeVisible();
  });

  test('el carrito ocupa el ancho disponible sin desbordar', async ({ page }) => {
    await page.goto('/');
    await page.locator('#grid-combos .product-card').first().waitFor();
    await page.locator('.action-btn[data-action="open-cart"]').click();
    const cart = page.locator('#cart');
    await expect(cart).toHaveAttribute('aria-hidden', 'false');

    const box = await cart.boundingBox();
    const viewport = page.viewportSize();
    expect(box).not.toBeNull();
    expect(viewport).not.toBeNull();
    if (box && viewport) {
      expect(box.width).toBeLessThanOrEqual(viewport.width + 1);
      expect(box.x).toBeGreaterThanOrEqual(-1);
    }
    await expectNoPageOverflow(page);
  });

  test('la cuenta móvil muestra los formularios completos', async ({ page }) => {
    await page.goto('/cuenta.html#registro');
    await expectNoPageOverflow(page);
    await expect(page.locator('#register-form')).toBeVisible();
    const submit = page.getByRole('button', { name: 'Crear cuenta' });
    await expect(submit).toBeVisible();
    const box = await submit.boundingBox();
    const viewport = page.viewportSize();
    if (box && viewport) expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
  });

  test('el panel móvil permite trabajar con la tabla y el editor', async ({ page }) => {
    await loginAsAdmin(page);
    await expectNoPageOverflow(page);
    await expect(page.locator('#products-view .admin-table-wrap')).toBeVisible();

    await page.getByRole('button', { name: 'Nuevo producto' }).click();
    const dialog = page.locator('#product-dialog');
    await expect(dialog).toBeVisible();
    const box = await dialog.boundingBox();
    const viewport = page.viewportSize();
    expect(box).not.toBeNull();
    expect(viewport).not.toBeNull();
    if (box && viewport) {
      expect(box.width).toBeLessThanOrEqual(viewport.width + 1);
      expect(box.x).toBeGreaterThanOrEqual(-1);
    }
    await page.getByRole('button', { name: 'Cancelar' }).click();
    await expect(dialog).toBeHidden();
  });
});
