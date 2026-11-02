import { expect, test } from './support/fixtures';

const NOTICE = 'Imágenes de referencia de DIT Ferretería · Demo sin fines comerciales';

test.describe('Ficha de producto', () => {
  test('abre desde la tarjeta con datos, galería y relacionados', async ({ page }) => {
    await page.goto('/');
    const card = page.locator('#grid-combos .product-card', { hasText: 'FD1001' });
    await card.locator('.product-card__overlay').click();

    await expect(page).toHaveURL(/producto\.html\?id=1$/);
    await expect(page.locator('#product-name')).toHaveText(
      'Combo 15 · taladro + atornillador + amoladora 20V'
    );
    await expect(page.locator('#product-code')).toHaveText('FD1001');
    await expect(page.locator('#product-category')).toHaveText('Máquinas');
    await expect(page.locator('#product-price')).toHaveText('USD 645');
    await expect(page.locator('#product-old-price')).toHaveText('Antes USD 720');
    await expect(page.locator('#product-off')).toHaveText('10% OFF');
    await expect(page.locator('#product-stock')).toContainText('En stock');
    await expect(page.locator('#product-description')).toContainText('tres máquinas a batería');
    await expect(page.locator('#product-features li')).toHaveCount(4);

    await expect(page.locator('#product-gallery-image')).toHaveAttribute(
      'src',
      'images/products/p01-1.jpg'
    );
    await expect(page.locator('#product-gallery-counter')).toHaveText('01 / 01');
    await expect.poll(() =>
      page
        .locator('#product-gallery-image')
        .evaluate((image: HTMLImageElement) => image.naturalWidth)
    ).toBeGreaterThan(0);
    await expect(page.locator('.product-gallery__note')).toHaveText(NOTICE);

    await expect(page.locator('#product-breadcrumb')).toContainText('Máquinas');
    await expect(page.locator('#product-breadcrumb [aria-current="page"]')).toHaveText(
      'Combo 15 · taladro + atornillador + amoladora 20V'
    );
    await expect(page.locator('#product-meta-code')).toHaveText('FD1001');
    await expect(page.locator('#product-meta-subcategory')).toHaveText('—');

    await expect(page.locator('#og-title')).toHaveAttribute(
      'content',
      'Combo 15 · taladro + atornillador + amoladora 20V'
    );
    await expect(page.locator('#og-image')).toHaveAttribute('content', /\/images\/products\/p01-1\.jpg$/);
    const structured = JSON.parse((await page.locator('#product-jsonld').textContent()) || '{}');
    expect(structured.sku).toBe('FD1001');
    expect(structured.image).toContain('/images/products/p01-1.jpg');

    const related = page.locator('#product-related');
    await expect(related).toBeVisible();
    await expect(related.locator('.product-card')).toHaveCount(4);
    await expect(related.locator('.product-card').first()).toContainText('FD1002');

    await related.locator('.product-card', { hasText: 'FD1002' }).locator('.product-card__overlay').click();
    await expect(page).toHaveURL(/producto\.html\?id=2$/);
    await expect(page.locator('#product-name')).toHaveText('Combo 30 · kit a batería con valija');
  });

  test('cambia de foto y abre la galería ampliada con teclado', async ({ page }) => {
    await page.goto('/producto.html?id=27');
    await expect(page.locator('#product-name')).toHaveText('Juego de destornilladores 6 piezas');

    const thumbs = page.locator('.product-gallery__thumb');
    await expect(thumbs).toHaveCount(2);
    await expect(page.locator('#product-gallery-counter')).toHaveText('01 / 02');
    await expect(page.locator('#product-gallery-image')).toHaveAttribute(
      'src',
      'images/products/p27-1.jpg'
    );

    await thumbs.nth(1).click();
    await expect(page.locator('#product-gallery-counter')).toHaveText('02 / 02');
    await expect(page.locator('#product-gallery-image')).toHaveAttribute(
      'src',
      'images/products/p27-2.jpg'
    );

    await page.locator('#product-gallery-main').click();
    const lightbox = page.locator('#product-lightbox');
    await expect(lightbox).toBeVisible();
    await expect(page.locator('#lightbox-image')).toHaveAttribute(
      'src',
      'images/products/p27-2.jpg'
    );
    await expect(page.locator('#lightbox-caption')).toContainText('foto 2');
    await expect(page.locator('#lightbox-counter')).toHaveText('2 / 2');

    await page.getByRole('button', { name: 'Foto siguiente' }).click();
    await expect(page.locator('#lightbox-counter')).toHaveText('1 / 2');
    await expect(page.locator('#product-gallery-counter')).toHaveText('01 / 02');

    await page.keyboard.press('ArrowLeft');
    await expect(page.locator('#lightbox-counter')).toHaveText('2 / 2');

    await page.keyboard.press('Escape');
    await expect(lightbox).toBeHidden();
    await expect(page.locator('body')).not.toHaveClass(/lightbox-open/);
  });

  test('agrega al carrito y guarda en favoritos desde la ficha', async ({ page }) => {
    await page.goto('/producto.html?id=1');

    await page.locator('#product-add').click();
    await expect(page.locator('#toast')).toContainText('Producto agregado al carrito');
    await expect(page.locator('#cart-count')).toHaveText('1');
    await expect(page.locator('#cart-total')).toHaveText('USD 645');

    const favorite = page.locator('#product-favorite');
    await expect(favorite).toHaveAttribute('aria-pressed', 'false');
    await expect(favorite).toContainText('Guardar en favoritos');
    await favorite.click();
    await expect(favorite).toHaveAttribute('aria-pressed', 'true');
    await expect(favorite).toContainText('Guardado en favoritos');
    await expect(page.locator('#fav-count')).toHaveText('1');

    await page.reload();
    await expect(page.locator('#product-name')).toHaveText(
      'Combo 15 · taladro + atornillador + amoladora 20V'
    );
    await expect(page.locator('#cart-count')).toHaveText('1');
    await expect(page.locator('#product-favorite')).toHaveAttribute('aria-pressed', 'true');
  });

  test('muestra el agotado y un estado 404 claro', async ({ page }) => {
    await page.goto('/producto.html?id=4');
    await expect(page.locator('#product-name')).toHaveText('Combo 42V · amoladora, taladro y llave');
    await expect(page.locator('#product-stock')).toHaveText('Agotado');
    await expect(page.locator('#product-meta-stock')).toHaveText('Agotado');
    const add = page.locator('#product-add');
    await expect(add).toBeDisabled();
    await expect(add).toHaveText('Producto agotado');

    await page.goto('/producto.html?id=999');
    await expect(page.locator('#product-content')).toBeHidden();
    await expect(page.locator('#product-error')).toBeVisible();
    await expect(page.locator('#product-error-title')).toHaveText('No encontramos este producto');
    await expect(page.locator('#product-error-text')).toContainText('Volvé al catálogo');
    await expect(page).toHaveTitle('Producto no encontrado | FerreDemo');
    await expect(page.getByRole('link', { name: 'Ver todas las categorías' })).toBeVisible();

    await page.goto('/producto.html?id=no-es-un-numero');
    await expect(page.locator('#product-error')).toBeVisible();
  });
});
