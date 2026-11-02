/* Tema claro/oscuro de FerreDemo.
   Sin preferencia guardada se sigue siempre al sistema. El switch fija una
   preferencia explícita y la conserva entre páginas y recargas. */
(function () {
  'use strict';

  var STORAGE_KEY = 'ferromax.theme.v1';
  var root = document.documentElement;
  var media = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  var listeners = new Set();
  var storedTheme = readStored();
  var systemTheme = media && media.matches ? 'dark' : 'light';

  function readStored() {
    try {
      var value = window.localStorage.getItem(STORAGE_KEY);
      return value === 'light' || value === 'dark' ? value : null;
    } catch (error) {
      return null;
    }
  }

  function current() {
    return storedTheme || systemTheme;
  }

  function metaColor(theme) {
    return theme === 'dark' ? '#0f1112' : '#f3f1ec';
  }

  function updateMeta(theme) {
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', metaColor(theme));
  }

  function updateControls(theme) {
    var dark = theme === 'dark';
    document.querySelectorAll('[data-theme-toggle]').forEach(function (button) {
      button.setAttribute('aria-checked', String(dark));
      button.setAttribute('aria-label', dark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro');
      button.title = dark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro';
    });
  }

  function emit(source) {
    var theme = current();
    updateControls(theme);
    updateMeta(theme);
    listeners.forEach(function (listener) {
      try {
        listener(theme, source);
      } catch (error) {
        // Un suscriptor no debe bloquear el cambio de tema.
      }
    });
    try {
      document.dispatchEvent(
        new CustomEvent('ferromax:themechange', {
          detail: { theme: theme, source: source },
        })
      );
    } catch (error) {
      // CustomEvent no está disponible en navegadores muy antiguos.
    }
  }

  function apply(source) {
    if (storedTheme) root.setAttribute('data-theme', storedTheme);
    else root.removeAttribute('data-theme');
    emit(source);
  }

  function set(theme, source) {
    if (theme !== 'light' && theme !== 'dark') return current();
    storedTheme = theme;
    try {
      window.localStorage.setItem(STORAGE_KEY, theme);
    } catch (error) {
      // Si el navegador bloquea localStorage, el tema sigue funcionando en esta página.
    }
    apply(source || 'manual');
    return current();
  }

  function clear() {
    storedTheme = null;
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch (error) {
      // Sin persistencia disponible.
    }
    apply('system');
    return current();
  }

  function toggle() {
    return set(current() === 'dark' ? 'light' : 'dark', 'toggle');
  }

  function onSystemChange(event) {
    systemTheme = event.matches ? 'dark' : 'light';
    if (!storedTheme) apply('system');
  }

  function bindControls() {
    document.querySelectorAll('[data-theme-toggle]').forEach(function (button) {
      if (button.dataset.themeBound === 'true') return;
      button.dataset.themeBound = 'true';
      button.addEventListener('click', toggle);
    });
    updateControls(current());
    updateMeta(current());
  }

  if (media) {
    if (typeof media.addEventListener === 'function') media.addEventListener('change', onSystemChange);
    else if (typeof media.addListener === 'function') media.addListener(onSystemChange);
  }

  apply('init');

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindControls, { once: true });
  } else {
    bindControls();
  }

  window.FerroMaxTheme = {
    key: STORAGE_KEY,
    current: current,
    set: set,
    toggle: toggle,
    clear: clear,
    subscribe: function (listener) {
      if (typeof listener !== 'function') return function () {};
      listeners.add(listener);
      return function () {
        listeners.delete(listener);
      };
    },
  };
})();
