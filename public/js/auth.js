/* Acceso, registro y cambio de contraseña de FerreDemo. */
(() => {
  'use strict';

  const backend = window.FerroMaxBackend;
  const config = window.FERROMAX_CONFIG || {};
  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => Array.from(document.querySelectorAll(selector));

  if (!backend) {
    const alert = $('#auth-alert');
    if (alert) {
      alert.hidden = false;
      alert.className = 'auth-alert is-error';
      alert.textContent = 'No pudimos cargar la conexión de datos. Revisá js/backend.js.';
    }
    return;
  }

  const elements = {
    authView: $('#auth-view'),
    accountView: $('#account-view'),
    authAlert: $('#auth-alert'),
    accountAlert: $('#account-alert'),
    passwordAlert: $('#password-alert'),
    loginForm: $('#login-form'),
    registerForm: $('#register-form'),
    passwordForm: $('#password-form'),
    tabs: $$('[data-auth-tab]'),
    tabLinks: $$('[data-auth-tab-link]'),
    sessionChip: $('#session-chip'),
    headerSignout: $('#header-signout'),
    adminShortcut: $('#admin-shortcut'),
    dashboardAdminLink: $('#dashboard-admin-link'),
    dashboardSignout: $('#dashboard-signout'),
    modeTags: [$('#mode-tag'), $('#mode-tag-session')],
    accountName: $('#account-name'),
    accountEmail: $('#account-email'),
    accountRole: $('#account-role'),
    accountMode: $('#account-mode'),
    accountAccess: $('#account-access'),
    captchaWrap: $('#captcha-wrap'),
    captchaNote: $('#captcha-note'),
    demobox: $('#demo-box'),
    toast: $('#toast'),
    registerNote: $('#register-note'),
    title: $('#account-view-title'),
  };

  const isLocal = backend.mode === 'local';
  const hasTurnstile = !isLocal && Boolean(config.turnstileSiteKey);
  const status = backend.getSetupStatus ? backend.getSetupStatus() : {};
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  function currentTheme() {
    if (window.FerroMaxTheme && typeof window.FerroMaxTheme.current === 'function') {
      return window.FerroMaxTheme.current();
    }
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  let session = null;
  let toastTimer = null;
  let captchaWidget = null;
  let turnstilePromise = null;

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (character) => {
      const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
      return map[character];
    });
  }

  function showAlert(element, message, type = 'info') {
    if (!element) return;
    element.className = `auth-alert is-${type}`;
    element.textContent = message;
    element.hidden = false;
  }

  function hideAlert(element) {
    if (!element) return;
    element.hidden = true;
    element.textContent = '';
    element.className = 'auth-alert';
  }

  function showToast(message) {
    if (!elements.toast) return;
    elements.toast.textContent = message;
    elements.toast.classList.add('is-visible');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => elements.toast.classList.remove('is-visible'), 2600);
  }

  function setBusy(form, busy) {
    form.classList.toggle('is-busy', busy);
    const submit = form.querySelector('[type="submit"]');
    if (submit) {
      submit.disabled = busy;
      if (busy) {
        submit.dataset.label = submit.textContent;
        submit.textContent = 'Procesando…';
      } else if (submit.dataset.label) {
        submit.textContent = submit.dataset.label;
        delete submit.dataset.label;
      }
    }
  }

  function switchTab(tab, updateHash = true) {
    const next = tab === 'register' ? 'register' : 'login';
    elements.tabs.forEach((button) => {
      const active = button.dataset.authTab === next;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-selected', String(active));
      button.tabIndex = active ? 0 : -1;
    });

    elements.loginForm.hidden = next !== 'login';
    elements.registerForm.hidden = next !== 'register';
    const kicker = $('#auth-kicker');
    if (kicker) kicker.textContent = next === 'login' ? 'Acceso de clientes' : 'Registro en segundos';

    hideAlert(elements.authAlert);
    const title = $('#account-title');
    if (title) title.textContent = next === 'login' ? 'Ingresá a tu cuenta' : 'Creá tu cuenta';
    if (updateHash && window.history && typeof window.history.replaceState === 'function') {
      window.history.replaceState(null, '', `#${next === 'login' ? 'ingresar' : 'registro'}`);
    }

    const field = next === 'login' ? $('#login-email') : $('#register-name');
    if (field && !reducedMotion.matches) field.focus({ preventScroll: true });
  }

  function updateModeUi() {
    const modeLabel = isLocal ? 'Demo local' : 'Supabase';
    elements.modeTags.forEach((tag) => {
      if (tag) tag.textContent = modeLabel;
    });

    if (elements.accountMode) {
      elements.accountMode.textContent = isLocal
        ? 'Demo local (localStorage + IndexedDB)'
        : 'Supabase (Auth + Postgres + Storage)';
    }
    if (elements.demobox) elements.demobox.hidden = !isLocal;
    if (elements.captchaWrap) elements.captchaWrap.hidden = !hasTurnstile;

    const currentPasswordField = $('#current-password-field');
    const currentPasswordInput = $('#current-password');
    const passwordNote = $('#password-note');
    if (currentPasswordField) currentPasswordField.hidden = !isLocal;
    if (currentPasswordInput) currentPasswordInput.required = isLocal;
    if (passwordNote && !isLocal) {
      passwordNote.textContent =
        'La sesión activa autoriza el cambio. Si no reconocés esta sesión, cerrá sesión y volvé a entrar.';
    }

    if (elements.registerNote) {
      elements.registerNote.textContent = isLocal
        ? 'La cuenta se crea al instante y queda guardada en este navegador. No se envía ningún correo.'
        : 'La cuenta se crea al instante; la confirmación por email está desactivada en Supabase.';
    }

    if (status.error) {
      showAlert(elements.authAlert, status.error, 'error');
    }
  }

  function renderSession(user) {
    session = user || null;
    const loggedIn = Boolean(session);

    if (elements.authView) elements.authView.hidden = loggedIn;
    if (elements.accountView) elements.accountView.hidden = !loggedIn;
    if (elements.headerSignout) elements.headerSignout.hidden = !loggedIn;
    if (elements.adminShortcut) elements.adminShortcut.hidden = !(loggedIn && session.isAdmin);
    if (elements.dashboardAdminLink) elements.dashboardAdminLink.hidden = !(loggedIn && session.isAdmin);

    if (elements.sessionChip) {
      if (!loggedIn) {
        elements.sessionChip.textContent = 'Sin sesión';
      } else if (session.isAdmin) {
        elements.sessionChip.textContent = 'Admin';
      } else {
        elements.sessionChip.textContent = (session.name || session.email || 'Cliente').split(/\s+/)[0];
      }
    }

    if (!loggedIn) return;

    if (elements.accountName) elements.accountName.textContent = session.name || 'Mi cuenta';
    if (elements.accountEmail) elements.accountEmail.textContent = session.email || '';
    if (elements.accountRole) elements.accountRole.textContent = session.isAdmin ? 'Administrador' : 'Cliente';
    if (elements.accountAccess) elements.accountAccess.textContent = session.isAdmin ? 'Administrador' : 'Cliente';
    if (elements.title) elements.title.textContent = session.isAdmin ? 'Cuenta de administración' : 'Mi cuenta';
  }

  function loadTurnstile() {
    if (window.turnstile) return Promise.resolve(window.turnstile);
    if (turnstilePromise) return turnstilePromise;

    turnstilePromise = new Promise((resolve, reject) => {
      const existing = document.querySelector('script[data-ferromax-turnstile]');
      const script = existing || document.createElement('script');
      const onLoad = () => {
        if (window.turnstile) resolve(window.turnstile);
        else reject(new Error('Turnstile no se inicializó.'));
      };
      script.addEventListener('load', onLoad, { once: true });
      script.addEventListener(
        'error',
        () => reject(new Error('No pudimos cargar Turnstile. Revisá tu conexión.')),
        { once: true }
      );

      if (!existing) {
        script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
        script.async = true;
        script.defer = true;
        script.dataset.ferromaxTurnstile = 'true';
        document.head.appendChild(script);
      }
    });

    return turnstilePromise;
  }

  async function setupTurnstile() {
    if (!hasTurnstile || captchaWidget !== null) return;
    const container = $('#turnstile-container');
    if (!container) return;

    try {
      await loadTurnstile();
      captchaWidget = window.turnstile.render(container, {
        sitekey: config.turnstileSiteKey,
        theme: currentTheme(),
        size: 'flexible',
        appearance: 'always',
      });
      if (elements.captchaNote) {
        elements.captchaNote.textContent = 'Protegido por Cloudflare Turnstile. Sin correos ni verificaciones adicionales.';
      }
    } catch (error) {
      if (elements.captchaWrap) elements.captchaWrap.hidden = true;
      showAlert(elements.authAlert, error.message, 'error');
    }
  }

  function refreshTurnstileTheme() {
    if (!hasTurnstile || captchaWidget === null || !window.turnstile) return;
    if (elements.authView && elements.authView.hidden) return;
    try {
      window.turnstile.remove(captchaWidget);
    } catch (error) {
      // Si el widget ya no existe, continuamos con el siguiente render.
    }
    captchaWidget = null;
    setupTurnstile();
  }

  function getCaptchaToken() {
    if (!hasTurnstile) return '';
    if (!window.turnstile || captchaWidget === null) {
      throw new Error('La verificación de seguridad todavía no está lista. Esperá un segundo y reintentá.');
    }
    const token = window.turnstile.getResponse(captchaWidget);
    if (!token) throw new Error('Completá la verificación de seguridad para continuar.');
    return token;
  }

  function resetCaptcha() {
    if (!hasTurnstile || !window.turnstile || captchaWidget === null) return;
    try {
      window.turnstile.reset(captchaWidget);
    } catch (error) {
      // Si el widget ya no existe, no bloqueamos el formulario.
    }
  }

  function validateEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
  }

  async function handleLogin(event) {
    event.preventDefault();
    hideAlert(elements.authAlert);

    const form = elements.loginForm;
    if (!form.reportValidity()) return;
    const email = $('#login-email').value.trim();
    const password = $('#login-password').value;
    if (!validateEmail(email)) {
      showAlert(elements.authAlert, 'Ingresá un email válido.', 'error');
      $('#login-email').focus();
      return;
    }

    let captchaToken;
    try {
      captchaToken = getCaptchaToken();
    } catch (error) {
      showAlert(elements.authAlert, error.message, 'error');
      return;
    }

    setBusy(form, true);
    try {
      const user = await backend.signIn({ email, password, captchaToken });
      if (!user) throw new Error('No pudimos iniciar la sesión. Reintentá.');
      renderSession(user);
      form.reset();
      showToast('Sesión iniciada');
    } catch (error) {
      showAlert(elements.authAlert, error.message, 'error');
      resetCaptcha();
    } finally {
      setBusy(form, false);
    }
  }

  async function handleRegister(event) {
    event.preventDefault();
    hideAlert(elements.authAlert);

    const form = elements.registerForm;
    if (!form.reportValidity()) return;

    const name = $('#register-name').value.trim();
    const email = $('#register-email').value.trim();
    const password = $('#register-password').value;
    const confirm = $('#register-confirm').value;

    if (name.length < 2) {
      showAlert(elements.authAlert, 'Ingresá tu nombre.', 'error');
      $('#register-name').focus();
      return;
    }
    if (!validateEmail(email)) {
      showAlert(elements.authAlert, 'Ingresá un email válido.', 'error');
      $('#register-email').focus();
      return;
    }
    if (password.length < 8) {
      showAlert(elements.authAlert, 'La contraseña debe tener al menos 8 caracteres.', 'error');
      $('#register-password').focus();
      return;
    }
    if (password !== confirm) {
      showAlert(elements.authAlert, 'Las contraseñas no coinciden.', 'error');
      $('#register-confirm').focus();
      return;
    }

    let captchaToken;
    try {
      captchaToken = getCaptchaToken();
    } catch (error) {
      showAlert(elements.authAlert, error.message, 'error');
      return;
    }

    setBusy(form, true);
    try {
      const user = await backend.signUp({ name, email, password, captchaToken });
      if (!user) throw new Error('No pudimos crear la cuenta. Reintentá.');
      renderSession(user);
      form.reset();
      showToast('Cuenta creada. Ya estás dentro.');
    } catch (error) {
      showAlert(elements.authAlert, error.message, 'error');
      resetCaptcha();
    } finally {
      setBusy(form, false);
    }
  }

  async function handlePasswordUpdate(event) {
    event.preventDefault();
    hideAlert(elements.passwordAlert);

    const form = elements.passwordForm;
    if (!form.reportValidity()) return;

    const currentPassword = $('#current-password').value;
    const password = $('#new-password').value;
    const confirmPassword = $('#confirm-password').value;

    if (password.length < 8) {
      showAlert(elements.passwordAlert, 'La nueva contraseña debe tener al menos 8 caracteres.', 'error');
      return;
    }
    if (password !== confirmPassword) {
      showAlert(elements.passwordAlert, 'Las contraseñas nuevas no coinciden.', 'error');
      return;
    }
    if (!isLocal && password === currentPassword) {
      showAlert(elements.passwordAlert, 'La nueva contraseña tiene que ser distinta de la actual.', 'error');
      return;
    }

    setBusy(form, true);
    try {
      await backend.updatePassword({ currentPassword, password });
      form.reset();
      showAlert(elements.passwordAlert, 'Contraseña actualizada correctamente.', 'success');
    } catch (error) {
      showAlert(elements.passwordAlert, error.message, 'error');
    } finally {
      setBusy(form, false);
    }
  }

  async function handleSignOut() {
    const buttons = [elements.headerSignout, elements.dashboardSignout].filter(Boolean);
    buttons.forEach((button) => {
      button.disabled = true;
    });
    try {
      await backend.signOut();
      renderSession(null);
      switchTab('login');
      resetCaptcha();
      await setupTurnstile();
      showToast('Sesión cerrada');
    } catch (error) {
      showToast(error.message);
    } finally {
      buttons.forEach((button) => {
        button.disabled = false;
      });
    }
  }

  function initPasswordToggles() {
    document.addEventListener('click', (event) => {
      const toggle = event.target.closest('[data-toggle-password]');
      if (!toggle) return;
      const input = document.getElementById(toggle.dataset.togglePassword);
      if (!input) return;
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      toggle.textContent = show ? 'Ocultar' : 'Ver';
      toggle.setAttribute('aria-label', show ? 'Ocultar contraseña' : 'Ver contraseña');
    });
  }

  function initDemoCredentials() {
    $$('[data-demo]').forEach((button) => {
      button.addEventListener('click', () => {
        const isAdmin = button.dataset.demo === 'admin';
        switchTab('login');
        $('#login-email').value = isAdmin ? 'admin@ferredemo.com' : 'cliente@ferredemo.com';
        $('#login-password').value = isAdmin ? 'Admin1234!' : 'Cliente1234!';
        showAlert(
          elements.authAlert,
          isAdmin
            ? 'Credenciales de administrador cargadas. Presioná Ingresar.'
            : 'Credenciales de cliente cargadas. Presioná Ingresar.',
          'info'
        );
        const submit = elements.loginForm.querySelector('[type="submit"]');
        if (submit) submit.focus();
      });
    });
  }

  function initTabs() {
    elements.tabs.forEach((button) => {
      button.addEventListener('click', () => switchTab(button.dataset.authTab));
    });
    elements.tabLinks.forEach((button) => {
      button.addEventListener('click', () => switchTab(button.dataset.authTabLink));
    });
  }

  function initForms() {
    elements.loginForm.addEventListener('submit', handleLogin);
    elements.registerForm.addEventListener('submit', handleRegister);
    elements.passwordForm.addEventListener('submit', handlePasswordUpdate);
    elements.headerSignout.addEventListener('click', handleSignOut);
    elements.dashboardSignout.addEventListener('click', handleSignOut);
  }

  async function init() {
    updateModeUi();
    initTabs();
    initForms();
    initPasswordToggles();
    initDemoCredentials();

    const hash = window.location.hash.replace('#', '');
    if (hash === 'registro') switchTab('register', false);
    else switchTab('login', false);

    if (status.error) {
      renderSession(null);
      return;
    }

    try {
      const user = await backend.getSession();
      renderSession(user);
      if (!user) await setupTurnstile();
      else if (elements.sessionChip) {
        const alert = elements.accountAlert;
        if (alert) hideAlert(alert);
      }
    } catch (error) {
      renderSession(null);
      showAlert(elements.authAlert, error.message, 'error');
    }

    backend.onAuthChange((user) => {
      if (user) {
        renderSession(user);
      } else if (session) {
        renderSession(null);
        switchTab('login');
        resetCaptcha();
      }
    });

    if (window.FerroMaxTheme && typeof window.FerroMaxTheme.subscribe === 'function') {
      window.FerroMaxTheme.subscribe(() => refreshTurnstileTheme());
    }
  }

  init();
})();
