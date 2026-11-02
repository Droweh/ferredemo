import { expect, test } from './support/fixtures';
import {
  confirmDialog,
  loginAsAdmin,
  openAdminProduct,
  pngFile,
} from './support/helpers';

test.describe('Panel de administración', () => {
  test('crea un producto con foto en el mismo flujo y la foto llega a la tienda', async ({ page }) => {
    await loginAsAdmin(page);
    await expect(page.locator('#stat-total')).toHaveText('32');
    await expect(page.locator('#products-body tr[data-product-id]')).toHaveCount(32);

    await page.getByRole('button', { name: 'Nuevo producto' }).click();
    const dialog = page.locator('#product-dialog');
    await expect(dialog).toBeVisible();
    await expect(page.locator('#product-dialog-title')).toHaveText('Nuevo producto');

    await page.fill('#product-code', 'FM9001');
    await page.fill('#product-name', 'Taladro de prueba con foto');
    await page.selectOption('#product-category', 'maquinas');
    await page.selectOption('#product-subcategory', 'taladros');
    await page.selectOption('#product-collection', 'nuevos');
    await page.selectOption('#product-icon', 'drill');
    await page.fill('#product-price', '199.90');
    await page.fill('#product-old-price', '250');
    await page.fill('#product-stock', '7');
    await page.fill('#product-description', 'Producto creado por la suite funcional.');

    await expect(page.locator('#editor-upload-button')).toBeEnabled();
    await page.setInputFiles('#photo-input', pngFile());
    await expect(page.locator('#editor-photos .editor-photo--pending')).toHaveCount(1);
    await expect(page.locator('#editor-photos-note')).toContainText('1 de 5 fotos listas');
    await expect(page.locator('#editor-photos .editor-photo__cover')).toHaveText('Portada');

    await page.getByRole('button', { name: 'Guardar producto' }).click();
    await expect(dialog).toBeHidden();
    await expect(page.locator('#toast')).toContainText('Producto creado con fotos');

    await page.fill('#admin-search', 'FM9001');
    const row = page.locator('#products-body tr[data-product-id]', { hasText: 'FM9001' });
    await expect(row).toBeVisible();
    await expect(row).toContainText('Taladro de prueba con foto');
    await expect(row).toContainText('1/5');
    await expect(row).toContainText('USD 199,9');

    await page.goto('/');
    const card = page.locator('#grid-nuevos .product-card', { hasText: 'FM9001' });
    await expect(card).toBeVisible();
    await expect(card).toContainText('Taladro de prueba con foto');
    await expect(card.locator('.product-card__photo')).toHaveAttribute(
      'src',
      /^data:image\/webp;base64,/
    );
    await expect(card).toContainText('USD 200');

    await page.goto('/admin.html');
    await expect(page.locator('#admin-shell')).toBeVisible();
    await page.fill('#admin-search', 'FM9001');
    const persisted = page.locator('#products-body tr[data-product-id]', { hasText: 'FM9001' });
    await expect(persisted).toContainText('1/5');
  });

  test('edita precio y stock y la tienda refleja el agotado', async ({ page }) => {
    await loginAsAdmin(page);
    await openAdminProduct(page, 1);

    await page.fill('#product-price', '700');
    await page.fill('#product-old-price', '0');
    await page.fill('#product-stock', '0');
    await page.getByRole('button', { name: 'Guardar producto' }).click();

    await expect(page.locator('#product-dialog')).toBeHidden();
    await expect(page.locator('#toast')).toContainText('Producto actualizado');
    const row = page.locator('#products-body tr[data-product-id="1"]');
    await expect(row).toContainText('USD 700');
    await expect(row.locator('.admin-stock')).toHaveText('0');
    await expect(row.locator('.admin-stock')).toHaveClass(/is-out/);

    await page.goto('/');
    const card = page.locator('#grid-combos .product-card', { hasText: 'FM1001' });
    await expect(card).toContainText('USD 700');
    await expect(card).toContainText('Agotado');
    await expect(card.getByRole('button', { name: 'Agregar al carrito' })).toBeDisabled();
  });

  test('oculta y vuelve a publicar un producto', async ({ page }) => {
    await loginAsAdmin(page);
    await page.fill('#admin-search', 'FM1011');
    const row = page.locator('#products-body tr[data-product-id="11"]');
    await expect(row).toBeVisible();
    await expect(row.locator('.admin-status')).toHaveText('Publicado');

    await row.locator('[data-row-action="toggle"]').click();
    await expect(page.locator('#toast')).toContainText('Producto oculto');
    await expect(row.locator('.admin-status')).toHaveText('Oculto');

    await page.goto('/');
    await expect(page.locator('#grid-nuevos .product-card', { hasText: 'FM1011' })).toHaveCount(0);

    await page.goto('/admin.html');
    await expect(page.locator('#admin-shell')).toBeVisible();
    const hiddenRow = page.locator('#products-body tr[data-product-id="11"]');
    await expect(hiddenRow.locator('.admin-status')).toHaveText('Oculto');
    await hiddenRow.locator('[data-row-action="toggle"]').click();
    await expect(page.locator('#toast')).toContainText('Producto publicado');
    await expect(hiddenRow.locator('.admin-status')).toHaveText('Publicado');

    await page.goto('/');
    await expect(page.locator('#grid-nuevos .product-card', { hasText: 'FM1011' })).toHaveCount(1);
  });

  test('envía a la papelera, restaura y conserva la búsqueda', async ({ page }) => {
    await loginAsAdmin(page);
    await page.fill('#admin-search', 'FM1001');
    const row = page.locator('#products-body tr[data-product-id="1"]');
    await expect(row).toBeVisible();

    await row.locator('[data-row-action="delete"]').click();
    await confirmDialog(page, 'Enviar a papelera');
    await expect(page.locator('#toast')).toContainText('Producto enviado a la papelera');
    await expect(page.locator('#products-empty')).toBeVisible();
    await expect(page.locator('#tab-trash-count')).toHaveText('1');

    await page.locator('[data-admin-tab="trash"]').click();
    await expect(page.locator('#trash-view')).toBeVisible();
    const trashRow = page.locator('#trash-body tr[data-product-id="1"]');
    await expect(trashRow).toBeVisible();
    await expect(trashRow).toContainText('FM1001');
    await trashRow.locator('[data-row-action="restore"]').click();
    await expect(page.locator('#toast')).toContainText('Producto restaurado');
    await expect(page.locator('#tab-trash-count')).toHaveText('0');

    await page.locator('[data-admin-tab="products"]').click();
    await expect(page.locator('#products-body tr[data-product-id="1"]')).toBeVisible();
  });

  test('el filtro por estado muestra solo los agotados', async ({ page }) => {
    await loginAsAdmin(page);
    await page.selectOption('#admin-status-filter', 'out');
    const rows = page.locator('#products-body tr[data-product-id]');
    await expect(rows.first()).toBeVisible();
    const count = await rows.count();
    expect(count).toBeGreaterThan(0);
    for (let index = 0; index < count; index += 1) {
      await expect(rows.nth(index).locator('.admin-stock')).toHaveText('0');
    }
    await expect(page.locator('#admin-results-count')).toHaveText(
      `${count} ${count === 1 ? 'producto' : 'productos'}`
    );
  });

  test('restaura la demo completa y elimina productos de prueba', async ({ page }) => {
    await loginAsAdmin(page);
    await page.evaluate(async () => {
      await window.FerroMaxBackend.admin.saveProduct(null, {
        code: 'FMRESET1',
        name: 'Producto a borrar con el reset',
        category: 'herramientas',
        subcategory: null,
        collection: null,
        icon: 'toolbox',
        price: 10,
        oldPrice: 0,
        stock: 2,
        status: 'published',
        description: '',
      });
    });
    await page.reload();
    await expect(page.locator('#admin-shell')).toBeVisible();
    await expect(page.locator('#stat-total')).toHaveText('33');
    await page.fill('#admin-search', 'FMRESET1');
    await expect(page.locator('#products-body tr[data-product-id]')).toHaveCount(1);

    await page.getByRole('button', { name: 'Restaurar demo' }).click();
    await confirmDialog(page, 'Restaurar demo');
    await expect(page.locator('#toast')).toContainText('Demo restaurada');
    await expect(page.locator('#stat-total')).toHaveText('32');
    await expect(page.locator('#stat-trash')).toHaveText('0');
    await expect(page.locator('#products-body tr[data-product-id]')).toHaveCount(0);
    await expect(page.locator('#products-empty')).toBeVisible();
  });
});
