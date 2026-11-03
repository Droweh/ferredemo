/* Adaptador de datos y autenticación de FerreDemo.
   Demo completa en el navegador: localStorage + IndexedDB. */
(() => {
  'use strict';

  const DATA = window.FERREDEMO || { categories: [], products: [] };

  const LOCAL_KEYS = {
    users: 'ferredemo.demo.users.v1',
    session: 'ferredemo.demo.session.v1',
    products: 'ferredemo.demo.products.v1',
    audit: 'ferredemo.demo.audit.v1',
    version: 'ferredemo.demo.version.v1',
  };
  const LOCAL_CATALOG_VERSION = 2;

  const IDB_NAME = 'ferredemo-demo-images';
  const IDB_STORE = 'images';
  const MAX_IMAGES = 5;
  const MAX_FILE_SIZE = 5 * 1024 * 1024;
  const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
  const SESSION_DAYS = 30;

  const DEMO_CREDENTIALS = [
    { label: 'Administrador', email: 'admin@ferredemo.com', password: 'Admin1234!' },
    { label: 'Cliente', email: 'cliente@ferredemo.com', password: 'Cliente1234!' },
  ];

  let imageCache = null;
  let imageCachePromise = null;
  let dbPromise = null;
  const authListeners = new Set();

  const normalizeText = (value) => String(value || '').trim().toLowerCase();

  function validateImageFile(file) {
    if (!file) return 'Elegí una foto para subir.';
    if (!ALLOWED_IMAGE_TYPES.has(String(file.type || '').toLowerCase())) {
      return 'La foto tiene que ser JPG, PNG o WebP.';
    }
    if (!file.size) return 'La foto está vacía o dañada.';
    if (file.size > MAX_FILE_SIZE) return 'Cada foto puede pesar como máximo 5 MB.';
    return '';
  }

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
      return true;
    } catch (error) {
      return false;
    }
  }

  function uid() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
      return window.crypto.randomUUID();
    }
    return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function bytesToHex(buffer) {
    return Array.from(new Uint8Array(buffer))
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('');
  }

  async function hashPassword(password, salt) {
    const bytes = new TextEncoder().encode(`${salt}:${password}`);
    const digest = await window.crypto.subtle.digest('SHA-256', bytes);
    return bytesToHex(digest);
  }

  function mapLocalUser(user) {
    if (!user) return null;
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      isAdmin: user.role === 'admin',
    };
  }

  function openImageDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      if (!window.indexedDB) {
        reject(new Error('Este navegador no permite guardar fotos en la demo local.'));
        return;
      }
      const request = window.indexedDB.open(IDB_NAME, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('No pudimos abrir el almacenamiento local.'));
    });
    return dbPromise;
  }

  async function imageDbGetAll() {
    const db = await openImageDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const store = tx.objectStore(IDB_STORE);
      const valuesRequest = store.getAll();
      const keysRequest = store.getAllKeys();

      tx.oncomplete = () => {
        const values = valuesRequest.result || [];
        const keys = keysRequest.result || [];
        resolve(keys.map((key, index) => ({ id: key, dataUrl: values[index] })));
      };
      tx.onerror = () => reject(tx.error || new Error('No pudimos leer las fotos guardadas.'));
      tx.onabort = () => reject(tx.error || new Error('No pudimos leer las fotos guardadas.'));
    });
  }

  async function imageDbPut(id, dataUrl) {
    const db = await openImageDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).put(dataUrl, id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async function imageDbDelete(id) {
    const db = await openImageDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async function imageDbClear() {
    const db = await openImageDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async function loadImageCache(force = false) {
    if (force) {
      imageCache = null;
      imageCachePromise = null;
    }
    if (imageCache) return imageCache;
    if (imageCachePromise) return imageCachePromise;

    imageCachePromise = (async () => {
      const cache = new Map();
      try {
        const rows = await imageDbGetAll();
        rows.forEach((row) => {
          if (row.id && row.dataUrl) cache.set(`local:${row.id}`, row.dataUrl);
        });
      } catch (error) {
        /* Sin IndexedDB la demo sigue funcionando, solo sin fotos locales. */
      }
      imageCache = cache;
      imageCachePromise = null;
      return cache;
    })();

    return imageCachePromise;
  }

  /* Modo local ------------------------------------------------------------- */
  function seedImageObjects(product) {
    return (Array.isArray(product.images) ? product.images : []).map((path, index) => ({
      id: `seed-${product.id}-${index + 1}`,
      productId: Number(product.id),
      path,
      url: path,
      alt: `${product.name} · foto ${index + 1}`,
      sortOrder: index,
      isCover: index === 0,
    }));
  }

  function seedProducts() {
    return DATA.products.map((product) => ({
      ...product,
      description: product.description || '',
      features: Array.isArray(product.features) ? product.features.slice() : [],
      stock: product.inStock ? 10 : 0,
      status: 'published',
      deletedAt: null,
      images: seedImageObjects(product),
    }));
  }

  /* Los catálogos guardados antes de FerreDemo tienen códigos FM y fotos vacías.
     Se migran una sola vez, sin pisar precios, stock ni fotos subidas por el admin. */
  function migrateLocalProducts(products) {
    const seedById = new Map(DATA.products.map((product) => [Number(product.id), product]));
    let changed = false;

    const migrated = products.map((product) => {
      const seed = seedById.get(Number(product.id));
      if (!seed) return product;

      const updates = {};
      const previousCode = seed.code.replace(/^FD/, 'FM');
      if (product.code === previousCode) updates.code = seed.code;
      if (!product.description && seed.description) updates.description = seed.description;
      if (!Array.isArray(product.features) || product.features.length === 0) {
        updates.features = Array.isArray(seed.features) ? seed.features.slice() : [];
      }
      if (!Array.isArray(product.images) || product.images.length === 0) {
        updates.images = seedImageObjects(seed);
      }

      if (Object.keys(updates).length === 0) return product;
      changed = true;
      return { ...product, ...updates };
    });

    return { products: migrated, changed };
  }

  function readLocalProducts() {
    const saved = readStorage(LOCAL_KEYS.products);
    if (Array.isArray(saved)) {
      if (Number(readStorage(LOCAL_KEYS.version)) === LOCAL_CATALOG_VERSION) return saved;
      const migration = migrateLocalProducts(saved);
      writeStorage(LOCAL_KEYS.products, migration.products);
      writeStorage(LOCAL_KEYS.version, LOCAL_CATALOG_VERSION);
      return migration.products;
    }

    const seeded = seedProducts();
    writeStorage(LOCAL_KEYS.products, seeded);
    writeStorage(LOCAL_KEYS.version, LOCAL_CATALOG_VERSION);
    return seeded;
  }

  function writeLocalProducts(products) {
    writeStorage(LOCAL_KEYS.products, products);
  }

  async function ensureLocalUsers() {
    const saved = readStorage(LOCAL_KEYS.users);
    const users = Array.isArray(saved) ? saved : [];
    let changed = !Array.isArray(saved);

    for (const seed of DEMO_CREDENTIALS) {
      if (users.some((user) => normalizeText(user.email) === normalizeText(seed.email))) continue;
      const salt = uid();
      users.push({
        id: `demo-${seed.email === 'admin@ferredemo.com' ? 'admin' : 'client'}`,
        email: seed.email,
        name: seed.email === 'admin@ferredemo.com' ? 'Admin FerreDemo' : 'Cliente Demo',
        role: seed.email === 'admin@ferredemo.com' ? 'admin' : 'customer',
        salt,
        passwordHash: await hashPassword(seed.password, salt),
        createdAt: new Date().toISOString(),
      });
      changed = true;
    }

    if (changed) writeStorage(LOCAL_KEYS.users, users);
  }

  function localUsers() {
    const users = readStorage(LOCAL_KEYS.users);
    return Array.isArray(users) ? users : [];
  }

  function localUserById(id) {
    return localUsers().find((user) => user.id === id) || null;
  }

  function getLocalSessionUser() {
    const session = readStorage(LOCAL_KEYS.session);
    if (!session || !session.userId) return null;
    if (!session.expiresAt || session.expiresAt < Date.now()) {
      window.localStorage.removeItem(LOCAL_KEYS.session);
      return null;
    }
    return mapLocalUser(localUserById(session.userId));
  }

  function setLocalSession(userId) {
    writeStorage(LOCAL_KEYS.session, {
      userId,
      expiresAt: Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000,
    });
  }

  function emitAuth(user) {
    authListeners.forEach((listener) => {
      try {
        listener(user);
      } catch (error) {
        // Un listener roto no debe romper el resto.
      }
    });
  }

  function localAuditAdd(entry) {
    const saved = readStorage(LOCAL_KEYS.audit);
    const list = Array.isArray(saved) ? saved : [];
    list.unshift({
      id: uid(),
      created_at: new Date().toISOString(),
      user_id: getLocalSessionUser() ? getLocalSessionUser().id : null,
      ...entry,
    });
    writeStorage(LOCAL_KEYS.audit, list.slice(0, 200));
  }

  function localAuditList() {
    const saved = readStorage(LOCAL_KEYS.audit);
    return Array.isArray(saved) ? saved.slice(0, 30) : [];
  }

  async function localResolveProduct(product) {
    const cache = await loadImageCache();
    const images = (product.images || [])
      .slice()
      .sort((a, b) => {
        const order = (Number(a.sortOrder) || 0) - (Number(b.sortOrder) || 0);
        return order !== 0 ? order : String(a.id).localeCompare(String(b.id));
      })
      .map((image) => {
        const path = String(image.path || '');
        const cached = cache.get(path);
        const staticPath = path && !path.startsWith('local:') ? path : '';
        return {
          ...image,
          url: cached || staticPath || image.url || '',
        };
      })
      .filter((image) => image.url);
    return {
      ...product,
      inStock: Number(product.stock || 0) > 0,
      images,
    };
  }

  async function localGetCatalog() {
    await loadImageCache();
    const products = readLocalProducts()
      .filter((product) => !product.deletedAt && product.status !== 'hidden')
      .sort((a, b) => Number(a.id) - Number(b.id));
    return {
      categories: DATA.categories,
      products: await Promise.all(products.map(localResolveProduct)),
    };
  }

  async function localGetAllProducts() {
    await loadImageCache();
    const products = readLocalProducts().sort((a, b) => Number(a.id) - Number(b.id));
    return Promise.all(products.map(localResolveProduct));
  }

  async function localGetProduct(id) {
    const product = readLocalProducts().find((item) => Number(item.id) === Number(id));
    if (!product) throw new Error('No encontramos el producto.');
    return localResolveProduct(product);
  }

  function normalizeLocalInput(input, products, id) {
    const code = String(input.code || '').trim().toUpperCase();
    const name = String(input.name || '').trim();
    const category = String(input.category || '');
    if (!code || !name || !category) throw new Error('Completá nombre, código y categoría.');

    const duplicate = products.find(
      (product) => product.code === code && Number(product.id) !== Number(id)
    );
    if (duplicate) throw new Error('Ese código de producto ya existe. Usá otro.');

    return {
      code,
      name,
      description: String(input.description || '').trim(),
      price: Math.max(0, Number(input.price || 0)),
      oldPrice: Math.max(0, Number(input.oldPrice || 0)),
      stock: Math.max(0, Math.round(Number(input.stock || 0))),
      category,
      subcategory: input.subcategory || null,
      collection: input.collection || null,
      icon: input.icon || 'toolbox',
      status: input.status === 'hidden' ? 'hidden' : 'published',
    };
  }

  async function localSaveProduct(id, input) {
    const products = readLocalProducts();
    const normalized = normalizeLocalInput(input, products, id);

    if (id) {
      const index = products.findIndex((product) => Number(product.id) === Number(id));
      if (index < 0) throw new Error('No encontramos el producto.');
      const before = products[index];
      products[index] = { ...before, ...normalized };
      writeLocalProducts(products);
      localAuditAdd({
        action: 'UPDATE',
        entity: 'products',
        entity_id: String(id),
        before,
        after: products[index],
      });
      return localResolveProduct(products[index]);
    }

    const nextId = products.reduce((max, product) => Math.max(max, Number(product.id) || 0), 0) + 1;
    const product = {
      id: nextId,
      ...normalized,
      features: [],
      inStock: normalized.stock > 0,
      deletedAt: null,
      images: [],
      createdAt: new Date().toISOString(),
    };
    products.push(product);
    writeLocalProducts(products);
    localAuditAdd({
      action: 'INSERT',
      entity: 'products',
      entity_id: String(nextId),
      before: null,
      after: product,
    });
    return localResolveProduct(product);
  }

  async function localDeleteProduct(id, permanent = false) {
    let products = readLocalProducts();
    const product = products.find((item) => Number(item.id) === Number(id));
    if (!product) throw new Error('No encontramos el producto.');

    if (permanent) {
      for (const image of product.images || []) {
        if (image.path && image.path.startsWith('local:')) {
          await imageDbDelete(image.path.slice(6));
          if (imageCache) imageCache.delete(image.path);
        }
      }
      products = products.filter((item) => Number(item.id) !== Number(id));
      writeLocalProducts(products);
      localAuditAdd({
        action: 'DELETE',
        entity: 'products',
        entity_id: String(id),
        before: product,
        after: null,
      });
      return;
    }

    const index = products.findIndex((item) => Number(item.id) === Number(id));
    const before = products[index];
    products[index] = { ...before, deletedAt: new Date().toISOString() };
    writeLocalProducts(products);
    localAuditAdd({
      action: 'SOFT_DELETE',
      entity: 'products',
      entity_id: String(id),
      before,
      after: products[index],
    });
  }

  async function localRestoreProduct(id) {
    const products = readLocalProducts();
    const index = products.findIndex((item) => Number(item.id) === Number(id));
    if (index < 0) throw new Error('No encontramos el producto.');
    const before = products[index];
    products[index] = { ...before, deletedAt: null };
    writeLocalProducts(products);
    localAuditAdd({
      action: 'RESTORE',
      entity: 'products',
      entity_id: String(id),
      before,
      after: products[index],
    });
  }

  async function localUploadImages(productId, files) {
    const products = readLocalProducts();
    const index = products.findIndex((product) => Number(product.id) === Number(productId));
    if (index < 0) throw new Error('No encontramos el producto.');

    const product = products[index];
    const images = Array.isArray(product.images) ? product.images : [];
    const remaining = Math.max(0, MAX_IMAGES - images.length);
    if (remaining === 0) throw new Error(`Cada producto puede tener hasta ${MAX_IMAGES} fotos.`);

    const list = Array.from(files || []).slice(0, remaining);
    const cache = await loadImageCache();
    let hasCover = images.some((image) => image.isCover);
    let maxOrder = images.reduce((highest, image) => Math.max(highest, Number(image.sortOrder) || 0), -1);

    for (let offset = 0; offset < list.length; offset += 1) {
      const prepared = await compressImage(list[offset]);
      const imageId = uid();
      const path = `local:${imageId}`;
      await imageDbPut(imageId, prepared.dataUrl);
      cache.set(path, prepared.dataUrl);
      images.push({
        id: imageId,
        path,
        alt: '',
        sortOrder: maxOrder + 1 + offset,
        isCover: !hasCover && offset === 0,
      });
      if (!hasCover && offset === 0) hasCover = true;
    }

    products[index] = { ...product, images };
    writeLocalProducts(products);
    localAuditAdd({
      action: 'IMAGES_UPLOAD',
      entity: 'product_images',
      entity_id: String(productId),
      before: product.images || [],
      after: images,
    });
    return localResolveProduct(products[index]);
  }

  async function localDeleteImage(image) {
    if (image.path && image.path.startsWith('local:')) {
      await imageDbDelete(image.path.slice(6));
      if (imageCache) imageCache.delete(image.path);
    }

    const products = readLocalProducts();
    for (let index = 0; index < products.length; index += 1) {
      const product = products[index];
      const images = Array.isArray(product.images) ? product.images : [];
      if (!images.some((item) => item.id === image.id)) continue;
      let remaining = images
        .filter((item) => item.id !== image.id)
        .sort((a, b) => (Number(a.sortOrder) || 0) - (Number(b.sortOrder) || 0));
      if (image.isCover && remaining.length > 0) {
        remaining = remaining.map((item, order) => ({
          ...item,
          sortOrder: order,
          isCover: order === 0,
        }));
      }
      products[index] = { ...product, images: remaining };
      writeLocalProducts(products);
      localAuditAdd({
        action: 'IMAGE_DELETE',
        entity: 'product_images',
        entity_id: String(product.id),
        before: images,
        after: remaining,
      });
      return;
    }
  }

  async function localSetCover(productId, imageId) {
    const products = readLocalProducts();
    const index = products.findIndex((product) => Number(product.id) === Number(productId));
    if (index < 0) throw new Error('No encontramos el producto.');
    const product = products[index];
    const images = (product.images || []).map((image) => ({
      ...image,
      isCover: image.id === imageId,
    }));
    products[index] = { ...product, images };
    writeLocalProducts(products);
  }

  async function localMoveImage(productId, imageId, direction) {
    const products = readLocalProducts();
    const index = products.findIndex((product) => Number(product.id) === Number(productId));
    if (index < 0) throw new Error('No encontramos el producto.');
    const product = products[index];
    const images = (product.images || []).slice().sort((a, b) => a.sortOrder - b.sortOrder);
    const current = images.findIndex((image) => image.id === imageId);
    const target = current + direction;
    if (current < 0 || target < 0 || target >= images.length) return;
    const [moved] = images.splice(current, 1);
    images.splice(target, 0, moved);
    products[index] = {
      ...product,
      images: images.map((image, order) => ({ ...image, sortOrder: order })),
    };
    writeLocalProducts(products);
  }

  async function localResetDemo() {
    writeLocalProducts(seedProducts());
    writeStorage(LOCAL_KEYS.version, LOCAL_CATALOG_VERSION);
    localAuditAdd({
      action: 'RESET_DEMO',
      entity: 'demo',
      entity_id: 'catalog',
      before: null,
      after: null,
    });
    await imageDbClear();
    if (imageCache) imageCache.clear();
  }

  async function localSignUp({ name, email, password }) {
    const cleanEmail = normalizeText(email);
    const cleanName = String(name || '').trim();
    if (!cleanName) throw new Error('Ingresá tu nombre.');
    if (!cleanEmail.includes('@')) throw new Error('Ingresá un email válido.');
    if (String(password || '').length < 8) throw new Error('La contraseña debe tener al menos 8 caracteres.');

    const users = localUsers();
    if (users.some((user) => normalizeText(user.email) === cleanEmail)) {
      throw new Error('Ese email ya tiene una cuenta. Probá iniciando sesión.');
    }

    const salt = uid();
    const user = {
      id: `local-${uid()}`,
      email: cleanEmail,
      name: cleanName,
      role: 'customer',
      salt,
      passwordHash: await hashPassword(password, salt),
      createdAt: new Date().toISOString(),
    };
    users.push(user);
    writeStorage(LOCAL_KEYS.users, users);
    setLocalSession(user.id);
    const mapped = mapLocalUser(user);
    emitAuth(mapped);
    return mapped;
  }

  async function localSignIn({ email, password }) {
    const cleanEmail = normalizeText(email);
    const user = localUsers().find((item) => normalizeText(item.email) === cleanEmail);
    if (!user) throw new Error('Email o contraseña incorrectos.');
    const hash = await hashPassword(password, user.salt);
    if (hash !== user.passwordHash) throw new Error('Email o contraseña incorrectos.');
    setLocalSession(user.id);
    const mapped = mapLocalUser(user);
    emitAuth(mapped);
    return mapped;
  }

  async function localSignOut() {
    window.localStorage.removeItem(LOCAL_KEYS.session);
    emitAuth(null);
  }

  async function localUpdatePassword({ currentPassword, password }) {
    const sessionUser = getLocalSessionUser();
    if (!sessionUser) throw new Error('Tu sesión venció. Volvé a iniciar sesión.');
    const users = localUsers();
    const index = users.findIndex((user) => user.id === sessionUser.id);
    if (index < 0) throw new Error('No encontramos tu cuenta.');
    const user = users[index];
    const currentHash = await hashPassword(currentPassword || '', user.salt);
    if (currentHash !== user.passwordHash) throw new Error('La contraseña actual no es correcta.');
    if (String(password || '').length < 8) throw new Error('La nueva contraseña debe tener al menos 8 caracteres.');
    const salt = uid();
    users[index] = { ...user, salt, passwordHash: await hashPassword(password, salt) };
    writeStorage(LOCAL_KEYS.users, users);
  }

  function localOnAuthChange(callback) {
    authListeners.add(callback);
    return () => authListeners.delete(callback);
  }

  /* Compresión de imágenes -------------------------------------------------- */
  async function compressImage(file) {
    const fileError = validateImageFile(file);
    if (fileError) throw new Error(fileError);

    let source;
    try {
      source = await createImageBitmap(file);
    } catch (error) {
      source = await new Promise((resolve, reject) => {
        const objectUrl = URL.createObjectURL(file);
        const image = new Image();
        image.onload = () => {
          URL.revokeObjectURL(objectUrl);
          resolve(image);
        };
        image.onerror = () => {
          URL.revokeObjectURL(objectUrl);
          reject(new Error('No pudimos leer la imagen. Probá con otro archivo.'));
        };
        image.src = objectUrl;
      });
    }

    const sourceWidth = Number(source.width || source.naturalWidth || 0);
    const sourceHeight = Number(source.height || source.naturalHeight || 0);
    if (!sourceWidth || !sourceHeight) {
      if (typeof source.close === 'function') source.close();
      throw new Error('No pudimos leer la imagen. Probá con otro archivo.');
    }

    const maxSize = 1200;
    const scale = Math.min(1, maxSize / Math.max(sourceWidth, sourceHeight));
    const width = Math.max(1, Math.round(sourceWidth * scale));
    const height = Math.max(1, Math.round(sourceHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('No pudimos procesar la imagen.');
    context.drawImage(source, 0, 0, width, height);
    if (typeof source.close === 'function') source.close();

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', 0.8));
    if (!blob) throw new Error('No pudimos comprimir la imagen.');
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('No pudimos leer la imagen.'));
      reader.readAsDataURL(blob);
    });

    return { blob, dataUrl };
  }

  /* API pública ------------------------------------------------------------- */
  async function getSession() {
    await ready;
    return getLocalSessionUser();
  }

  const ready = (async () => {
    if (window.FerreDemoLegacy && window.FerreDemoLegacy.ready) {
      await window.FerreDemoLegacy.ready;
    }
    await ensureLocalUsers();
    readLocalProducts();
    await loadImageCache();
  })();

  const backend = {
    mode: 'local',
    isLocal: true,
    demoCredentials: DEMO_CREDENTIALS,
    maxImages: MAX_IMAGES,
    maxFileSize: MAX_FILE_SIZE,
    validateImageFile,
    ready,
    getSetupStatus() {
      return {
        mode: 'local',
        configured: true,
        error: '',
      };
    },
    async getCatalog() {
      await ready;
      return localGetCatalog();
    },
    getSession,
    onAuthChange(callback) {
      return localOnAuthChange(callback);
    },
    async signUp(payload) {
      await ready;
      return localSignUp(payload);
    },
    async signIn(payload) {
      await ready;
      return localSignIn(payload);
    },
    async signOut() {
      await ready;
      return localSignOut();
    },
    async updatePassword(payload) {
      await ready;
      return localUpdatePassword(payload);
    },
    admin: {
      async getProducts() {
        await ready;
        return localGetAllProducts();
      },
      async getProduct(id) {
        await ready;
        return localGetProduct(id);
      },
      async saveProduct(id, input) {
        await ready;
        return localSaveProduct(id, input);
      },
      async deleteProduct(id, permanent = false) {
        await ready;
        return localDeleteProduct(id, permanent);
      },
      async restoreProduct(id) {
        await ready;
        return localRestoreProduct(id);
      },
      async uploadImages(productId, files) {
        await ready;
        return localUploadImages(productId, files);
      },
      async deleteImage(image) {
        await ready;
        return localDeleteImage(image);
      },
      async setCover(productId, imageId) {
        await ready;
        return localSetCover(productId, imageId);
      },
      async moveImage(productId, imageId, direction) {
        await ready;
        return localMoveImage(productId, imageId, direction);
      },
      async resetDemo() {
        await ready;
        return localResetDemo();
      },
      async getAudit() {
        await ready;
        return localAuditList();
      },
    },
  };

  window.FerreDemoBackend = backend;
})();
