import { expect, test } from './support/fixtures';

test.describe('Portada y catálogo', () => {
  test('la portada muestra las 9 categorías y los destacados', async ({ page }) => {
    await page.goto('/');

    await expect(page.locator('#tiles .category-tile')).toHaveCount(9);
    await expect(page.locator('#menu .category-nav__link')).toHaveCount(9);
    const maquinas = page.locator('#tiles .category-tile', { hasText: 'Máquinas' });
    await expect(maquinas).toContainText('14 productos');
    await expect(
      page.locator('#tiles .category-tile', { hasText: 'Ferretería' })
    ).toContainText('2 productos');
    await expect(page.locator('#grid-combos .product-card')).toHaveCount(8);
    await expect(page.locator('#grid-nuevos .product-card')).toHaveCount(6);
    await expect(
      page.getByRole('heading', { name: 'Distribuidor oficial de herramientas a batería' })
    ).toBeVisible();

    await expect(page.locator('#grid-combos .product-card').first()).toContainText('FD1001');
    await expect(page.locator('#fav-count')).toHaveText('0');
    await expect(page.locator('#cart-count')).toHaveText('0');
  });

  test('la búsqueda del catálogo filtra y avisa cuando no hay resultados', async ({ page }) => {
    await page.goto('/categoria.html?q=taladro');
    await expect(page.locator('#category-grid')).not.toHaveAttribute('aria-busy', 'true');
    await expect(page.locator('#q')).toHaveValue('taladro');
    await expect(page.locator('#category-title')).toContainText('Resultados para');
    /* La búsqueda también mira la subcategoría: FD1016 pertenece a "Taladros". */
    await expect(page.locator('#results-count')).toHaveText('4 productos');
    for (const code of ['FD1001', 'FD1003', 'FD1004', 'FD1016']) {
      await expect(
        page.locator('#category-grid .product-card', { hasText: code })
      ).toBeVisible();
    }
    await expect(page.locator('#category-grid .product-card', { hasText: 'FD1002' })).toBeHidden();

    await page.goto('/categoria.html?q=producto-que-no-existe-123');
    await expect(page.locator('#search-empty')).toBeVisible();
    await expect(page.locator('#search-empty')).toContainText('No encontramos productos');
    await expect(page.locator('#results-count')).toHaveText('0 productos');
  });

  test('buscar desde la portada navega al catálogo', async ({ page }) => {
    await page.goto('/');
    await page.fill('#q', 'amoladora');
    await page.press('#q', 'Enter');

    await expect(page).toHaveURL(/categoria\.html\?q=amoladora$/);
    await expect(page.locator('#category-title')).toContainText('Resultados para');
    await expect(page.locator('#category-grid .product-card').first()).toBeVisible();
  });

  test('la navegación por categoría y subcategoría conserva los filtros', async ({ page }) => {
    await page.goto('/');
    await page.locator('#tiles .category-tile', { hasText: 'Ferretería' }).click();

    await expect(page).toHaveURL(/categoria\.html\?cat=ferreteria$/);
    await expect(page.locator('#category-title')).toHaveText('Ferretería');
    await expect(page.locator('#subcategory-list .subcategory-link')).toHaveCount(7);
    await expect(page.locator('#category-grid .product-card').first()).toBeVisible();

    await page.locator('#subcategory-list .subcategory-link', { hasText: 'Tornillería' }).click();
    await expect(page).toHaveURL(/cat=ferreteria&sub=tornilleria$/);
    await expect(page.locator('#category-title')).toHaveText('Tornillería');
    await expect(page.locator('#category-grid .product-card')).toHaveCount(1);
    await expect(page.locator('#category-grid .product-card')).toContainText('FD1021');
  });

  test('el orden por precio funciona en el catálogo', async ({ page }) => {
    await page.goto('/categoria.html?cat=herramientas');
    await expect(page.locator('#category-grid .product-card').first()).toBeVisible();

    await page.selectOption('#sort-select', 'price-asc');
    const prices = await page.locator('#category-grid .product-card__price').allInnerTexts();
    const numbers = prices.map((value) => Number(value.replace(/[^\d.,]/g, '').replace('.', '').replace(',', '.')));
    const sorted = [...numbers].sort((a, b) => a - b);
    expect(numbers).toEqual(sorted);
  });
});

test.describe('Carrito y favoritos', () => {
  test('agrega, cambia cantidades, calcula el total y persiste al recargar', async ({ page }) => {
    await page.goto('/');
    const combo = page.locator('#grid-combos .product-card', { hasText: 'FD1001' });
    await combo.getByRole('button', { name: 'Agregar al carrito' }).click();

    await expect(page.locator('#cart-count')).toHaveText('1');
    await expect(page.locator('#toast')).toContainText('Producto agregado al carrito');

    await page.locator('.action-btn[data-action="open-cart"]').click();
    const cart = page.locator('#cart');
    await expect(cart).toHaveAttribute('aria-hidden', 'false');
    await expect(page.locator('#cart-items')).toContainText('Combo 15');
    await expect(page.locator('#cart-drawer-total')).toHaveText('USD 645');

    await cart.getByRole('button', { name: /Agregar una unidad de Combo 15/ }).click();
    await expect(page.locator('#cart-count')).toHaveText('2');
    await expect(page.locator('#cart-drawer-total')).toHaveText('USD 1.290');

    await page.keyboard.press('Escape');
    await expect(cart).toHaveAttribute('aria-hidden', 'true');

    await page.reload();
    await expect(page.locator('#cart-count')).toHaveText('2');
    await expect(page.locator('#cart-total')).toHaveText('USD 1.290');

    await page.locator('.action-btn[data-action="open-cart"]').click();
    await page.getByRole('button', { name: 'Continuar' }).click();
    await expect(page.locator('#toast')).toContainText('Compra finalizada (demo)');
  });

  test('los favoritos se marcan y persisten en el navegador', async ({ page }) => {
    await page.goto('/');
    const favorite = page
      .locator('#grid-combos .product-card', { hasText: 'FD1001' })
      .locator('.favorite-btn');

    await expect(favorite).toHaveAttribute('aria-pressed', 'false');
    await favorite.click();
    await expect(favorite).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#fav-count')).toHaveText('1');

    await page.reload();
    const persisted = page
      .locator('#grid-combos .product-card', { hasText: 'FD1001' })
      .locator('.favorite-btn');
    await expect(persisted).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#fav-count')).toHaveText('1');

    await page.getByRole('button', { name: 'Ver favoritos' }).click();
    await expect(page.locator('#toast')).toContainText('Tenés 1 favorito');
  });
});

test.describe('Slider de portada', () => {
  test('avanza cada 5 segundos y se pausa al pasar el mouse', async ({ page }) => {
    await page.clock.install();
    await page.goto('/');

    const activeDot = page.locator('#dots .hero__dot[aria-current="true"]');
    await expect(activeDot).toHaveAttribute('data-slide', '0');

    await page.clock.fastForward(5_100);
    await expect(activeDot).toHaveAttribute('data-slide', '1');

    await page.locator('#hero').hover();
    await page.clock.fastForward(6_000);
    await expect(activeDot).toHaveAttribute('data-slide', '1');
  });

  test('permite navegar con flechas y puntos', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#dots .hero__dot')).toHaveCount(3);

    await page.getByRole('button', { name: 'Slide siguiente' }).click();
    await expect(page.locator('#dots .hero__dot[aria-current="true"]')).toHaveAttribute('data-slide', '1');

    await page.locator('#dots .hero__dot[data-slide="2"]').click();
    await expect(page.locator('#dots .hero__dot[aria-current="true"]')).toHaveAttribute('data-slide', '2');
  });

  test.describe('con movimiento reducido', () => {
    test.use({ reducedMotion: 'reduce' });

    test('no avanza automáticamente', async ({ page }) => {
      await page.clock.install();
      await page.goto('/');
      const activeDot = page.locator('#dots .hero__dot[aria-current="true"]');
      await expect(activeDot).toHaveAttribute('data-slide', '0');
      await page.clock.fastForward(12_000);
      await expect(activeDot).toHaveAttribute('data-slide', '0');
    });
  });
});

test.describe('Contacto', () => {
  test('el formulario confirma el envío sin recargar', async ({ page }) => {
    await page.goto('/#contacto');
    await page.fill('#cf-name', 'Cliente de prueba');
    await page.fill('#cf-email', 'cliente-prueba@example.com');
    await page.fill('#cf-message', 'Consulta de prueba');
    await page.locator('#contact-form').getByRole('button', { name: 'Enviar', exact: true }).click();
    await expect(page.locator('#toast')).toContainText('Gracias. Te contactaremos pronto.');
    await expect(page.locator('#cf-name')).toHaveValue('');
  });
});
