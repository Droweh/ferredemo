import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { expect, test } from './support/fixtures';
import { loginAsAdmin } from './support/helpers';

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

async function analyze(page: Page) {
  return new AxeBuilder({ page }).withTags(TAGS).analyze();
}

function expectNoViolations(results: Awaited<ReturnType<typeof analyze>>) {
  expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
}

test.describe('Accesibilidad', () => {
  test('la portada no tiene violaciones WCAG A/AA', async ({ page }) => {
    await page.goto('/');
    await page.locator('#grid-combos .product-card').first().waitFor();
    expectNoViolations(await analyze(page));
  });

  test('el catálogo no tiene violaciones WCAG A/AA', async ({ page }) => {
    await page.goto('/categoria.html?cat=maquinas');
    await page.locator('#category-grid .product-card').first().waitFor();
    expectNoViolations(await analyze(page));
  });

  test('la cuenta no tiene violaciones WCAG A/AA', async ({ page }) => {
    await page.goto('/cuenta.html#ingresar');
    expectNoViolations(await analyze(page));
  });

  test('el panel no tiene violaciones WCAG A/AA', async ({ page }) => {
    await loginAsAdmin(page);
    expectNoViolations(await analyze(page));
  });

  test('el carrito abierto es accesible y atrapa el foco', async ({ page }) => {
    await page.goto('/');
    await page.locator('#grid-combos .product-card').first().waitFor();
    await page.locator('.action-btn[data-action="open-cart"]').click();
    await expect(page.locator('#cart')).toHaveAttribute('aria-hidden', 'false');
    await expect(page.getByRole('button', { name: 'Cerrar carrito' })).toBeFocused();

    await page.keyboard.press('Shift+Tab');
    const focusedInside = await page.evaluate(() => document.querySelector('#cart').contains(document.activeElement));
    expect(focusedInside).toBe(true);

    await page.keyboard.press('Escape');
    await expect(page.locator('#cart')).toHaveAttribute('aria-hidden', 'true');
  });
});
