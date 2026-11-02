import { expect, test } from './support/fixtures';
import { ADMIN, CLIENT, loginWithCredentials, signOutFromAccount } from './support/helpers';

test.describe('Acceso y cuentas', () => {
  test('el admin entra, ve su rol y el botón Panel', async ({ page }) => {
    await page.goto('/cuenta.html#ingresar');
    await page.getByRole('button', { name: 'Usar admin' }).click();
    await expect(page.locator('#login-email')).toHaveValue(ADMIN.email);
    await expect(page.locator('#login-password')).toHaveValue(ADMIN.password);
    await page.getByRole('button', { name: 'Ingresar', exact: true }).click();

    await expect(page.locator('#account-view')).toBeVisible();
    await expect(page.locator('#account-role')).toHaveText('Administrador');
    await expect(page.locator('#session-chip')).toHaveText('Admin');
    await expect(page.locator('#admin-shortcut')).toBeVisible();
    await expect(page.locator('#dashboard-admin-link')).toBeVisible();

    await page.goto('/');
    await expect(page.locator('#admin-link')).toBeVisible();
    await expect(page.locator('[data-action="login"] .action-btn__label')).toHaveText('Admin');
  });

  test('un cliente entra pero no ve el panel', async ({ page }) => {
    await loginWithCredentials(page, CLIENT);

    await expect(page.locator('#account-role')).toHaveText('Cliente');
    await expect(page.locator('#session-chip')).toHaveText('Cliente');
    await expect(page.locator('#admin-shortcut')).toBeHidden();

    await page.goto('/');
    await expect(page.locator('#admin-link')).toBeHidden();
    await expect(page.locator('[data-action="login"] .action-btn__label')).toHaveText('Cliente');
  });

  test('rechaza credenciales incorrectas sin iniciar sesión', async ({ page }) => {
    await page.goto('/cuenta.html#ingresar');
    await page.fill('#login-email', ADMIN.email);
    await page.fill('#login-password', 'clave-incorrecta');
    await page.getByRole('button', { name: 'Ingresar', exact: true }).click();

    await expect(page.locator('#auth-alert')).toBeVisible();
    await expect(page.locator('#auth-alert')).toContainText('Email o contraseña incorrectos.');
    await expect(page.locator('#account-view')).toBeHidden();
  });

  test('el registro crea la sesión al instante y permite volver a entrar', async ({ page }) => {
    const email = `registro-${Date.now()}@example.com`;
    const password = 'Prueba1234!';

    await page.goto('/cuenta.html');
    await page.locator('#tab-register').click();
    await page.fill('#register-name', 'Cliente Nuevo');
    await page.fill('#register-email', email);
    await page.fill('#register-password', password);
    await page.fill('#register-confirm', password);
    await page.check('#register-terms');
    await page.getByRole('button', { name: 'Crear cuenta' }).click();

    await expect(page.locator('#account-view')).toBeVisible();
    await expect(page.locator('#account-name')).toHaveText('Cliente Nuevo');
    await expect(page.locator('#account-email')).toHaveText(email);
    await expect(page.locator('#account-role')).toHaveText('Cliente');
    await expect(page.locator('#toast')).toContainText('Cuenta creada. Ya estás dentro.');

    await signOutFromAccount(page);
    await page.fill('#login-email', email);
    await page.fill('#login-password', password);
    await page.getByRole('button', { name: 'Ingresar', exact: true }).click();
    await expect(page.locator('#account-view')).toBeVisible();
    await expect(page.locator('#account-email')).toHaveText(email);
  });

  test('el registro valida la confirmación de contraseña', async ({ page }) => {
    await page.goto('/cuenta.html#registro');
    await page.fill('#register-name', 'Cliente Error');
    await page.fill('#register-email', `error-${Date.now()}@example.com`);
    await page.fill('#register-password', 'Prueba1234!');
    await page.fill('#register-confirm', 'OtraClave1234!');
    await page.check('#register-terms');
    await page.getByRole('button', { name: 'Crear cuenta' }).click();

    await expect(page.locator('#auth-alert')).toContainText('Las contraseñas no coinciden.');
    await expect(page.locator('#account-view')).toBeHidden();
  });

  test('la sesión se mantiene al recargar y se cierra desde la cuenta', async ({ page }) => {
    await loginWithCredentials(page, ADMIN);
    await page.reload();
    await expect(page.locator('#account-view')).toBeVisible();
    await expect(page.locator('#session-chip')).toHaveText('Admin');

    await page.goto('/');
    await expect(page.locator('#admin-link')).toBeVisible();
    await page.reload();
    await expect(page.locator('#admin-link')).toBeVisible();

    await page.goto('/cuenta.html');
    await signOutFromAccount(page);
    await expect(page.locator('#session-chip')).toHaveText('Sin sesión');
    await page.goto('/');
    await expect(page.locator('#admin-link')).toBeHidden();
  });

  test('el cambio de contraseña invalida la anterior', async ({ page }) => {
    const newPassword = 'NuevaClave1234!';
    await loginWithCredentials(page, ADMIN);

    await page.fill('#current-password', ADMIN.password);
    await page.fill('#new-password', newPassword);
    await page.fill('#confirm-password', newPassword);
    await page.getByRole('button', { name: 'Actualizar contraseña' }).click();
    await expect(page.locator('#password-alert')).toContainText('Contraseña actualizada correctamente.');

    await signOutFromAccount(page);
    await page.fill('#login-email', ADMIN.email);
    await page.fill('#login-password', ADMIN.password);
    await page.getByRole('button', { name: 'Ingresar', exact: true }).click();
    await expect(page.locator('#auth-alert')).toContainText('Email o contraseña incorrectos.');

    await page.fill('#login-password', newPassword);
    await page.getByRole('button', { name: 'Ingresar', exact: true }).click();
    await expect(page.locator('#account-view')).toBeVisible();
  });

  test('el admin puede abrir el panel y el cliente queda bloqueado', async ({ page }) => {
    await page.goto('/admin.html');
    await expect(page.locator('#admin-gate')).toBeVisible();
    await expect(page.locator('#gate-title')).toHaveText('Necesitás iniciar sesión');
    await expect(page.locator('#admin-shell')).toBeHidden();

    await loginWithCredentials(page, CLIENT);
    await page.goto('/admin.html');
    await expect(page.locator('#admin-gate')).toBeVisible();
    await expect(page.locator('#gate-title')).toHaveText('Esta cuenta no es administradora');
    await expect(page.locator('#admin-shell')).toBeHidden();

    await page.goto('/cuenta.html');
    await signOutFromAccount(page);
    await page.goto('/admin.html');
    await page.getByRole('button', { name: 'Entrar como admin demo' }).click();
    await expect(page.locator('#admin-shell')).toBeVisible();
    await expect(page.locator('#admin-user-name')).toHaveText('Admin FerroMax');
  });
});
