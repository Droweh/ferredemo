/* Lógica de la tienda de FerreDemo.
   El catálogo se carga desde el almacenamiento local; el carrito y los
   favoritos se guardan en el navegador. */
(() => {
  'use strict';

  const data = window.FERREDEMO;
  const backend = window.FerreDemoBackend;

  if (!data || !backend) {
    document.addEventListener('DOMContentLoaded', () => {
      const message = document.createElement('p');
      message.className = 'empty-state';
      message.textContent = 'No pudimos iniciar la tienda. Revisá los archivos js/data.js y js/backend.js.';
      const main = document.querySelector('main');
      if (main) main.prepend(message);
    });
    return;
  }

  const categories = data.categories;
  const categoryById = new Map(categories.map((category) => [category.id, category]));
  const pageType = document.body.dataset.page || 'home';

  const STORAGE_KEYS = {
    cart: 'ferredemo.cart.v1',
    favorites: 'ferredemo.favorites.v1',
  };

  const state = {
    cart: new Map(),
    favorites: new Set(),
    products: [],
    catalogLoaded: false,
    session: null,
  };

  let productById = new Map();

  const catalog = {
    category: null,
    subcategory: null,
    query: '',
    products: [],
    sort: 'featured',
  };

  let searchQuery = '';

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  const moneyFormatter = new Intl.NumberFormat('es-UY', { maximumFractionDigits: 0 });
  const nameCollator = new Intl.Collator('es', { sensitivity: 'base' });

  const normalizeText = (value) =>
    String(value)
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');

  const formatUSD = (value) => `USD ${moneyFormatter.format(value)}`;

  const pluralize = (count, singular, plural) =>
    `${count} ${count === 1 ? singular : plural}`;

  const discountPct = (product) =>
    product.oldPrice > product.price
      ? Math.round(100 - (product.price * 100) / product.oldPrice)
      : 0;

  const escapeHtml = (value) =>
    String(value).replace(/[&<>"']/g, (character) => {
      const entities = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      };
      return entities[character];
    });

  const icon = (name, className = '') => {
    const classes = ['icon', className].filter(Boolean).join(' ');
    return `<svg class="${classes}" aria-hidden="true" focusable="false"><use href="#i-${name}"></use></svg>`;
  };

  const categoryHref = (category) => `categoria.html?cat=${encodeURIComponent(category.id)}`;
  const subcategoryHref = (category, subcategory) =>
    `${categoryHref(category)}&sub=${encodeURIComponent(subcategory.id)}`;

  const getSubcategory = (product) => {
    const category = categoryById.get(product.category);
    return category ? category.children.find((child) => child.id === product.subcategory) || null : null;
  };

  const coverOf = (product) => {
    const images = Array.isArray(product.images) ? product.images : [];
    return images.find((image) => image.isCover) || images[0] || null;
  };

  const productMedia = (product, className, altFallback = '') => {
    const cover = coverOf(product);
    if (cover && cover.url) {
      return `<img class="${className}" src="${escapeHtml(cover.url)}" alt="${escapeHtml(
        cover.alt || altFallback || product.name
      )}" loading="lazy" decoding="async">`;
    }
    return icon(product.icon, className);
  };

  /* Persistencia ------------------------------------------------------------ */
  function readStorage(key) {
    try {
      return JSON.parse(window.localStorage.getItem(key) || 'null');
    } catch (error) {
      return null;
    }
  }

  function writeStorage(key, value) {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      // El sitio sigue funcionando en memoria si el navegador bloquea storage.
    }
  }

  function hydrateState() {
    const savedCart = readStorage(STORAGE_KEYS.cart);
    if (Array.isArray(savedCart)) {
      savedCart.forEach((entry) => {
        if (!Array.isArray(entry)) return;
        const [id, quantity] = entry;
        const product = productById.get(Number(id));
        const amount = Number(quantity);
        if (product && product.inStock && Number.isInteger(amount) && amount > 0) {
          state.cart.set(product.id, amount);
        }
      });
    }

    const savedFavorites = readStorage(STORAGE_KEYS.favorites);
    if (Array.isArray(savedFavorites)) {
      savedFavorites.forEach((id) => {
        const product = productById.get(Number(id));
        if (product) state.favorites.add(product.id);
      });
    }
  }

  const persistCart = () => writeStorage(STORAGE_KEYS.cart, Array.from(state.cart.entries()));
  const persistFavorites = () => writeStorage(STORAGE_KEYS.favorites, Array.from(state.favorites));

  /* Render compartido ------------------------------------------------------- */
  function renderNavigation() {
    const menu = $('#menu');
    if (!menu) return;

    menu.innerHTML = categories
      .map((category) => {
        const hasChildren = category.children.length > 0;
        const dropdown = hasChildren
          ? `<div class="category-nav__dropdown">${category.children
              .map(
                (child) =>
                  `<a href="${subcategoryHref(category, child)}">${escapeHtml(child.name)}</a>`
              )
              .join('')}</div>`
          : '';

        return `
          <li class="category-nav__item${hasChildren ? ' category-nav__item--parent' : ''}">
            <a class="category-nav__link" href="${categoryHref(category)}" data-category-id="${category.id}">${escapeHtml(category.name)}</a>
            ${dropdown}
          </li>`;
      })
      .join('');
  }

  function markActiveCategory() {
    if (!catalog.category) return;
    const activeLink = $(`[data-category-id="${catalog.category.id}"]`, $('#menu'));
    if (!activeLink) return;
    activeLink.classList.add('is-active');
    activeLink.setAttribute('aria-current', 'page');
  }

  function renderCategoryTiles() {
    const tiles = $('#tiles');
    if (!tiles) return;

    tiles.innerHTML = categories
      .map((category) => {
        const count = state.products.filter((product) => product.category === category.id).length;
        const countLabel = state.catalogLoaded ? pluralize(count, 'producto', 'productos') : '';
        const name = escapeHtml(category.name);
        return `
          <a class="category-tile" href="${categoryHref(category)}">
            ${icon(category.icon, 'category-tile__icon')}
            <span class="category-tile__name">${name}</span>
            <span class="category-tile__count">${countLabel}</span>
          </a>`;
      })
      .join('');
  }

  function productCard(product) {
    const off = discountPct(product);
    const name = escapeHtml(product.name);
    const isFavorite = state.favorites.has(product.id);

    return `
      <article class="product-card" data-id="${product.id}">
        <a class="product-card__overlay" href="producto.html?id=${product.id}" aria-label="Ver ${name}"></a>
        <div class="product-card__media">
          ${off ? `<span class="badge">${off}% OFF</span>` : ''}
          <button class="favorite-btn${isFavorite ? ' is-active' : ''}" type="button" data-action="favorite" data-id="${product.id}" aria-label="${isFavorite ? 'Quitar' : 'Agregar'} ${name} ${isFavorite ? 'de' : 'a'} favoritos" aria-pressed="${String(isFavorite)}">
            ${icon('heart')}
          </button>
          ${productMedia(product, coverOf(product) ? 'product-card__photo' : 'product-card__icon', product.name)}
          <span class="product-card__code">${escapeHtml(product.code)}</span>
        </div>
        <div class="product-card__body">
          <h3 class="product-card__name">${name}</h3>
          <p class="product-card__old">${off ? `Antes ${formatUSD(product.oldPrice)}` : ''}</p>
          <p class="product-card__price">${formatUSD(product.price)} <small>IVA inc.</small></p>
          <p class="product-card__stock ${product.inStock ? 'is-in' : 'is-out'}">
            <span class="stock-dot" aria-hidden="true"></span>
            ${product.inStock ? 'En stock · Entrega en 24 hs' : 'Agotado'}
          </p>
          <button class="btn product-card__add" type="button" data-action="add" data-id="${product.id}" ${product.inStock ? '' : 'disabled'}>
            Agregar al carrito
          </button>
        </div>
      </article>`;
  }

  function renderProducts() {
    const combos = state.products.filter((product) => product.collection === 'combos');
    const nuevos = state.products.filter((product) => product.collection === 'nuevos');

    const combosGrid = $('#grid-combos');
    const nuevosGrid = $('#grid-nuevos');

    if (combosGrid) {
      combosGrid.removeAttribute('aria-busy');
      combosGrid.innerHTML = combos.length
        ? combos.map(productCard).join('')
        : '<p class="empty-state">Todavía no hay combos publicados.</p>';
    }
    if (nuevosGrid) {
      nuevosGrid.removeAttribute('aria-busy');
      nuevosGrid.innerHTML = nuevos.length
        ? nuevos.map(productCard).join('')
        : '<p class="empty-state">Todavía no hay novedades publicadas.</p>';
    }
  }

  function renderCart() {
    const itemsContainer = $('#cart-items');
    if (!itemsContainer) return;

    let total = 0;
    let count = 0;
    const entries = Array.from(state.cart.entries())
      .map(([id, quantity]) => ({ product: productById.get(id), quantity }))
      .filter((entry) => entry.product);

    if (entries.length === 0) {
      itemsContainer.innerHTML = '<p class="cart-drawer__empty">Tu carrito está vacío.</p>';
    } else {
      itemsContainer.innerHTML = entries
        .map(({ product, quantity }) => {
          total += product.price * quantity;
          count += quantity;
          const cover = coverOf(product);
          const thumb = cover
            ? `<img src="${escapeHtml(cover.url)}" alt="" loading="lazy" decoding="async">`
            : icon(product.icon);

          return `
            <div class="cart-item">
              <div class="cart-item__thumb">${thumb}</div>
              <div>
                <p class="cart-item__name">${escapeHtml(product.name)}</p>
                <p class="cart-item__meta">${escapeHtml(product.code)} · ${formatUSD(product.price)}</p>
              </div>
              <div class="cart-item__qty">
                <button type="button" data-action="qty" data-id="${product.id}" data-step="-1" aria-label="Quitar una unidad de ${escapeHtml(product.name)}">−</button>
                <span>${quantity}</span>
                <button type="button" data-action="qty" data-id="${product.id}" data-step="1" aria-label="Agregar una unidad de ${escapeHtml(product.name)}">+</button>
              </div>
            </div>`;
        })
        .join('');
    }

    const cartTotal = formatUSD(total);
    const cartCount = $('#cart-count');
    const cartTotalElement = $('#cart-total');
    const drawerTotal = $('#cart-drawer-total');

    if (cartCount) cartCount.textContent = String(count);
    if (cartTotalElement) cartTotalElement.textContent = cartTotal;
    if (drawerTotal) drawerTotal.textContent = cartTotal;
  }

  function updateFavoritesUI() {
    const favCount = $('#fav-count');
    if (favCount) favCount.textContent = String(state.favorites.size);
  }

  function updateFavoriteButton(button, product, isFavorite) {
    button.classList.toggle('is-active', isFavorite);
    button.setAttribute('aria-pressed', String(isFavorite));

    const label = $('[data-favorite-label]', button);
    if (label) {
      label.textContent = isFavorite ? 'Guardado en favoritos' : 'Guardar en favoritos';
      button.removeAttribute('aria-label');
      return;
    }

    button.setAttribute(
      'aria-label',
      `${isFavorite ? 'Quitar' : 'Agregar'} ${product.name} ${isFavorite ? 'de' : 'a'} favoritos`
    );
  }

  function syncFavoriteButtons() {
    $$('[data-action="favorite"]').forEach((button) => {
      const product = productById.get(Number(button.dataset.id));
      if (!product) return;
      updateFavoriteButton(button, product, state.favorites.has(product.id));
    });
  }

  function favoritesMessage() {
    const count = state.favorites.size;
    if (count === 0) return 'Todavía no tenés favoritos';
    return count === 1 ? 'Tenés 1 favorito' : `Tenés ${count} favoritos`;
  }

  /* Sesión ------------------------------------------------------------------ */
  function renderSession(user) {
    state.session = user;
    const accountButton = $('[data-action="login"]');
    if (accountButton) {
      const label = $('.action-btn__label', accountButton);
      if (user) {
        const firstName = String(user.name || user.email || 'Mi cuenta').split(/\s+/)[0];
        if (label) label.textContent = firstName;
        accountButton.setAttribute('aria-label', `Mi cuenta: ${user.name || user.email}`);
        accountButton.classList.add('is-signed-in');
      } else {
        if (label) label.textContent = 'Ingresar';
        accountButton.setAttribute('aria-label', 'Ingresar a mi cuenta');
        accountButton.classList.remove('is-signed-in');
      }
    }

    const adminLink = $('#admin-link');
    if (adminLink) adminLink.hidden = !(user && user.isAdmin);
  }

  async function initSession() {
    try {
      const user = await backend.getSession();
      renderSession(user);
      backend.onAuthChange(renderSession);
    } catch (error) {
      renderSession(null);
    }
  }

  /* Búsqueda y filtros ------------------------------------------------------ */
  function applyFilters() {
    const cards = $$('.product-card');
    let visible = 0;

    cards.forEach((card) => {
      const product = productById.get(Number(card.dataset.id));
      if (!product) return;

      const category = categoryById.get(product.category);
      const subcategory = getSubcategory(product);
      const haystack = normalizeText(
        [product.name, product.code, category ? category.name : '', subcategory ? subcategory.name : '']
          .filter(Boolean)
          .join(' ')
      );
      const matches = searchQuery === '' || haystack.includes(normalizeText(searchQuery));

      card.hidden = !matches;
      if (matches) visible += 1;
    });

    const resultsCount = $('#results-count');
    if (resultsCount) {
      resultsCount.textContent = pluralize(visible, 'producto', 'productos');
    }

    const searchEmpty = $('#search-empty');
    if (searchEmpty) {
      searchEmpty.hidden = searchQuery === '' || visible > 0;
      if (searchQuery !== '' && visible === 0) {
        searchEmpty.textContent =
          pageType === 'home'
            ? `No hay coincidencias en los destacados para “${searchQuery}”. Presioná Enter para buscar en todo el catálogo.`
            : `No encontramos productos para “${searchQuery}”.`;
      }
    }

    const catalogEmpty = $('#catalog-empty');
    if (catalogEmpty) {
      const showEmpty = catalog.products.length === 0 && searchQuery === '';
      catalogEmpty.hidden = !showEmpty;
      if (showEmpty) updateCatalogEmpty();
    }
  }

  function initSearch() {
    const form = $('#search-form');
    const input = $('#q');
    if (!form || !input) return;

    const update = () => {
      searchQuery = input.value.trim();
      applyFilters();
    };

    if (pageType === 'home' || pageType === 'catalog') input.addEventListener('input', update);

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const query = input.value.trim();

      if (query === '') {
        if (pageType === 'home' || pageType === 'catalog') {
          searchQuery = '';
          applyFilters();
        }
        input.focus();
        return;
      }

      if (pageType !== 'catalog') {
        window.location.href = `categoria.html?q=${encodeURIComponent(query)}`;
        return;
      }

      searchQuery = query;
      input.blur();
      applyFilters();
    });
  }

  /* Catálogo ---------------------------------------------------------------- */
  function showCatalogError(title, text, linkHref, linkText) {
    const content = $('#catalog-content');
    const error = $('#catalog-error');
    if (content) content.hidden = true;
    if (error) error.hidden = false;

    const titleElement = $('#catalog-error-title');
    const textElement = $('#catalog-error-text');
    const linkElement = $('#catalog-error-link');

    if (titleElement) titleElement.textContent = title;
    if (textElement) textElement.textContent = text;
    if (linkElement) {
      linkElement.href = linkHref;
      linkElement.textContent = linkText;
    }

    document.title = `${title} | FerreDemo`;
  }

  function setupCatalogPage() {
    const params = new URLSearchParams(window.location.search);
    const category = categoryById.get(params.get('cat') || '');
    const subcategoryId = params.get('sub');
    const query = (params.get('q') || '').trim();

    catalog.query = query;
    if (query) {
      searchQuery = query;
      const input = $('#q');
      if (input) input.value = query;
    }

    if (!category && !query) {
      showCatalogError(
        'No encontramos esa categoría',
        'El enlace puede estar incompleto o la categoría ya no existe.',
        'index.html#categorias',
        'Ver todas las categorías'
      );
      return false;
    }

    if (!category) {
      catalog.category = null;
      catalog.subcategory = null;
      catalog.products = state.products.slice();

      renderCatalogHero();
      renderBreadcrumb();
      renderSubcategoryFilters();
      renderCatalogTitle();
      renderCatalogGrid();
      updateDocumentMeta();
      return true;
    }

    let subcategory = null;
    if (subcategoryId) {
      subcategory = category.children.find((child) => child.id === subcategoryId) || null;
      if (!subcategory) {
        showCatalogError(
          'No encontramos esa subcategoría',
          'La subcategoría no pertenece a esta categoría o el enlace está incompleto.',
          categoryHref(category),
          `Volver a ${category.name}`
        );
        return false;
      }
    }

    catalog.category = category;
    catalog.subcategory = subcategory;
    catalog.products = state.products.filter(
      (product) =>
        product.category === category.id &&
        (!subcategory || product.subcategory === subcategory.id)
    );

    renderCatalogHero();
    renderBreadcrumb();
    renderSubcategoryFilters();
    renderCatalogTitle();
    renderCatalogGrid();
    updateDocumentMeta();
    return true;
  }

  function renderCatalogHero() {
    const { category, subcategory, query, products: catalogProducts } = catalog;
    const kicker = $('#category-kicker');
    const title = $('#category-title');
    const description = $('#category-description');
    const meta = $('#category-meta');
    const index = $('#category-index');
    const searchInput = $('#q');

    if (!category) {
      if (kicker) kicker.textContent = 'Catálogo / Búsqueda';
      if (title) title.textContent = query ? `Resultados para “${query}”` : 'Buscar productos';
      if (description) {
        description.textContent =
          'Estamos buscando en las 9 categorías del catálogo. Podés ajustar la búsqueda desde el encabezado.';
      }
      if (meta) meta.textContent = 'Búsqueda en todo el catálogo';
      if (index) index.textContent = '00';
      if (searchInput) searchInput.placeholder = 'Buscar en todo el catálogo…';
      return;
    }

    const categoryIndex = categories.findIndex((item) => item.id === category.id) + 1;
    const indexLabel = String(categoryIndex).padStart(2, '0');
    const allCategoryProducts = state.products.filter((product) => product.category === category.id);
    const totalProducts = subcategory ? catalogProducts.length : allCategoryProducts.length;

    if (kicker) {
      kicker.textContent = subcategory ? `${category.name} / ${indexLabel}` : `Catálogo / ${indexLabel}`;
    }
    if (title) title.textContent = subcategory ? subcategory.name : category.name;
    if (description) description.textContent = category.description;
    if (index) index.textContent = indexLabel;

    if (meta) {
      const parts = [pluralize(totalProducts, 'producto', 'productos')];
      if (!subcategory && category.children.length > 0) {
        parts.push(pluralize(category.children.length, 'subcategoría', 'subcategorías'));
      }
      if (subcategory) parts.push(`Categoría: ${category.name}`);
      meta.textContent = parts.join(' · ');
    }

    if (searchInput) {
      searchInput.placeholder = `Buscar en ${subcategory ? subcategory.name : category.name}…`;
    }
  }

  function renderBreadcrumb() {
    const list = $('#breadcrumb-list');
    if (!list) return;

    const { category, subcategory, query } = catalog;
    const items = ['<li><a href="index.html">Inicio</a></li>'];

    if (!category) {
      items.push(`<li><span aria-current="page">Búsqueda${query ? `: ${escapeHtml(query)}` : ''}</span></li>`);
    } else if (subcategory) {
      items.push(`<li><a href="${categoryHref(category)}">${escapeHtml(category.name)}</a></li>`);
      items.push(`<li><span aria-current="page">${escapeHtml(subcategory.name)}</span></li>`);
    } else {
      items.push(`<li><span aria-current="page">${escapeHtml(category.name)}</span></li>`);
    }

    list.innerHTML = items.join('');
  }

  function renderSubcategoryFilters() {
    const { category, subcategory } = catalog;
    const section = $('#subcategory-section');
    const list = $('#subcategory-list');
    if (!section || !list) return;

    if (!category || category.children.length === 0) {
      section.hidden = true;
      return;
    }

    section.hidden = false;
    const categoryProducts = state.products.filter((product) => product.category === category.id);
    const allActive = !subcategory;
    const items = [
      `<li><a class="subcategory-link${allActive ? ' is-active' : ''}" href="${categoryHref(category)}"${allActive ? ' aria-current="page"' : ''}><span>Todas</span><span class="subcategory-link__count">${categoryProducts.length}</span><span class="sr-only"> productos</span></a></li>`,
    ];

    category.children.forEach((child) => {
      const count = categoryProducts.filter((product) => product.subcategory === child.id).length;
      const active = subcategory && subcategory.id === child.id;
      items.push(
        `<li><a class="subcategory-link${active ? ' is-active' : ''}" href="${subcategoryHref(category, child)}"${active ? ' aria-current="page"' : ''}><span>${escapeHtml(child.name)}</span><span class="subcategory-link__count">${count}</span><span class="sr-only"> productos</span></a></li>`
      );
    });

    list.innerHTML = items.join('');
  }

  function renderCatalogTitle() {
    const title = $('#catalog-results-title');
    if (!title) return;
    if (!catalog.category) {
      title.textContent = 'Resultados de búsqueda';
      return;
    }
    title.textContent = catalog.subcategory ? catalog.subcategory.name : 'Todos los productos';
  }

  function sortProducts() {
    const list = [...catalog.products];

    switch (catalog.sort) {
      case 'price-asc':
        return list.sort((a, b) => a.price - b.price);
      case 'price-desc':
        return list.sort((a, b) => b.price - a.price);
      case 'name':
        return list.sort((a, b) => nameCollator.compare(a.name, b.name));
      default:
        return list;
    }
  }

  function renderCatalogGrid() {
    const grid = $('#category-grid');
    if (!grid) return;

    grid.removeAttribute('aria-busy');
    grid.innerHTML = sortProducts().map(productCard).join('');
    syncFavoriteButtons();
    applyFilters();
  }

  function updateCatalogEmpty() {
    const { category, subcategory } = catalog;
    const iconElement = $('#catalog-empty-icon');
    const title = $('#catalog-empty-title');
    const text = $('#catalog-empty-text');
    const link = $('#catalog-empty-link');

    if (!category) {
      if (iconElement) iconElement.innerHTML = icon('search', 'catalog-empty__icon-svg');
      if (title) title.textContent = 'No encontramos productos';
      if (text) text.textContent = 'Probá con otra palabra o recorré las categorías del catálogo.';
      if (link) {
        link.href = 'index.html#categorias';
        link.textContent = 'Ver todas las categorías';
      }
      return;
    }

    if (iconElement) iconElement.innerHTML = icon(category.icon, 'catalog-empty__icon-svg');
    if (title) {
      title.textContent = subcategory
        ? 'Todavía no hay productos en esta subcategoría'
        : 'Todavía no hay productos en esta categoría';
    }
    if (text) {
      text.textContent = subcategory
        ? `Podés ver el catálogo completo de ${category.name} o consultarnos por WhatsApp.`
        : 'Estamos ampliando el catálogo. Mientras tanto, recorré el resto de las categorías.';
    }
    if (link) {
      link.href = subcategory ? categoryHref(category) : 'index.html#categorias';
      link.textContent = subcategory ? `Ver todo en ${category.name}` : 'Ver todas las categorías';
    }
  }

  function updateDocumentMeta() {
    const { category, subcategory, query } = catalog;

    if (!category) {
      document.title = query ? `Búsqueda: ${query} | FerreDemo` : 'Catálogo | FerreDemo';
      const meta = $('meta[name="description"]');
      if (meta) meta.content = `Resultados de búsqueda para “${query}” en el catálogo FerreDemo.`;
      return;
    }

    const pageName = subcategory ? `${subcategory.name} · ${category.name}` : category.name;
    document.title = `${pageName} | FerreDemo`;
    const meta = $('meta[name="description"]');
    if (meta) meta.content = `${category.description} Catálogo FerreDemo con envíos a todo Uruguay.`;
  }

  function initSort() {
    const select = $('#sort-select');
    if (!select) return;

    select.addEventListener('change', () => {
      catalog.sort = select.value;
      if (catalog.category || catalog.query) renderCatalogGrid();
    });
  }

  /* Ficha de producto ------------------------------------------------------- */
  const productPage = {
    product: null,
    images: [],
    index: 0,
  };

  const imageAlt = (product, image, index) =>
    image.alt || `${product.name} · foto ${index + 1}`;

  function renderProductBreadcrumb(product) {
    const list = $('#product-breadcrumb');
    if (!list) return;

    const category = categoryById.get(product.category);
    const subcategory = getSubcategory(product);
    const items = ['<li><a href="index.html">Inicio</a></li>'];

    if (category) {
      items.push(`<li><a href="${categoryHref(category)}">${escapeHtml(category.name)}</a></li>`);
    }
    if (category && subcategory) {
      items.push(
        `<li><a href="${subcategoryHref(category, subcategory)}">${escapeHtml(subcategory.name)}</a></li>`
      );
    }
    items.push(`<li><span aria-current="page">${escapeHtml(product.name)}</span></li>`);
    list.innerHTML = items.join('');
  }

  function updateGalleryCounter() {
    const counter = $('#product-gallery-counter');
    if (!counter) return;
    const total = productPage.images.length;
    counter.textContent = total
      ? `${String(productPage.index + 1).padStart(2, '0')} / ${String(total).padStart(2, '0')}`
      : 'Sin fotos';
  }

  function selectGalleryImage(index) {
    if (!productPage.images[index]) return;
    productPage.index = index;

    const image = productPage.images[index];
    const preview = $('#product-gallery-image');
    if (preview) {
      preview.src = image.url;
      preview.alt = imageAlt(productPage.product, image, index);
    }

    const main = $('#product-gallery-main');
    if (main) {
      main.setAttribute(
        'aria-label',
        `Ampliar foto ${index + 1} de ${productPage.images.length}`
      );
    }

    $$('#product-gallery-thumbs [data-action="select-image"]').forEach((button) => {
      button.setAttribute('aria-pressed', String(Number(button.dataset.index) === index));
    });
    updateGalleryCounter();
  }

  function renderProductGallery(product) {
    const main = $('#product-gallery-main');
    const thumbs = $('#product-gallery-thumbs');
    if (!main || !thumbs) return;

    productPage.images = Array.isArray(product.images) ? product.images : [];
    productPage.index = 0;

    if (productPage.images.length === 0) {
      main.disabled = true;
      main.removeAttribute('data-action');
      main.innerHTML = `
        <span class="product-gallery__empty">
          ${icon(product.icon, 'product-gallery__empty-icon')}
          <span>Sin fotos cargadas</span>
        </span>`;
      thumbs.innerHTML = '';
    } else {
      const cover = productPage.images[0];
      main.disabled = false;
      main.setAttribute('data-action', 'zoom-image');
      main.setAttribute(
        'aria-label',
        `Ampliar foto 1 de ${productPage.images.length}`
      );
      main.innerHTML = `
        <img class="product-gallery__photo" id="product-gallery-image"
          src="${escapeHtml(cover.url)}" alt="${escapeHtml(imageAlt(product, cover, 0))}"
          decoding="async">`;
      thumbs.innerHTML = productPage.images
        .map(
          (image, index) => `
            <button class="product-gallery__thumb" type="button" data-action="select-image"
              data-index="${index}" aria-pressed="${index === 0}"
              aria-label="Ver foto ${index + 1} de ${productPage.images.length}">
              <img src="${escapeHtml(image.url)}" alt="" loading="lazy" decoding="async">
            </button>`
        )
        .join('');
    }

    updateGalleryCounter();
  }

  function renderProductDetails(product) {
    const category = categoryById.get(product.category);
    const subcategory = getSubcategory(product);
    const off = discountPct(product);

    $('#product-code').textContent = product.code;
    $('#product-category').textContent = category ? category.name : 'Catálogo';
    $('#product-name').textContent = product.name;
    $('#product-price').textContent = formatUSD(product.price);

    const oldPrice = $('#product-old-price');
    oldPrice.hidden = !off;
    oldPrice.textContent = off ? `Antes ${formatUSD(product.oldPrice)}` : '';

    const offBadge = $('#product-off');
    offBadge.hidden = !off;
    offBadge.textContent = off ? `${off}% OFF` : '';

    const stock = $('#product-stock');
    stock.classList.toggle('is-in', product.inStock);
    stock.classList.toggle('is-out', !product.inStock);
    stock.innerHTML = `<span class="stock-dot" aria-hidden="true"></span>${
      product.inStock ? 'En stock · Entrega en 24 hs' : 'Agotado'
    }`;

    $('#product-description').textContent =
      product.description || 'Producto de demostración sin descripción adicional.';

    const features = Array.isArray(product.features) ? product.features : [];
    const featuresList = $('#product-features');
    featuresList.hidden = features.length === 0;
    featuresList.innerHTML = features
      .map((feature) => `<li>${escapeHtml(feature)}</li>`)
      .join('');

    const addButton = $('#product-add');
    addButton.dataset.id = String(product.id);
    addButton.disabled = !product.inStock;
    addButton.textContent = product.inStock ? 'Agregar al carrito' : 'Producto agotado';

    const favoriteButton = $('#product-favorite');
    favoriteButton.dataset.id = String(product.id);

    $('#product-meta-code').textContent = product.code;
    $('#product-meta-category').textContent = category ? category.name : '—';
    $('#product-meta-subcategory').textContent = subcategory ? subcategory.name : '—';
    $('#product-meta-stock').textContent = product.inStock ? 'Disponible' : 'Agotado';
  }

  function renderRelatedProducts(product) {
    const section = $('#product-related');
    const grid = $('#product-related-grid');
    if (!section || !grid) return;

    const related = state.products
      .filter((item) => item.id !== product.id && item.category === product.category)
      .slice(0, 4);

    section.hidden = related.length === 0;
    grid.innerHTML = related.map(productCard).join('');
  }

  function updateProductMeta(product) {
    const category = categoryById.get(product.category);
    const description = String(product.description || '').slice(0, 160);
    const cover = coverOf(product);
    const imageUrl = cover && cover.url ? new URL(cover.url, window.location.href).href : '';
    document.title = `${product.name} | FerreDemo`;

    const meta = $('meta[name="description"]');
    if (meta) meta.content = description;

    const ogTitle = $('#og-title');
    const ogDescription = $('#og-description');
    const ogImage = $('#og-image');
    const ogUrl = $('#og-url');
    if (ogTitle) ogTitle.content = product.name;
    if (ogDescription) ogDescription.content = description;
    if (ogImage) ogImage.content = imageUrl;
    if (ogUrl) ogUrl.content = window.location.href;

    const structured = $('#product-jsonld');
    if (structured) {
      structured.textContent = JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'Product',
        name: product.name,
        sku: product.code,
        description: product.description || '',
        image: imageUrl || undefined,
        category: category ? category.name : undefined,
        offers: {
          '@type': 'Offer',
          priceCurrency: 'USD',
          price: Number(product.price).toFixed(2),
          availability: product.inStock
            ? 'https://schema.org/InStock'
            : 'https://schema.org/OutOfStock',
        },
      });
    }
  }

  function showProductError(title = 'No encontramos este producto', text = '') {
    const content = $('#product-content');
    const error = $('#product-error');
    if (content) content.hidden = true;
    if (error) error.hidden = false;

    const titleElement = $('#product-error-title');
    const textElement = $('#product-error-text');
    if (titleElement && title) titleElement.textContent = title;
    if (textElement && text) textElement.textContent = text;

    document.title = 'Producto no encontrado | FerreDemo';
    const meta = $('meta[name="description"]');
    if (meta) meta.content = 'El producto que buscás no existe o ya no está publicado.';
  }

  function renderProductPage() {
    const params = new URLSearchParams(window.location.search);
    const id = Number(params.get('id'));
    const product = Number.isInteger(id) ? productById.get(id) : null;

    if (!product) {
      showProductError(
        'No encontramos este producto',
        'El enlace puede estar incompleto o el producto ya no está publicado. Volvé al catálogo para seguir recorriendo la demo.'
      );
      return;
    }

    productPage.product = product;
    catalog.category = categoryById.get(product.category) || null;
    renderProductBreadcrumb(product);
    renderProductGallery(product);
    renderProductDetails(product);
    renderRelatedProducts(product);
    updateProductMeta(product);
    if (catalog.category) markActiveCategory();
    syncFavoriteButtons();
  }

  /* Galería ampliada -------------------------------------------------------- */
  function updateLightbox() {
    const image = productPage.images[productPage.index];
    if (!image) return;

    const preview = $('#lightbox-image');
    const caption = $('#lightbox-caption');
    const counter = $('#lightbox-counter');
    const prev = $('[data-action="lightbox-prev"]');
    const next = $('[data-action="lightbox-next"]');

    if (preview) {
      preview.src = image.url;
      preview.alt = imageAlt(productPage.product, image, productPage.index);
    }
    if (caption) {
      caption.textContent = `${productPage.product.name} · foto ${productPage.index + 1}`;
    }
    if (counter) {
      counter.textContent = `${productPage.index + 1} / ${productPage.images.length}`;
    }

    const single = productPage.images.length < 2;
    if (prev) prev.hidden = single;
    if (next) next.hidden = single;
  }

  function openLightbox(index = productPage.index) {
    if (!productPage.images.length) return;
    selectGalleryImage(index);
    updateLightbox();

    const dialog = $('#product-lightbox');
    if (!dialog) return;
    document.body.classList.add('lightbox-open');
    if (!dialog.open) {
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else dialog.setAttribute('open', '');
    }
  }

  function closeLightbox() {
    const dialog = $('#product-lightbox');
    document.body.classList.remove('lightbox-open');
    if (dialog && dialog.open) dialog.close();
  }

  function stepLightbox(step) {
    if (!productPage.images.length) return;
    const total = productPage.images.length;
    const next = ((productPage.index + step) % total + total) % total;
    selectGalleryImage(next);
    updateLightbox();
  }

  function initProductLightbox() {
    const dialog = $('#product-lightbox');
    if (!dialog) return;

    dialog.addEventListener('click', (event) => {
      if (event.target === dialog) closeLightbox();
    });
    dialog.addEventListener('close', () => {
      document.body.classList.remove('lightbox-open');
    });
    document.addEventListener('keydown', (event) => {
      if (!dialog.open) return;
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        stepLightbox(-1);
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        stepLightbox(1);
      }
    });
  }

  /* Carrito ----------------------------------------------------------------- */
  let lastFocused = null;

  function openCart() {
    if (document.body.classList.contains('cart-open')) return;

    const drawer = $('#cart');
    if (!drawer) return;
    lastFocused = document.activeElement;
    document.body.classList.add('cart-open');
    drawer.removeAttribute('inert');
    drawer.setAttribute('aria-hidden', 'false');

    window.setTimeout(() => {
      const closeButton = drawer.querySelector('[data-action="close-cart"]');
      if (closeButton) closeButton.focus();
    }, 50);
  }

  function closeCart() {
    if (!document.body.classList.contains('cart-open')) return;

    const drawer = $('#cart');
    document.body.classList.remove('cart-open');
    drawer.setAttribute('aria-hidden', 'true');
    drawer.setAttribute('inert', '');

    if (lastFocused && typeof lastFocused.focus === 'function') {
      lastFocused.focus();
    }
    lastFocused = null;
  }

  function addToCart(id) {
    const product = productById.get(Number(id));
    if (!product || !product.inStock) return;

    state.cart.set(product.id, (state.cart.get(product.id) || 0) + 1);
    persistCart();
    renderCart();
    showToast('Producto agregado al carrito');
  }

  function changeQuantity(id, step) {
    const productId = Number(id);
    const product = productById.get(productId);
    if (!product) return;

    const nextQuantity = (state.cart.get(productId) || 0) + Number(step);

    if (nextQuantity <= 0) {
      state.cart.delete(productId);
    } else {
      state.cart.set(productId, nextQuantity);
    }

    persistCart();
    renderCart();
  }

  function toggleFavorite(button, id) {
    const productId = Number(id);
    const product = productById.get(productId);
    if (!product) return;

    const isFavorite = state.favorites.has(productId);

    if (isFavorite) {
      state.favorites.delete(productId);
    } else {
      state.favorites.add(productId);
    }

    persistFavorites();
    updateFavoriteButton(button, product, !isFavorite);
    updateFavoritesUI();
  }

  function trapCartFocus(event) {
    if (!document.body.classList.contains('cart-open')) return;

    if (event.key === 'Escape') {
      event.preventDefault();
      closeCart();
      return;
    }

    if (event.key !== 'Tab') return;

    const drawer = $('#cart');
    const focusable = $$(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])',
      drawer
    ).filter((element) => element.offsetParent !== null);

    if (focusable.length === 0) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  /* Navegación -------------------------------------------------------------- */
  function initNavigation() {
    const toggle = $('#menu-toggle');
    const menu = $('#menu');
    if (!toggle || !menu) return;

    const mobileQuery = window.matchMedia('(max-width: 860px)');

    const setMenuOpen = (open) => {
      menu.classList.toggle('is-open', open);
      toggle.setAttribute('aria-expanded', String(open));
    };

    toggle.addEventListener('click', () => {
      setMenuOpen(!menu.classList.contains('is-open'));
    });

    menu.addEventListener('click', (event) => {
      if (event.target.closest('a') && mobileQuery.matches) {
        setMenuOpen(false);
      }
    });

    document.addEventListener('click', (event) => {
      if (!mobileQuery.matches) return;
      if (!event.target.closest('.category-nav')) setMenuOpen(false);
    });

    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      if (document.body.classList.contains('cart-open')) return;

      if (menu.classList.contains('is-open')) {
        setMenuOpen(false);
        toggle.focus();
      }
    });

    mobileQuery.addEventListener('change', () => setMenuOpen(false));
  }

  /* Hero -------------------------------------------------------------------- */
  function initSlider() {
    const hero = $('#hero');
    const slidesContainer = $('#slides');
    const dotsContainer = $('#dots');
    if (!hero || !slidesContainer || !dotsContainer) return;

    const slides = $$('.hero__slide', slidesContainer);
    if (slides.length === 0) return;

    const AUTOPLAY_DELAY = 5000;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let current = 0;
    let timer = null;

    dotsContainer.innerHTML = slides
      .map(
        (_, index) =>
          `<button class="hero__dot" type="button" data-slide="${index}" aria-label="Ir al slide ${index + 1}"></button>`
      )
      .join('');

    const dots = $$('.hero__dot', dotsContainer);

    const stopAuto = () => {
      if (timer !== null) {
        window.clearInterval(timer);
        timer = null;
      }
    };

    const canAuto = () => !document.hidden && !reducedMotion.matches;

    const goTo = (index) => {
      current = ((index % slides.length) + slides.length) % slides.length;
      slidesContainer.style.transform = `translateX(-${current * 100}%)`;

      slides.forEach((slide, slideIndex) => {
        const isActive = slideIndex === current;
        slide.setAttribute('aria-hidden', String(!isActive));
        slide.toggleAttribute('inert', !isActive);
      });

      dots.forEach((dot, dotIndex) => {
        dot.classList.toggle('is-active', dotIndex === current);
        if (dotIndex === current) {
          dot.setAttribute('aria-current', 'true');
        } else {
          dot.removeAttribute('aria-current');
        }
      });
    };

    const startAuto = () => {
      stopAuto();
      if (!canAuto()) return;
      timer = window.setInterval(() => goTo(current + 1), AUTOPLAY_DELAY);
    };

    const restart = (index) => {
      goTo(index);
      startAuto();
    };

    $('.hero__arrow--prev', hero).addEventListener('click', () => restart(current - 1));
    $('.hero__arrow--next', hero).addEventListener('click', () => restart(current + 1));

    dotsContainer.addEventListener('click', (event) => {
      const dot = event.target.closest('[data-slide]');
      if (!dot) return;
      restart(Number(dot.dataset.slide));
    });

    hero.addEventListener('pointerenter', stopAuto);
    hero.addEventListener('pointerleave', startAuto);
    hero.addEventListener('focusin', stopAuto);
    hero.addEventListener('focusout', (event) => {
      if (!hero.contains(event.relatedTarget)) startAuto();
    });

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        stopAuto();
      } else {
        startAuto();
      }
    });

    if (typeof reducedMotion.addEventListener === 'function') {
      reducedMotion.addEventListener('change', startAuto);
    }

    goTo(0);
    startAuto();
  }

  /* Formulario y toast ------------------------------------------------------ */
  let toastTimer = null;

  function showToast(message) {
    const toast = $('#toast');
    if (!toast) return;

    toast.textContent = message;
    toast.classList.add('is-visible');

    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
      toast.classList.remove('is-visible');
    }, 2600);
  }

  function initContactForm() {
    const form = $('#contact-form');
    if (!form) return;

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      form.reset();
      showToast('Gracias. Te contactaremos pronto.');
    });
  }

  /* Acciones delegadas ------------------------------------------------------ */
  function handleAction(event) {
    const control = event.target.closest('[data-action]');
    if (!control) return;

    const { action } = control.dataset;

    switch (action) {
      case 'login':
        window.location.href = state.session ? 'cuenta.html' : 'cuenta.html#ingresar';
        break;
      case 'favorites':
        showToast(favoritesMessage());
        break;
      case 'open-cart':
        openCart();
        break;
      case 'close-cart':
        closeCart();
        break;
      case 'add':
        addToCart(control.dataset.id);
        break;
      case 'favorite':
        toggleFavorite(control, control.dataset.id);
        break;
      case 'select-image':
        selectGalleryImage(Number(control.dataset.index));
        break;
      case 'zoom-image':
        openLightbox(productPage.index);
        break;
      case 'close-lightbox':
        closeLightbox();
        break;
      case 'lightbox-prev':
        stepLightbox(-1);
        break;
      case 'lightbox-next':
        stepLightbox(1);
        break;
      case 'qty':
        changeQuantity(control.dataset.id, control.dataset.step);
        break;
      case 'checkout':
        if (state.cart.size === 0) {
          showToast('Tu carrito está vacío');
        } else {
          showToast('Compra finalizada (demo)');
        }
        break;
      default:
        break;
    }
  }

  /* Carga inicial ----------------------------------------------------------- */
  function showLoadError(error) {
    const message = String((error && error.message) || 'No pudimos cargar el catálogo.');
    if (pageType === 'catalog') {
      showCatalogError(
        'No pudimos cargar el catálogo',
        `${message} Reintentá en unos segundos.`,
        window.location.href,
        'Reintentar'
      );
      return;
    }

    if (pageType === 'product') {
      showProductError('No pudimos cargar el producto', message);
      return;
    }

    ['#grid-combos', '#grid-nuevos'].forEach((selector) => {
      const grid = $(selector);
      if (!grid) return;
      grid.removeAttribute('aria-busy');
      grid.innerHTML = `<p class="empty-state">${escapeHtml(message)}</p>`;
    });
    showToast(message);
  }

  async function loadCatalog() {
    $$('.product-grid').forEach((grid) => grid.setAttribute('aria-busy', 'true'));
    const combosGrid = $('#grid-combos');
    const nuevosGrid = $('#grid-nuevos');
    if (combosGrid) combosGrid.innerHTML = '<p class="empty-state">Cargando catálogo…</p>';
    if (nuevosGrid) nuevosGrid.innerHTML = '<p class="empty-state">Cargando catálogo…</p>';

    try {
      const result = await backend.getCatalog();
      state.products = Array.isArray(result.products) ? result.products : data.products;
      productById = new Map(state.products.map((product) => [Number(product.id), product]));
      state.catalogLoaded = true;
      hydrateState();
      renderCategoryTiles();
    } catch (error) {
      console.error(error);
      showLoadError(error);
      renderCart();
      updateFavoritesUI();
      return;
    }

    const catalogReady = pageType === 'catalog' ? setupCatalogPage() : false;
    if (catalogReady) markActiveCategory();
    if (pageType === 'product') renderProductPage();
    if (pageType === 'home') renderProducts();

    renderCart();
    updateFavoritesUI();
    syncFavoriteButtons();
  }

  hydrateState();
  renderNavigation();
  renderCategoryTiles();
  renderCart();
  updateFavoritesUI();
  initSearch();
  initNavigation();
  initSlider();
  initContactForm();
  initSort();
  initProductLightbox();
  initSession();

  document.addEventListener('click', handleAction);
  document.addEventListener('keydown', trapCartFocus);

  loadCatalog();
})();
