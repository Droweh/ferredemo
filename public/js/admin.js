/* Panel de administración de FerroMax: catálogo, stock, precios, fotos,
   papelera, historial y restauración de la demo. */
(() => {
  'use strict';

  const backend = window.FerroMaxBackend;
  const data = window.FERROMAX;

  if (!backend || !data) {
    document.addEventListener('DOMContentLoaded', () => {
      const box = document.querySelector('#admin-loading');
      if (box) box.innerHTML = '<h1 class="admin-gate__title">No pudimos iniciar el panel</h1><p class="admin-gate__text">Revisá los archivos js/config.js y js/backend.js.</p>';
    });
    return;
  }

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => Array.from(document.querySelectorAll(selector));
  const categories = data.categories;
  const categoryById = new Map(categories.map((category) => [category.id, category]));
  const maxImages = backend.maxImages || 5;
  const isLocal = backend.mode === 'local';
  const status = backend.getSetupStatus ? backend.getSetupStatus() : {};

  const elements = {
    loading: $('#admin-loading'),
    gate: $('#admin-gate'),
    gateKicker: $('#gate-kicker'),
    gateTitle: $('#gate-title'),
    gateText: $('#gate-text'),
    gateNote: $('#gate-note'),
    gateLogin: $('#gate-login'),
    gateDemoLogin: $('#gate-demo-login'),
    shell: $('#admin-shell'),
    adminMode: $('#admin-mode'),
    adminModeDetail: $('#admin-mode-detail'),
    adminDate: $('#admin-date'),
    adminUser: $('#admin-user'),
    adminUserName: $('#admin-user-name'),
    adminSignout: $('#admin-signout'),
    adminAlert: $('#admin-alert'),
    localNote: $('#admin-local-note'),
    statTotal: $('#stat-total'),
    statPublished: $('#stat-published'),
    statOut: $('#stat-out'),
    statPhotos: $('#stat-photos'),
    statTrash: $('#stat-trash'),
    tabProductsCount: $('#tab-products-count'),
    tabTrashCount: $('#tab-trash-count'),
    tabs: $$('[data-admin-tab]'),
    views: {
      products: $('#products-view'),
      trash: $('#trash-view'),
      history: $('#history-view'),
    },
    productsBody: $('#products-body'),
    productsEmpty: $('#products-empty'),
    trashBody: $('#trash-body'),
    trashEmpty: $('#trash-empty'),
    historyList: $('#history-list'),
    historyEmpty: $('#history-empty'),
    adminSearch: $('#admin-search'),
    statusFilter: $('#admin-status-filter'),
    resultsCount: $('#admin-results-count'),
    refreshHistory: $('#refresh-history'),
    resetDemo: $('#reset-demo'),
    newProduct: $('#new-product'),
    productDialog: $('#product-dialog'),
    productForm: $('#product-form'),
    dialogKicker: $('#product-dialog-kicker'),
    dialogTitle: $('#product-dialog-title'),
    editorAlert: $('#editor-alert'),
    productCode: $('#product-code'),
    productName: $('#product-name'),
    productCategory: $('#product-category'),
    productSubcategory: $('#product-subcategory'),
    productCollection: $('#product-collection'),
    productIcon: $('#product-icon'),
    productPrice: $('#product-price'),
    productOldPrice: $('#product-old-price'),
    productStock: $('#product-stock'),
    productStatus: $('#product-status'),
    productDescription: $('#product-description'),
    photoInput: $('#photo-input'),
    editorPhotos: $('#editor-photos'),
    editorPhotosNote: $('#editor-photos-note'),
    editorUploadButton: $('#editor-upload-button'),
    saveProduct: $('#save-product'),
    confirmDialog: $('#confirm-dialog'),
    confirmTitle: $('#confirm-title'),
    confirmText: $('#confirm-text'),
    confirmWarning: $('#confirm-warning'),
    confirmAccept: $('#confirm-accept'),
    toast: $('#toast'),
  };

  const state = {
    session: null,
    products: [],
    audit: [],
    view: 'products',
    editingId: null,
    editorProduct: null,
    pendingPhotos: [],
    search: '',
    statusFilter: 'all',
    busy: false,
  };

  let toastTimer = null;

  const escapeHtml = (value) =>
    String(value == null ? '' : value).replace(/[&<>"']/g, (character) => {
      const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
      return map[character];
    });

  const icon = (name, className = '') =>
    `<svg class="icon ${className}" aria-hidden="true" focusable="false"><use href="#i-${name}"></use></svg>`;

  const money = (value) => `USD ${new Intl.NumberFormat('es-UY', { maximumFractionDigits: 2 }).format(Number(value) || 0)}`;

  const formatDate = (value, withTime = false) => {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return new Intl.DateTimeFormat('es-UY', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
    }).format(date);
  };

  const normalizeText = (value) =>
    String(value)
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');

  const photoUid = () => {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
      return window.crypto.randomUUID();
    }
    return `photo-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  };

  const activeProducts = () => state.products.filter((product) => !product.deletedAt);
  const trashedProducts = () => state.products.filter((product) => product.deletedAt);

  const categoryName = (product) => {
    const category = categoryById.get(product.category);
    return category ? category.name : product.category || '—';
  };

  const subcategoryName = (product) => {
    const category = categoryById.get(product.category);
    if (!category) return '';
    const subcategory = category.children.find((child) => child.id === product.subcategory);
    return subcategory ? subcategory.name : '';
  };

  const coverOf = (product) => {
    const images = Array.isArray(product.images) ? product.images : [];
    return images.find((image) => image.isCover) || images[0] || null;
  };

  function showToast(message) {
    if (!elements.toast) return;
    elements.toast.textContent = message;
    elements.toast.classList.add('is-visible');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => elements.toast.classList.remove('is-visible'), 2800);
  }

  function showAlert(message, type = 'error') {
    if (!elements.adminAlert) return;
    elements.adminAlert.className = `admin-alert${type === 'success' ? ' is-success' : type === 'info' ? ' is-info' : ''}`;
    elements.adminAlert.textContent = message;
    elements.adminAlert.hidden = false;
  }

  function hideAlert() {
    if (!elements.adminAlert) return;
    elements.adminAlert.hidden = true;
    elements.adminAlert.textContent = '';
  }

  function showEditorAlert(message) {
    if (!elements.editorAlert) return;
    elements.editorAlert.textContent = message;
    elements.editorAlert.hidden = false;
  }

  function hideEditorAlert() {
    if (!elements.editorAlert) return;
    elements.editorAlert.hidden = true;
    elements.editorAlert.textContent = '';
  }

  function setBusy(form, busy) {
    if (!form) return;
    form.classList.toggle('is-busy', busy);
    const submit = form.querySelector('[type="submit"]');
    if (submit) {
      submit.disabled = busy;
      if (busy) {
        submit.dataset.label = submit.textContent;
        submit.textContent = 'Guardando…';
      } else if (submit.dataset.label) {
        submit.textContent = submit.dataset.label;
        delete submit.dataset.label;
      }
    }
  }

  function updateModeUi() {
    const modeLabel = isLocal ? 'Demo local' : 'Supabase';
    if (elements.adminMode) elements.adminMode.textContent = modeLabel;
    if (elements.adminModeDetail) {
      elements.adminModeDetail.textContent = isLocal
        ? 'Demo local · datos en este navegador'
        : 'Supabase · catálogo en línea';
    }
    if (elements.localNote) elements.localNote.hidden = !isLocal;
    if (elements.gateDemoLogin) elements.gateDemoLogin.hidden = !isLocal;

    if (elements.adminDate) {
      const text = new Intl.DateTimeFormat('es-UY', {
        weekday: 'long',
        day: '2-digit',
        month: 'long',
        year: 'numeric',
      }).format(new Date());
      elements.adminDate.textContent = text.charAt(0).toUpperCase() + text.slice(1);
    }
  }

  function renderHeader(user) {
    if (elements.adminUser) {
      elements.adminUser.hidden = !user;
      if (user && elements.adminUserName) {
        elements.adminUserName.textContent = user.name || user.email;
      }
    }
    if (elements.adminSignout) elements.adminSignout.hidden = !user;
  }

  function showGate(kind) {
    if (elements.loading) elements.loading.hidden = true;
    if (elements.shell) elements.shell.hidden = true;
    if (!elements.gate) return;
    elements.gate.hidden = false;

    if (kind === 'login') {
      elements.gateKicker.textContent = 'Acceso restringido';
      elements.gateTitle.textContent = 'Necesitás iniciar sesión';
      elements.gateText.textContent = 'El panel solo está disponible para la cuenta administradora de FerroMax.';
      elements.gateLogin.href = 'cuenta.html#ingresar';
      elements.gateLogin.textContent = 'Iniciar sesión';
      elements.gateNote.textContent = isLocal
        ? 'Demo local: admin@ferromax.com / Admin1234!'
        : 'Ingresá con la cuenta que tiene el rol admin en app_metadata.';
      if (elements.gateDemoLogin) elements.gateDemoLogin.hidden = !isLocal;
    } else if (kind === 'denied') {
      elements.gateKicker.textContent = 'Permisos insuficientes';
      elements.gateTitle.textContent = 'Esta cuenta no es administradora';
      elements.gateText.textContent = 'Cerrá sesión desde Mi cuenta y volvé a entrar con la cuenta de administración.';
      elements.gateLogin.href = 'cuenta.html';
      elements.gateLogin.textContent = 'Ir a mi cuenta';
      elements.gateNote.textContent = isLocal
        ? 'Usá “Entrar como admin demo” o las credenciales admin@ferromax.com / Admin1234!'
        : 'El rol se asigna en Supabase (app_metadata). Cerrá sesión y volvé a entrar después de asignarlo.';
      if (elements.gateDemoLogin) elements.gateDemoLogin.hidden = !isLocal;
    } else {
      elements.gateKicker.textContent = 'Panel / Error';
      elements.gateTitle.textContent = 'No pudimos abrir el panel';
      elements.gateText.textContent = kind || 'Revisá la configuración de Supabase y volvé a intentar.';
      elements.gateLogin.href = 'admin.html';
      elements.gateLogin.textContent = 'Reintentar';
      elements.gateNote.textContent = 'Si el proyecto estuvo pausado, esperá unos segundos y recargá.';
      if (elements.gateDemoLogin) elements.gateDemoLogin.hidden = true;
    }
  }

  function showShell() {
    if (elements.loading) elements.loading.hidden = true;
    if (elements.gate) elements.gate.hidden = true;
    if (elements.shell) elements.shell.hidden = false;
  }

  async function checkAccess() {
    hideAlert();
    if (elements.loading) elements.loading.hidden = false;
    if (elements.gate) elements.gate.hidden = true;
    if (elements.shell) elements.shell.hidden = true;

    if (status.error) {
      showGate(status.error);
      return;
    }

    let user = null;
    try {
      user = await backend.getSession();
    } catch (error) {
      showGate(error.message);
      return;
    }

    state.session = user;
    renderHeader(user);

    if (!user) {
      showGate('login');
      return;
    }
    if (!user.isAdmin) {
      showGate('denied');
      return;
    }

    showShell();
    await loadData();
  }

  async function loadData(silent = false) {
    hideAlert();
    try {
      state.products = await backend.admin.getProducts();
      renderStats();
      renderProducts();
      renderTrash();
      await loadAudit(false);
      if (!silent) showToast('Catálogo actualizado');
    } catch (error) {
      showAlert(error.message);
      if (!state.products.length) {
        showToast(error.message);
      }
    }
  }

  async function loadAudit(verbose = false) {
    try {
      state.audit = await backend.admin.getAudit();
      renderHistory();
    } catch (error) {
      state.audit = [];
      renderHistory(error.message);
      if (verbose) showToast(error.message);
    }
  }

  function renderStats() {
    const active = activeProducts();
    const published = active.filter((product) => product.status === 'published');
    const out = active.filter((product) => Number(product.stock || 0) <= 0);
    const photos = active.reduce((sum, product) => sum + (product.images ? product.images.length : 0), 0);
    const trash = trashedProducts();

    if (elements.statTotal) elements.statTotal.textContent = String(active.length);
    if (elements.statPublished) elements.statPublished.textContent = String(published.length);
    if (elements.statOut) elements.statOut.textContent = String(out.length);
    if (elements.statPhotos) elements.statPhotos.textContent = String(photos);
    if (elements.statTrash) elements.statTrash.textContent = String(trash.length);
    if (elements.tabProductsCount) elements.tabProductsCount.textContent = String(active.length);
    if (elements.tabTrashCount) elements.tabTrashCount.textContent = String(trash.length);
  }

  function productThumb(product) {
    const cover = coverOf(product);
    if (cover && cover.url) {
      return `<span class="admin-product__thumb"><img src="${escapeHtml(cover.url)}" alt="" loading="lazy" decoding="async"></span>`;
    }
    return `<span class="admin-product__thumb">${icon(product.icon || 'toolbox')}</span>`;
  }

  function renderProducts() {
    if (!elements.productsBody) return;
    const term = normalizeText(state.search);
    let list = activeProducts();

    if (state.statusFilter === 'published') {
      list = list.filter((product) => product.status === 'published');
    } else if (state.statusFilter === 'hidden') {
      list = list.filter((product) => product.status !== 'published');
    } else if (state.statusFilter === 'out') {
      list = list.filter((product) => Number(product.stock || 0) <= 0);
    }

    if (term) {
      list = list.filter((product) => {
        const haystack = normalizeText(
          [product.name, product.code, categoryName(product), subcategoryName(product)].join(' ')
        );
        return haystack.includes(term);
      });
    }

    list.sort((a, b) => Number(a.id) - Number(b.id));

    elements.productsBody.innerHTML = list
      .map((product) => {
        const stock = Number(product.stock || 0);
        const isPublished = product.status === 'published';
        const oldPrice = Number(product.oldPrice || 0);
        return `
          <tr data-product-id="${product.id}">
            <td>
              <div class="admin-product">
                ${productThumb(product)}
                <div>
                  <p class="admin-product__name" title="${escapeHtml(product.name)}">${escapeHtml(product.name)}</p>
                  <p class="admin-product__code">${escapeHtml(product.code)}</p>
                </div>
              </div>
            </td>
            <td>${escapeHtml(categoryName(product))}${subcategoryName(product) ? `<span class="admin-product__code">${escapeHtml(subcategoryName(product))}</span>` : ''}</td>
            <td><span class="admin-price">${money(product.price)}${oldPrice > product.price ? `<small>${money(oldPrice)}</small>` : ''}</span></td>
            <td><span class="admin-stock${stock <= 0 ? ' is-out' : ''}">${stock}</span></td>
            <td><span class="admin-photo-count">${icon('image')} ${product.images ? product.images.length : 0}/${maxImages}</span></td>
            <td><span class="admin-status ${isPublished ? 'is-published' : 'is-hidden'}">${isPublished ? 'Publicado' : 'Oculto'}</span></td>
            <td>
              <div class="admin-actions">
                <button class="admin-icon-btn" type="button" data-row-action="edit" data-id="${product.id}" title="Editar producto" aria-label="Editar ${escapeHtml(product.name)}">${icon('edit')}</button>
                <button class="admin-icon-btn" type="button" data-row-action="toggle" data-id="${product.id}" title="${isPublished ? 'Ocultar de la tienda' : 'Publicar en la tienda'}" aria-label="${isPublished ? 'Ocultar' : 'Publicar'} ${escapeHtml(product.name)}">${icon('eye')}</button>
                <button class="admin-icon-btn is-danger" type="button" data-row-action="delete" data-id="${product.id}" title="Enviar a papelera" aria-label="Eliminar ${escapeHtml(product.name)}">${icon('trash')}</button>
              </div>
            </td>
          </tr>`;
      })
      .join('');

    if (elements.productsEmpty) elements.productsEmpty.hidden = list.length > 0;
    if (elements.resultsCount) {
      elements.resultsCount.textContent = `${list.length} ${list.length === 1 ? 'producto' : 'productos'}`;
    }
  }

  function renderTrash() {
    if (!elements.trashBody) return;
    const list = trashedProducts().sort((a, b) => String(b.deletedAt).localeCompare(String(a.deletedAt)));

    elements.trashBody.innerHTML = list
      .map(
        (product) => `
          <tr data-product-id="${product.id}">
            <td>
              <div class="admin-product">
                ${productThumb(product)}
                <div>
                  <p class="admin-product__name" title="${escapeHtml(product.name)}">${escapeHtml(product.name)}</p>
                  <p class="admin-product__code">${escapeHtml(product.code)}</p>
                </div>
              </div>
            </td>
            <td>${escapeHtml(categoryName(product))}</td>
            <td><span class="admin-price">${money(product.price)}</span></td>
            <td><span class="admin-date">${formatDate(product.deletedAt, true)}</span></td>
            <td>
              <div class="admin-actions">
                <button class="admin-icon-btn" type="button" data-row-action="restore" data-id="${product.id}" title="Restaurar producto" aria-label="Restaurar ${escapeHtml(product.name)}">${icon('restore')}</button>
                <button class="admin-icon-btn is-danger" type="button" data-row-action="purge" data-id="${product.id}" title="Eliminar definitivamente" aria-label="Eliminar definitivamente ${escapeHtml(product.name)}">${icon('trash')}</button>
              </div>
            </td>
          </tr>`
      )
      .join('');

    if (elements.trashEmpty) elements.trashEmpty.hidden = list.length > 0;
  }

  const actionLabels = {
    INSERT: 'Alta',
    UPDATE: 'Edición',
    SOFT_DELETE: 'Papelera',
    DELETE: 'Borrado',
    RESTORE: 'Restauro',
    RESET_DEMO: 'Reset',
    IMAGES_UPLOAD: 'Fotos',
    IMAGE_DELETE: 'Foto',
    IMAGE_UPDATE: 'Foto',
  };

  function productSnapshotLabel(snapshot) {
    if (!snapshot || Array.isArray(snapshot)) return '';
    return snapshot.name || snapshot.code || '';
  }

  function snapshotPrice(snapshot) {
    if (!snapshot) return null;
    if (snapshot.price != null) return Number(snapshot.price);
    if (snapshot.price_cents != null) return Number(snapshot.price_cents) / 100;
    return null;
  }

  function describeAudit(entry) {
    const before = entry.before || {};
    const after = entry.after || {};
    const afterName = productSnapshotLabel(after);
    const beforeName = productSnapshotLabel(before);
    const id = entry.entity_id ? `#${entry.entity_id}` : '';

    switch (entry.action) {
      case 'INSERT':
        return afterName ? `Creó ${afterName} (${after.code || 'sin código'})` : `Creó el producto ${id}`;
      case 'UPDATE': {
        const changes = [];
        if (before.status !== after.status && after.status) {
          changes.push(`estado: ${before.status === 'published' ? 'publicado' : 'oculto'} → ${after.status === 'published' ? 'publicado' : 'oculto'}`);
        }
        const previousPrice = snapshotPrice(before);
        const nextPrice = snapshotPrice(after);
        if (previousPrice != null && nextPrice != null && previousPrice !== nextPrice) {
          changes.push(`precio: ${money(previousPrice)} → ${money(nextPrice)}`);
        }
        if (before.stock != null && after.stock != null && Number(before.stock) !== Number(after.stock)) {
          changes.push(`stock: ${before.stock} → ${after.stock}`);
        }
        if (before.name && after.name && before.name !== after.name) {
          changes.push('nombre actualizado');
        }
        return changes.length
          ? `${afterName || beforeName || `Producto ${id}`}: ${changes.join(' · ')}`
          : `Actualizó ${afterName || beforeName || `el producto ${id}`}`;
      }
      case 'SOFT_DELETE':
        return `Envió a papelera ${beforeName || `el producto ${id}`}`;
      case 'RESTORE':
        return `Restauró ${afterName || beforeName || `el producto ${id}`}`;
      case 'DELETE':
        return `Eliminó definitivamente ${beforeName || `el producto ${id}`}`;
      case 'RESET_DEMO':
        return 'Restauró los 32 productos y eliminó las fotos cargadas.';
      case 'IMAGES_UPLOAD':
        return `Agregó fotos al producto ${id}`;
      case 'IMAGE_DELETE':
        return `Eliminó una foto del producto ${id}`;
      case 'IMAGE_UPDATE':
        return `Actualizó las fotos del producto ${id}`;
      default:
        return `${entry.action || 'Cambio'} en ${entry.entity || 'catálogo'} ${id}`;
    }
  }

  function renderHistory(errorMessage = '') {
    if (!elements.historyList) return;
    if (errorMessage) {
      elements.historyList.innerHTML = '';
      if (elements.historyEmpty) {
        elements.historyEmpty.hidden = false;
        elements.historyEmpty.textContent = errorMessage;
      }
      return;
    }

    const list = state.audit
      .slice()
      .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
      .slice(0, 40);

    elements.historyList.innerHTML = list
      .map((entry) => {
        const action = actionLabels[entry.action] || entry.action || 'Cambio';
        const tone =
          entry.action === 'INSERT'
            ? ' is-insert'
            : entry.action === 'DELETE' || entry.action === 'SOFT_DELETE'
              ? ' is-delete'
              : '';
        const user = entry.user_id ? `Usuario ${String(entry.user_id).slice(0, 8)}` : 'Sistema';
        return `
          <article class="history-item">
            <span class="history-item__action${tone}">${escapeHtml(action)}</span>
            <div>
              <p class="history-item__title">${escapeHtml(describeAudit(entry))}</p>
              <p class="history-item__detail">${escapeHtml(user)} · ${escapeHtml(entry.entity || 'catálogo')}</p>
            </div>
            <time class="history-item__time" datetime="${escapeHtml(entry.created_at || '')}">${formatDate(entry.created_at, true)}</time>
          </article>`;
      })
      .join('');

    if (elements.historyEmpty) {
      elements.historyEmpty.hidden = list.length > 0;
      elements.historyEmpty.textContent = 'Todavía no hay cambios registrados.';
    }
  }

  function switchView(view) {
    const next = ['products', 'trash', 'history'].includes(view) ? view : 'products';
    state.view = next;
    elements.tabs.forEach((button) => {
      const active = button.dataset.adminTab === next;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-selected', String(active));
    });
    Object.entries(elements.views).forEach(([key, panel]) => {
      if (panel) panel.hidden = key !== next;
    });
    if (next === 'history') loadAudit();
  }

  function populateCategories() {
    if (!elements.productCategory) return;
    elements.productCategory.innerHTML = categories
      .map((category) => `<option value="${category.id}">${escapeHtml(category.name)}</option>`)
      .join('');
  }

  function populateIcons() {
    if (!elements.productIcon) return;
    const labels = {
      toolbox: 'Caja de herramientas',
      drill: 'Taladro',
      grinder: 'Amoladora',
      driver: 'Atornillador',
      wrench: 'Llave',
      screw: 'Tornillo',
      lock: 'Candado',
      battery: 'Batería',
      spray: 'Hidrolavadora / rociador',
      level: 'Nivel',
      sprout: 'Jardín',
      gear: 'Máquina',
      bulb: 'Lámpara',
      bolt: 'Electricidad',
      roller: 'Pintura',
      house: 'Casa',
      hose: 'Manguera',
    };
    const names = Array.from(new Set(data.products.map((product) => product.icon).filter(Boolean)));
    ['toolbox', 'drill', 'grinder', 'driver', 'wrench', 'screw', 'lock', 'battery', 'spray', 'level', 'sprout', 'gear', 'bulb', 'bolt', 'roller', 'house', 'hose'].forEach((name) => {
      if (!names.includes(name)) names.push(name);
    });
    elements.productIcon.innerHTML = names
      .map((name) => `<option value="${name}">${escapeHtml(labels[name] || name)}</option>`)
      .join('');
  }

  function updateSubcategories(selected = '') {
    if (!elements.productCategory || !elements.productSubcategory) return;
    const category = categoryById.get(elements.productCategory.value);
    const children = category ? category.children : [];
    elements.productSubcategory.innerHTML = [
      '<option value="">Sin subcategoría</option>',
      ...children.map((child) => `<option value="${child.id}">${escapeHtml(child.name)}</option>`),
    ].join('');
    elements.productSubcategory.disabled = children.length === 0;
    if (selected && children.some((child) => child.id === selected)) {
      elements.productSubcategory.value = selected;
    }
  }

  function nextProductCode() {
    const max = state.products.reduce((highest, product) => {
      const match = /^FM(\d+)$/.exec(String(product.code || ''));
      return match ? Math.max(highest, Number(match[1])) : highest;
    }, 1000);
    return `FM${max + 1}`;
  }

  function clearPendingPhotos() {
    state.pendingPhotos.forEach((photo) => {
      try {
        URL.revokeObjectURL(photo.url);
      } catch (error) {
        // El navegador puede haber liberado ya la URL.
      }
    });
    state.pendingPhotos = [];
  }

  function resetProductForm() {
    elements.productForm.reset();
    hideEditorAlert();
    clearPendingPhotos();
    if (elements.photoInput) elements.photoInput.value = '';
    if (elements.editorPhotos) elements.editorPhotos.innerHTML = '';
    if (elements.editorPhotosNote) elements.editorPhotosNote.textContent = 'Podés agregar hasta 5 fotos. Se subirán al guardar.';
    if (elements.productSubcategory) elements.productSubcategory.innerHTML = '<option value="">Sin subcategoría</option>';
  }

  function fillProductForm(product) {
    const editing = Boolean(product);
    elements.dialogKicker.textContent = editing ? 'Catálogo / Editar' : 'Catálogo / Nuevo';
    elements.dialogTitle.textContent = editing ? 'Editar producto' : 'Nuevo producto';
    state.editingId = editing ? product.id : null;
    state.editorProduct = editing ? product : null;

    const values = editing
      ? {
          code: product.code,
          name: product.name,
          category: product.category,
          subcategory: product.subcategory || '',
          collection: product.collection || '',
          icon: product.icon || 'toolbox',
          price: Number(product.price || 0),
          oldPrice: Number(product.oldPrice || 0),
          stock: Number(product.stock || 0),
          status: product.status === 'hidden' ? 'hidden' : 'published',
          description: product.description || '',
        }
      : {
          code: nextProductCode(),
          name: '',
          category: categories[0] ? categories[0].id : '',
          subcategory: '',
          collection: '',
          icon: 'toolbox',
          price: 0,
          oldPrice: 0,
          stock: 0,
          status: 'published',
          description: '',
        };

    elements.productCode.value = values.code;
    elements.productName.value = values.name;
    elements.productCategory.value = values.category;
    updateSubcategories(values.subcategory);
    elements.productCollection.value = values.collection;
    elements.productIcon.value = values.icon;
    elements.productPrice.value = values.price;
    elements.productOldPrice.value = values.oldPrice;
    elements.productStock.value = values.stock;
    elements.productStatus.value = values.status;
    elements.productDescription.value = values.description;

    renderEditorPhotos(product);
  }

  function renderEditorPhotos(product) {
    if (!elements.editorPhotos) return;
    const editing = Boolean(product && product.id);
    const images = editing && Array.isArray(product.images) ? product.images : [];
    const pending = editing ? [] : state.pendingPhotos;
    const total = images.length + pending.length;
    const atLimit = total >= maxImages;

    if (elements.photoInput) elements.photoInput.disabled = false;
    if (elements.editorUploadButton) {
      elements.editorUploadButton.disabled = atLimit;
      elements.editorUploadButton.classList.toggle('is-disabled', atLimit);
      elements.editorUploadButton.setAttribute('aria-disabled', String(atLimit));
      elements.editorUploadButton.title = atLimit
        ? `Máximo ${maxImages} fotos por producto`
        : 'Agregar fotos';
    }

    if (elements.editorPhotosNote) {
      if (editing) {
        elements.editorPhotosNote.textContent = images.length
          ? `${images.length} de ${maxImages} fotos. La foto marcada como portada es la que se muestra en el catálogo.`
          : 'Todavía no hay fotos. La tarjeta usará el icono del producto.';
      } else {
        elements.editorPhotosNote.textContent = pending.length
          ? `${pending.length} de ${maxImages} fotos listas. La primera será la portada y se subirán al guardar.`
          : `Podés agregar hasta ${maxImages} fotos. Se subirán al guardar.`;
      }
    }

    const existingCards = images.map(
      (image, index) => `
        <article class="editor-photo" data-image-id="${escapeHtml(image.id)}">
          <img src="${escapeHtml(image.url)}" alt="${escapeHtml(image.alt || product.name)}" loading="lazy" decoding="async">
          ${image.isCover ? '<span class="editor-photo__cover">Portada</span>' : ''}
          <div class="editor-photo__actions">
            <button type="button" data-photo-action="cover" data-image-id="${escapeHtml(image.id)}" title="Usar como portada" aria-label="Usar foto ${index + 1} como portada" ${image.isCover ? 'disabled' : ''}>${icon('star')}</button>
            <button type="button" data-photo-action="left" data-image-id="${escapeHtml(image.id)}" title="Mover a la izquierda" aria-label="Mover foto ${index + 1} a la izquierda" ${index === 0 ? 'disabled' : ''}>${icon('chevron-left')}</button>
            <button type="button" data-photo-action="right" data-image-id="${escapeHtml(image.id)}" title="Mover a la derecha" aria-label="Mover foto ${index + 1} a la derecha" ${index === images.length - 1 ? 'disabled' : ''}>${icon('chevron-right')}</button>
            <button type="button" data-photo-action="delete" data-image-id="${escapeHtml(image.id)}" title="Eliminar foto" aria-label="Eliminar foto ${index + 1}">${icon('trash')}</button>
          </div>
        </article>`
    );

    const pendingCards = pending.map((photo, pendingIndex) => {
      const index = images.length + pendingIndex;
      const isCover = images.length === 0 && pendingIndex === 0;
      return `
        <article class="editor-photo editor-photo--pending" data-pending-id="${escapeHtml(photo.id)}">
          <img src="${escapeHtml(photo.url)}" alt="Foto pendiente ${index + 1}" loading="lazy" decoding="async">
          ${isCover ? '<span class="editor-photo__cover">Portada</span>' : '<span class="editor-photo__pending">Pendiente</span>'}
          <div class="editor-photo__actions">
            <button type="button" data-pending-action="remove" data-pending-id="${escapeHtml(photo.id)}" title="Quitar foto" aria-label="Quitar foto ${index + 1}">${icon('trash')}</button>
          </div>
        </article>`;
    });

    elements.editorPhotos.innerHTML = existingCards.concat(pendingCards).join('');
  }

  function openEditor(productId = null) {
    if (state.busy) return;
    resetProductForm();
    const product = productId ? state.products.find((item) => Number(item.id) === Number(productId)) : null;
    fillProductForm(product || null);
    if (typeof elements.productDialog.showModal === 'function') {
      elements.productDialog.showModal();
    } else {
      elements.productDialog.setAttribute('open', '');
    }
    elements.productCode.focus({ preventScroll: true });
  }

  function closeProductDialog() {
    if (!elements.productDialog) return;
    if (typeof elements.productDialog.close === 'function') elements.productDialog.close();
    else elements.productDialog.removeAttribute('open');
  }

  function replaceProduct(product) {
    const index = state.products.findIndex((item) => Number(item.id) === Number(product.id));
    if (index >= 0) state.products[index] = product;
    else state.products.push(product);
    state.editorProduct = product;
    renderStats();
    renderProducts();
    renderTrash();
    renderEditorPhotos(product);
    loadAudit();
  }

  async function saveProduct(event) {
    event.preventDefault();
    hideEditorAlert();
    if (!elements.productForm.reportValidity()) return;

    const input = {
      code: elements.productCode.value.trim().toUpperCase(),
      name: elements.productName.value.trim(),
      category: elements.productCategory.value,
      subcategory: elements.productSubcategory.value || null,
      collection: elements.productCollection.value || null,
      icon: elements.productIcon.value,
      price: Number(elements.productPrice.value || 0),
      oldPrice: Number(elements.productOldPrice.value || 0),
      stock: Math.max(0, Math.round(Number(elements.productStock.value || 0))),
      status: elements.productStatus.value,
      description: elements.productDescription.value.trim(),
    };

    if (!input.code || !input.name || !input.category) {
      showEditorAlert('Completá código, nombre y categoría.');
      return;
    }
    if (input.price < 0) {
      showEditorAlert('El precio no puede ser negativo.');
      return;
    }
    if (input.oldPrice > 0 && input.oldPrice <= input.price) {
      showEditorAlert('El precio anterior debe ser mayor al precio actual para mostrar una oferta.');
      return;
    }

    setBusy(elements.productForm, true);
    const wasEditing = Boolean(state.editingId);
    const pending = wasEditing ? [] : state.pendingPhotos.slice();
    try {
      const saved = await backend.admin.saveProduct(state.editingId, input);

      if (!wasEditing && pending.length) {
        try {
          await backend.admin.uploadImages(
            saved.id,
            pending.map((photo) => photo.file)
          );
          clearPendingPhotos();
          closeProductDialog();
          showToast('Producto creado con fotos');
          await loadData(true);
          return saved;
        } catch (uploadError) {
          clearPendingPhotos();
          state.editingId = saved.id;
          state.editorProduct = saved;
          if (elements.dialogKicker) elements.dialogKicker.textContent = 'Catálogo / Editar';
          if (elements.dialogTitle) elements.dialogTitle.textContent = 'Editar producto';
          await loadData(true);
          const fresh =
            state.products.find((item) => Number(item.id) === Number(saved.id)) || saved;
          state.editorProduct = fresh;
          renderEditorPhotos(fresh);
          showEditorAlert(
            `El producto se creó, pero no se pudieron subir las fotos. ${uploadError.message}`
          );
          showToast('Producto creado');
          return saved;
        }
      }

      closeProductDialog();
      showToast(wasEditing ? 'Producto actualizado' : 'Producto creado');
      await loadData(true);
      return saved;
    } catch (error) {
      showEditorAlert(error.message);
      return null;
    } finally {
      setBusy(elements.productForm, false);
    }
  }

  async function toggleProduct(id) {
    const product = state.products.find((item) => Number(item.id) === Number(id));
    if (!product) return;
    if (state.busy) return;

    state.busy = true;
    try {
      const next = product.status === 'published' ? 'hidden' : 'published';
      await backend.admin.saveProduct(product.id, { ...product, status: next });
      showToast(next === 'published' ? 'Producto publicado' : 'Producto oculto');
      await loadData(true);
    } catch (error) {
      showAlert(error.message);
    } finally {
      state.busy = false;
    }
  }

  function askConfirm({ title, text, warning = '', confirmLabel = 'Confirmar', danger = true }) {
    return new Promise((resolve) => {
      if (!elements.confirmDialog) {
        resolve(window.confirm(text));
        return;
      }
      elements.confirmTitle.textContent = title;
      elements.confirmText.textContent = text;
      elements.confirmWarning.textContent = warning;
      elements.confirmWarning.hidden = !warning;
      elements.confirmAccept.textContent = confirmLabel;
      elements.confirmAccept.className = danger ? 'btn admin-btn-danger' : 'btn btn--accent';
      elements.confirmDialog.returnValue = '';

      const onClose = () => {
        elements.confirmDialog.removeEventListener('close', onClose);
        resolve(elements.confirmDialog.returnValue === 'confirm');
      };
      elements.confirmDialog.addEventListener('close', onClose);
      elements.confirmDialog.showModal();
      window.setTimeout(() => elements.confirmAccept.focus(), 40);
    });
  }

  async function softDeleteProduct(id) {
    const product = state.products.find((item) => Number(item.id) === Number(id));
    if (!product) return;
    const confirmed = await askConfirm({
      title: 'Enviar a papelera',
      text: `“${product.name}” dejará de verse en la tienda, pero conservará sus datos y fotos.`,
      warning: 'Podés restaurarlo desde la pestaña Papelera.',
      confirmLabel: 'Enviar a papelera',
      danger: true,
    });
    if (!confirmed) return;

    state.busy = true;
    try {
      await backend.admin.deleteProduct(product.id, false);
      showToast('Producto enviado a la papelera');
      await loadData(true);
    } catch (error) {
      showAlert(error.message);
    } finally {
      state.busy = false;
    }
  }

  async function restoreProduct(id) {
    const product = state.products.find((item) => Number(item.id) === Number(id));
    if (!product) return;
    state.busy = true;
    try {
      await backend.admin.restoreProduct(product.id);
      showToast('Producto restaurado');
      await loadData(true);
    } catch (error) {
      showAlert(error.message);
    } finally {
      state.busy = false;
    }
  }

  async function purgeProduct(id) {
    const product = state.products.find((item) => Number(item.id) === Number(id));
    if (!product) return;
    const confirmed = await askConfirm({
      title: 'Eliminar definitivamente',
      text: `Se borrarán “${product.name}”, sus fotos y sus datos. Esta acción no se puede deshacer.`,
      warning: 'Si solo querés retirarlo de la tienda, usá la papelera en lugar del borrado definitivo.',
      confirmLabel: 'Eliminar definitivamente',
      danger: true,
    });
    if (!confirmed) return;

    state.busy = true;
    try {
      await backend.admin.deleteProduct(product.id, true);
      showToast('Producto eliminado definitivamente');
      await loadData(true);
    } catch (error) {
      showAlert(error.message);
    } finally {
      state.busy = false;
    }
  }

  async function resetDemo() {
    const confirmed = await askConfirm({
      title: 'Restaurar la demostración',
      text: 'Se restaurarán los 32 productos originales, se eliminarán las fotos cargadas y se vaciará la papelera.',
      warning: 'Los cambios de precios, stock y estados también se perderán. Esta acción no se puede deshacer.',
      confirmLabel: 'Restaurar demo',
      danger: true,
    });
    if (!confirmed) return;

    state.busy = true;
    elements.resetDemo.disabled = true;
    showAlert('Restaurando catálogo…', 'info');
    try {
      await backend.admin.resetDemo();
      state.audit = [];
      await loadData(true);
      showToast('Demo restaurada');
      showAlert('La demo volvió a su estado original.', 'success');
    } catch (error) {
      showAlert(error.message);
    } finally {
      state.busy = false;
      elements.resetDemo.disabled = false;
    }
  }

  async function refreshEditorProduct(id) {
    const product = await backend.admin.getProduct(id);
    replaceProduct(product);
    return product;
  }

  async function uploadPhotos(files) {
    if (!state.editingId || !files || files.length === 0) return;
    if (state.busy) return;

    state.busy = true;
    if (elements.editorPhotosNote) elements.editorPhotosNote.textContent = 'Optimizando y subiendo fotos…';
    if (elements.editorUploadButton) elements.editorUploadButton.classList.add('is-disabled');
    try {
      const updated = await backend.admin.uploadImages(state.editingId, files);
      replaceProduct(updated);
      showToast('Fotos actualizadas');
    } catch (error) {
      showEditorAlert(error.message);
      if (elements.editorPhotosNote) elements.editorPhotosNote.textContent = 'No se pudieron subir las fotos.';
    } finally {
      state.busy = false;
      if (elements.photoInput) elements.photoInput.value = '';
      if (state.editorProduct) renderEditorPhotos(state.editorProduct);
    }
  }

  function removePendingPhoto(id) {
    const index = state.pendingPhotos.findIndex((photo) => String(photo.id) === String(id));
    if (index < 0) return;
    const [removed] = state.pendingPhotos.splice(index, 1);
    try {
      URL.revokeObjectURL(removed.url);
    } catch (error) {
      // La URL ya puede estar liberada.
    }
    hideEditorAlert();
    renderEditorPhotos(null);
  }

  async function handlePhotoSelection(files) {
    const list = Array.from(files || []);
    if (!list.length) return;

    if (state.editingId) {
      await uploadPhotos(list);
      return;
    }

    const remaining = Math.max(0, maxImages - state.pendingPhotos.length);
    if (remaining === 0) {
      showEditorAlert(`Cada producto puede tener hasta ${maxImages} fotos.`);
      return;
    }

    const accepted = [];
    let firstError = '';
    list.slice(0, remaining).forEach((file) => {
      const error = backend.validateImageFile ? backend.validateImageFile(file) : '';
      if (error) {
        if (!firstError) firstError = error;
        return;
      }
      accepted.push({
        id: photoUid(),
        file,
        url: URL.createObjectURL(file),
      });
    });

    if (accepted.length) {
      state.pendingPhotos.push(...accepted);
      hideEditorAlert();
      renderEditorPhotos(null);
    }

    if (firstError) {
      showEditorAlert(firstError);
    } else if (list.length > remaining) {
      showEditorAlert(`Podés agregar hasta ${maxImages} fotos por producto.`);
    }
  }

  async function handlePhotoAction(action, imageId) {
    if (!state.editingId || state.busy) return;
    const product = state.editorProduct;
    if (!product) return;
    const image = (product.images || []).find((item) => String(item.id) === String(imageId));
    if (!image) return;

    if (action === 'delete') {
      const confirmed = await askConfirm({
        title: 'Eliminar foto',
        text: 'La foto se borrará del producto y del almacenamiento.',
        warning: 'Si era la portada, se usará la siguiente foto disponible.',
        confirmLabel: 'Eliminar foto',
        danger: true,
      });
      if (!confirmed) return;
    }

    state.busy = true;
    try {
      if (action === 'cover') await backend.admin.setCover(state.editingId, image.id);
      else if (action === 'left') await backend.admin.moveImage(state.editingId, image.id, -1);
      else if (action === 'right') await backend.admin.moveImage(state.editingId, image.id, 1);
      else if (action === 'delete') await backend.admin.deleteImage(image);
      else return;

      await refreshEditorProduct(state.editingId);
      showToast('Fotos actualizadas');
    } catch (error) {
      showEditorAlert(error.message);
    } finally {
      state.busy = false;
    }
  }

  function bindEvents() {
    elements.tabs.forEach((button) => {
      button.addEventListener('click', () => switchView(button.dataset.adminTab));
    });

    if (elements.adminSearch) {
      elements.adminSearch.addEventListener('input', () => {
        state.search = elements.adminSearch.value;
        renderProducts();
      });
    }

    if (elements.statusFilter) {
      elements.statusFilter.addEventListener('change', () => {
        state.statusFilter = elements.statusFilter.value;
        renderProducts();
      });
    }

    if (elements.newProduct) elements.newProduct.addEventListener('click', () => openEditor(null));

    if (elements.productCategory) {
      elements.productCategory.addEventListener('change', () => updateSubcategories());
    }

    if (elements.productForm) {
      elements.productForm.addEventListener('submit', saveProduct);
    }

    if (elements.editorUploadButton) {
      elements.editorUploadButton.addEventListener('click', () => {
        if (elements.editorUploadButton.disabled || !elements.photoInput) return;
        elements.photoInput.click();
      });
    }

    if (elements.photoInput) {
      elements.photoInput.addEventListener('change', async () => {
        const files = Array.from(elements.photoInput.files || []);
        elements.photoInput.value = '';
        await handlePhotoSelection(files);
      });
    }

    $$('[data-close-dialog]').forEach((button) => {
      button.addEventListener('click', () => {
        const dialog = document.getElementById(button.dataset.closeDialog);
        if (dialog) dialog.close();
      });
    });

    if (elements.productDialog) {
      elements.productDialog.addEventListener('close', () => {
        state.editingId = null;
        state.editorProduct = null;
        clearPendingPhotos();
        hideEditorAlert();
      });
      elements.productDialog.addEventListener('click', (event) => {
        if (event.target === elements.productDialog) closeProductDialog();
      });
    }

    if (elements.productsBody) {
      elements.productsBody.addEventListener('click', (event) => {
        const button = event.target.closest('[data-row-action]');
        if (!button) return;
        event.preventDefault();
        const id = Number(button.dataset.id);
        if (button.dataset.rowAction === 'edit') openEditor(id);
        else if (button.dataset.rowAction === 'toggle') toggleProduct(id);
        else if (button.dataset.rowAction === 'delete') softDeleteProduct(id);
      });
    }

    if (elements.trashBody) {
      elements.trashBody.addEventListener('click', (event) => {
        const button = event.target.closest('[data-row-action]');
        if (!button) return;
        event.preventDefault();
        const id = Number(button.dataset.id);
        if (button.dataset.rowAction === 'restore') restoreProduct(id);
        else if (button.dataset.rowAction === 'purge') purgeProduct(id);
      });
    }

    if (elements.editorPhotos) {
      elements.editorPhotos.addEventListener('click', (event) => {
        const pendingButton = event.target.closest('[data-pending-action]');
        if (pendingButton) {
          event.preventDefault();
          removePendingPhoto(pendingButton.dataset.pendingId);
          return;
        }
        const button = event.target.closest('[data-photo-action]');
        if (!button) return;
        event.preventDefault();
        handlePhotoAction(button.dataset.photoAction, button.dataset.imageId);
      });
    }

    if (elements.refreshHistory) {
      elements.refreshHistory.addEventListener('click', async () => {
        elements.refreshHistory.disabled = true;
        await loadAudit(true);
        elements.refreshHistory.disabled = false;
        showToast('Historial actualizado');
      });
    }

    if (elements.resetDemo) {
      elements.resetDemo.addEventListener('click', resetDemo);
    }

    if (elements.adminSignout) {
      elements.adminSignout.addEventListener('click', async () => {
        try {
          await backend.signOut();
          state.session = null;
          state.products = [];
          state.audit = [];
          renderHeader(null);
          showGate('login');
          showToast('Sesión cerrada');
        } catch (error) {
          showToast(error.message);
        }
      });
    }

    if (elements.gateDemoLogin) {
      elements.gateDemoLogin.addEventListener('click', async () => {
        elements.gateDemoLogin.disabled = true;
        elements.gateDemoLogin.textContent = 'Entrando…';
        try {
          await backend.signIn({ email: 'admin@ferromax.com', password: 'Admin1234!' });
          await checkAccess();
        } catch (error) {
          showGate('login');
          showToast(error.message);
        } finally {
          elements.gateDemoLogin.disabled = false;
          elements.gateDemoLogin.textContent = 'Entrar como admin demo';
        }
      });
    }
  }

  function init() {
    updateModeUi();
    populateCategories();
    populateIcons();
    bindEvents();
    switchView('products');
    checkAccess();
  }

  init();
})();
