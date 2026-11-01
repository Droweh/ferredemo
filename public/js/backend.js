/* Adaptador de datos y autenticación de FerroMax.
   - Modo local: demo completa en el navegador (localStorage + IndexedDB).
   - Modo Supabase: Auth, Postgres y Storage reales.
   La interfaz de la tienda y del panel es la misma para ambos modos. */
(() => {
  'use strict';

  const CONFIG = window.FERROMAX_CONFIG || {};
  const DATA = window.FERROMAX || { categories: [], products: [] };

  const LOCAL_KEYS = {
    users: 'ferromax.demo.users.v1',
    session: 'ferromax.demo.session.v1',
    products: 'ferromax.demo.products.v1',
    audit: 'ferromax.demo.audit.v1',
  };

  const IDB_NAME = 'ferromax-demo-images';
  const IDB_STORE = 'images';
  const MAX_IMAGES = 5;
  const MAX_FILE_SIZE = 5 * 1024 * 1024;
  const SESSION_DAYS = 30;

  const DEMO_CREDENTIALS = [
    { label: 'Administrador', email: 'admin@ferromax.com', password: 'Admin1234!' },
    { label: 'Cliente', email: 'cliente@ferromax.com', password: 'Cliente1234!' },
  ];

  const supabaseUrl = String(CONFIG.supabaseUrl || '').trim();
  const supabaseAnonKey = String(CONFIG.supabaseAnonKey || '').trim();
  const mode =
    CONFIG.mode === 'local'
      ? 'local'
      : supabaseUrl && supabaseAnonKey && CONFIG.mode !== 'local'
        ? 'supabase'
        : 'local';

  let client = null;
  let initError = null;
  let imageCache = null;
  let dbPromise = null;
  const authListeners = new Set();

  const normalizeText = (value) => String(value || '').trim().toLowerCase();

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

  function mapSupabaseUser(user) {
    if (!user) return null;
    return {
      id: user.id,
      email: user.email || '',
      name:
        (user.user_metadata && (user.user_metadata.full_name || user.user_metadata.name)) ||
        (user.email || '').split('@')[0] ||
        'Mi cuenta',
      role: (user.app_metadata && user.app_metadata.role) || 'customer',
      isAdmin: Boolean(user.app_metadata && user.app_metadata.role === 'admin'),
    };
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

  function normalizeError(error, fallback = 'Ocurrió un error. Intentá de nuevo.') {
    const message = String((error && (error.message || error.error_description || error.msg)) || '');
    const lower = message.toLowerCase();

    if (lower.includes('invalid login credentials')) return new Error('Email o contraseña incorrectos.');
    if (lower.includes('user already registered') || lower.includes('already been registered'))
      return new Error('Ese email ya tiene una cuenta. Probá iniciando sesión.');
    if (lower.includes('email not confirmed'))
      return new Error('La confirmación por email está activa en Supabase. Desactivala en Authentication > Providers > Email.');
    if (lower.includes('password should be') || lower.includes('weak password'))
      return new Error('La contraseña es demasiado débil. Usá al menos 8 caracteres.');
    if (lower.includes('captcha'))
      return new Error('No pudimos validar el captcha. Intentá de nuevo.');
    if (lower.includes('failed to fetch') || lower.includes('networkerror') || lower.includes('load failed'))
      return new Error('No pudimos conectar con Supabase. Revisá la configuración o si el proyecto está pausado.');
    if (lower.includes('duplicate key') && lower.includes('code'))
      return new Error('Ese código de producto ya existe. Usá otro.');
    if (lower.includes('row-level security') || lower.includes('permission denied'))
      return new Error('No tenés permisos para hacer esta operación.');
    if (lower.includes('jwt') && lower.includes('expired'))
      return new Error('La sesión venció. Volvé a iniciar sesión.');
    if (message) return new Error(message);
    return new Error(fallback);
  }

  /* Supabase --------------------------------------------------------------- */
  function initSupabase() {
    if (mode !== 'supabase') return;
    if (/service_role/i.test(supabaseAnonKey) || supabaseAnonKey.startsWith('sb_secret_')) {
      initError = new Error(
        'La configuración usa una clave secreta. Reemplazala por la publishable key o la anon public key.'
      );
      return;
    }
    if (!window.supabase || typeof window.supabase.createClient !== 'function') {
      initError = new Error('No se cargó la librería de Supabase. Revisá js/vendor/supabase.js.');
      return;
    }
    try {
      client = window.supabase.createClient(supabaseUrl, supabaseAnonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: false,
        },
      });
    } catch (error) {
      initError = normalizeError(error, 'No pudimos inicializar Supabase. Revisá la URL y la publishable key.');
    }
  }

  function assertSupabase() {
    if (initError) throw initError;
    if (!client) throw new Error('Supabase no está configurado. Ejecutá configurar.bat.');
    return client;
  }

  function publicImageUrl(path) {
    if (!path) return '';
    if (path.startsWith('data:') || path.startsWith('blob:') || path.startsWith('http')) return path;
    return assertSupabase().storage.from('product-images').getPublicUrl(path).data.publicUrl;
  }

  function mapSupabaseProduct(row) {
    const images = (row.product_images || [])
      .slice()
      .sort((a, b) => {
        const order = (a.sort_order || 0) - (b.sort_order || 0);
        return order !== 0 ? order : String(a.id).localeCompare(String(b.id));
      })
      .map((image) => ({
        id: image.id,
        productId: Number(row.id),
        path: image.storage_path,
        url: publicImageUrl(image.storage_path),
        alt: image.alt || '',
        sortOrder: image.sort_order || 0,
        isCover: Boolean(image.is_cover),
      }));

    return {
      id: Number(row.id),
      code: row.code,
      name: row.name,
      description: row.description || '',
      price: Number(row.price_cents || 0) / 100,
      oldPrice: Number(row.old_price_cents || 0) / 100,
      stock: Number(row.stock || 0),
      inStock: Number(row.stock || 0) > 0,
      collection: row.collection || null,
      category: row.category_id,
      subcategory: row.subcategory_id || null,
      icon: row.icon || 'toolbox',
      status: row.status || 'published',
      deletedAt: row.deleted_at || null,
      images,
    };
  }

  function productToRow(input) {
    return {
      code: String(input.code || '').trim().toUpperCase(),
      name: String(input.name || '').trim(),
      description: String(input.description || '').trim(),
      price_cents: Math.max(0, Math.round(Number(input.price || 0) * 100)),
      old_price_cents:
        Number(input.oldPrice || 0) > 0 ? Math.max(0, Math.round(Number(input.oldPrice) * 100)) : null,
      stock: Math.max(0, Math.round(Number(input.stock || 0))),
      category_id: input.category,
      subcategory_id: input.subcategory || null,
      collection: input.collection || null,
      icon: input.icon || 'toolbox',
      status: input.status === 'hidden' ? 'hidden' : 'published',
    };
  }

  async function supabaseGetCatalog() {
    const supabase = assertSupabase();
    const { data, error } = await supabase
      .from('products')
      .select('*, product_images(id, storage_path, alt, sort_order, is_cover)')
      .is('deleted_at', null)
      .eq('status', 'published')
      .order('id', { ascending: true });

    if (error) throw normalizeError(error, 'No pudimos cargar el catálogo.');
    return {
      categories: DATA.categories,
      products: (data || []).map(mapSupabaseProduct),
    };
  }

  async function supabaseGetAllProducts() {
    const supabase = assertSupabase();
    const { data, error } = await supabase
      .from('products')
      .select('*, product_images(id, storage_path, alt, sort_order, is_cover)')
      .order('id', { ascending: true });

    if (error) throw normalizeError(error, 'No pudimos cargar los productos.');
    return (data || []).map(mapSupabaseProduct);
  }

  async function supabaseGetProduct(id) {
    const supabase = assertSupabase();
    const { data, error } = await supabase
      .from('products')
      .select('*, product_images(id, storage_path, alt, sort_order, is_cover)')
      .eq('id', id)
      .single();

    if (error) throw normalizeError(error, 'No pudimos cargar el producto.');
    return mapSupabaseProduct(data);
  }

  async function supabaseSaveProduct(id, input) {
    const supabase = assertSupabase();
    const row = productToRow(input);

    if (!row.name || !row.code || !row.category_id) {
      throw new Error('Completá nombre, código y categoría.');
    }

    if (id) {
      const { data, error } = await supabase
        .from('products')
        .update(row)
        .eq('id', id)
        .select('*, product_images(id, storage_path, alt, sort_order, is_cover)')
        .single();
      if (error) throw normalizeError(error, 'No pudimos guardar los cambios.');
      return mapSupabaseProduct(data);
    }

    const { data, error } = await supabase
      .from('products')
      .insert(row)
      .select('*, product_images(id, storage_path, alt, sort_order, is_cover)')
      .single();
    if (error) throw normalizeError(error, 'No pudimos crear el producto.');
    return mapSupabaseProduct(data);
  }

  async function supabaseDeleteProduct(id, permanent = false) {
    const supabase = assertSupabase();
    const product = await supabaseGetProduct(id);

    if (permanent) {
      const paths = (product.images || []).map((image) => image.path).filter(Boolean);
      if (paths.length) {
        const { error: storageError } = await supabase.storage.from('product-images').remove(paths);
        if (storageError) throw normalizeError(storageError, 'No pudimos borrar las fotos del producto.');
      }
      const { error } = await supabase.from('products').delete().eq('id', id);
      if (error) throw normalizeError(error, 'No pudimos eliminar el producto.');
      return;
    }

    const { error } = await supabase
      .from('products')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw normalizeError(error, 'No pudimos enviar el producto a la papelera.');
  }

  async function supabaseRestoreProduct(id) {
    const supabase = assertSupabase();
    const { error } = await supabase.from('products').update({ deleted_at: null }).eq('id', id);
    if (error) throw normalizeError(error, 'No pudimos restaurar el producto.');
  }

  async function supabaseUploadImages(productId, files) {
    const supabase = assertSupabase();
    const product = await supabaseGetProduct(productId);
    const currentImages = product.images || [];

    const remaining = Math.max(0, MAX_IMAGES - currentImages.length);
    if (remaining === 0) throw new Error(`Cada producto puede tener hasta ${MAX_IMAGES} fotos.`);

    const list = Array.from(files || []).slice(0, remaining);
    const hasCover = currentImages.some((image) => image.isCover);
    const maxOrder = currentImages.reduce(
      (highest, image) => Math.max(highest, Number(image.sortOrder) || 0),
      -1
    );

    for (let index = 0; index < list.length; index += 1) {
      const prepared = await compressImage(list[index]);
      const path = `${productId}/${uid()}.webp`;
      const { error: uploadError } = await supabase.storage
        .from('product-images')
        .upload(path, prepared.blob, { contentType: 'image/webp', upsert: false });
      if (uploadError) throw normalizeError(uploadError, 'No pudimos subir la foto.');

      const { error: insertError } = await supabase.from('product_images').insert({
        product_id: productId,
        storage_path: path,
        alt: '',
        sort_order: maxOrder + 1 + index,
        is_cover: !hasCover && index === 0,
      });
      if (insertError) {
        await supabase.storage.from('product-images').remove([path]);
        throw normalizeError(insertError, 'No pudimos guardar la foto.');
      }
    }

    return supabaseGetProduct(productId);
  }

  async function supabaseDeleteImage(image) {
    const supabase = assertSupabase();
    if (image.path) {
      const { error: storageError } = await supabase.storage.from('product-images').remove([image.path]);
      if (storageError) throw normalizeError(storageError, 'No pudimos borrar el archivo de la foto.');
    }
    const { error } = await supabase.from('product_images').delete().eq('id', image.id);
    if (error) throw normalizeError(error, 'No pudimos borrar la foto.');

    if (image.isCover && image.productId) {
      const { data, error: nextError } = await supabase
        .from('product_images')
        .select('id')
        .eq('product_id', image.productId)
        .order('sort_order', { ascending: true })
        .limit(1);
      if (nextError) throw normalizeError(nextError, 'No pudimos actualizar la portada.');
      if (data && data.length) {
        const { error: coverError } = await supabase
          .from('product_images')
          .update({ is_cover: true })
          .eq('id', data[0].id);
        if (coverError) throw normalizeError(coverError, 'No pudimos actualizar la portada.');
      }
    }
  }

  async function supabaseSetCover(productId, imageId) {
    const supabase = assertSupabase();
    const { error: clearError } = await supabase
      .from('product_images')
      .update({ is_cover: false })
      .eq('product_id', productId);
    if (clearError) throw normalizeError(clearError, 'No pudimos cambiar la portada.');

    const { error } = await supabase.from('product_images').update({ is_cover: true }).eq('id', imageId);
    if (error) throw normalizeError(error, 'No pudimos cambiar la portada.');
  }

  async function supabaseMoveImage(productId, imageId, direction) {
    const supabase = assertSupabase();
    const { data, error } = await supabase
      .from('product_images')
      .select('id, sort_order')
      .eq('product_id', productId)
      .order('sort_order', { ascending: true });
    if (error) throw normalizeError(error, 'No pudimos reordenar las fotos.');

    const list = data || [];
    const index = list.findIndex((image) => image.id === imageId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= list.length) return;

    const current = list[index];
    const other = list[target];
    const updates = [
      { id: current.id, sort_order: other.sort_order },
      { id: other.id, sort_order: current.sort_order },
    ];

    for (const update of updates) {
      const { error: updateError } = await supabase
        .from('product_images')
        .update({ sort_order: update.sort_order })
        .eq('id', update.id);
      if (updateError) throw normalizeError(updateError, 'No pudimos reordenar las fotos.');
    }
  }

  async function supabaseResetDemo() {
    const supabase = assertSupabase();
    const { data, error } = await supabase.from('product_images').select('storage_path');
    if (error) throw normalizeError(error, 'No pudimos preparar la restauración.');

    const paths = (data || []).map((image) => image.storage_path).filter(Boolean);
    for (let index = 0; index < paths.length; index += 100) {
      const batch = paths.slice(index, index + 100);
      const { error: storageError } = await supabase.storage.from('product-images').remove(batch);
      if (storageError) throw normalizeError(storageError, 'No pudimos borrar las fotos de la demo.');
    }

    const { error: rpcError } = await supabase.rpc('reset_demo_catalog');
    if (rpcError) throw normalizeError(rpcError, 'No pudimos restaurar el catálogo.');
  }

  async function supabaseGetAudit() {
    const supabase = assertSupabase();
    const { data, error } = await supabase
      .from('audit_log')
      .select('id, action, entity, entity_id, before, after, created_at, user_id')
      .order('created_at', { ascending: false })
      .limit(30);
    if (error) throw normalizeError(error, 'No pudimos cargar el historial.');
    return data || [];
  }

  async function supabaseGetSession() {
    const supabase = assertSupabase();
    const { data, error } = await supabase.auth.getSession();
    if (error) throw normalizeError(error, 'No pudimos leer la sesión.');
    return mapSupabaseUser(data.session ? data.session.user : null);
  }

  async function supabaseSignUp({ name, email, password, captchaToken }) {
    const supabase = assertSupabase();
    const { data, error } = await supabase.auth.signUp({
      email: String(email || '').trim().toLowerCase(),
      password,
      options: {
        data: { full_name: String(name || '').trim() },
        ...(captchaToken ? { captchaToken } : {}),
      },
    });
    if (error) throw normalizeError(error, 'No pudimos crear la cuenta.');
    if (!data.session) {
      throw new Error(
        'La confirmación por email está activa en Supabase. Desactivala en Authentication > Providers > Email para que el registro sea directo.'
      );
    }
    return mapSupabaseUser(data.session.user);
  }

  async function supabaseSignIn({ email, password, captchaToken }) {
    const supabase = assertSupabase();
    const { data, error } = await supabase.auth.signInWithPassword({
      email: String(email || '').trim().toLowerCase(),
      password,
      options: captchaToken ? { captchaToken } : undefined,
    });
    if (error) throw normalizeError(error, 'No pudimos iniciar sesión.');
    return mapSupabaseUser(data.session ? data.session.user : null);
  }

  async function supabaseSignOut() {
    const supabase = assertSupabase();
    const { error } = await supabase.auth.signOut();
    if (error) throw normalizeError(error, 'No pudimos cerrar sesión.');
  }

  async function supabaseUpdatePassword({ password }) {
    const supabase = assertSupabase();
    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw normalizeError(error, 'No pudimos cambiar la contraseña.');
  }

  function supabaseOnAuthChange(callback) {
    if (!client) return () => {};
    const { data } = client.auth.onAuthStateChange((_event, session) => {
      callback(mapSupabaseUser(session ? session.user : null));
    });
    return () => {
      if (data && data.subscription) data.subscription.unsubscribe();
    };
  }

  /* IndexedDB para fotos del modo local ------------------------------------ */
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
    if (imageCache && !force) return imageCache;
    imageCache = new Map();
    try {
      const rows = await imageDbGetAll();
      rows.forEach((row) => {
        if (row.id && row.dataUrl) imageCache.set(`local:${row.id}`, row.dataUrl);
      });
    } catch (error) {
      imageCache = new Map();
    }
    return imageCache;
  }

  /* Modo local ------------------------------------------------------------- */
  function seedProducts() {
    return DATA.products.map((product) => ({
      ...product,
      description: product.description || '',
      stock: product.inStock ? 10 : 0,
      status: 'published',
      deletedAt: null,
      images: [],
    }));
  }

  function readLocalProducts() {
    const saved = readStorage(LOCAL_KEYS.products);
    if (Array.isArray(saved)) return saved;
    const seeded = seedProducts();
    writeStorage(LOCAL_KEYS.products, seeded);
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
        id: `demo-${seed.email === 'admin@ferromax.com' ? 'admin' : 'client'}`,
        email: seed.email,
        name: seed.email === 'admin@ferromax.com' ? 'Admin FerroMax' : 'Cliente Demo',
        role: seed.email === 'admin@ferromax.com' ? 'admin' : 'customer',
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
      .map((image) => ({
        ...image,
        url: cache.get(image.path) || '',
      }))
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
    if (!file || !String(file.type || '').startsWith('image/')) {
      throw new Error('El archivo tiene que ser una imagen JPG, PNG o WebP.');
    }
    if (file.size > MAX_FILE_SIZE) {
      throw new Error('Cada foto puede pesar como máximo 5 MB.');
    }

    let bitmap;
    try {
      bitmap = await createImageBitmap(file);
    } catch (error) {
      throw new Error('No pudimos leer la imagen. Probá con otro archivo.');
    }

    const maxSize = 1200;
    const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('No pudimos procesar la imagen.');
    context.drawImage(bitmap, 0, 0, width, height);
    if (typeof bitmap.close === 'function') bitmap.close();

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
    if (mode === 'local') return getLocalSessionUser();
    if (!client) return null;
    return supabaseGetSession();
  }

  const ready = (async () => {
    if (mode === 'local') {
      await ensureLocalUsers();
      readLocalProducts();
      await loadImageCache();
      return;
    }
    initSupabase();
  })();

  const backend = {
    mode,
    isLocal: mode === 'local',
    isSupabase: mode === 'supabase',
    config: CONFIG,
    demoCredentials: mode === 'local' ? DEMO_CREDENTIALS : [],
    maxImages: MAX_IMAGES,
    ready,
    getSetupStatus() {
      return {
        mode,
        configured: mode === 'supabase',
        hasTurnstile: Boolean(CONFIG.turnstileSiteKey),
        error: initError ? initError.message : '',
      };
    },
    getCatalog() {
      return mode === 'local' ? localGetCatalog() : supabaseGetCatalog();
    },
    getSession,
    onAuthChange(callback) {
      return mode === 'local' ? localOnAuthChange(callback) : supabaseOnAuthChange(callback);
    },
    async signUp(payload) {
      await ready;
      return mode === 'local' ? localSignUp(payload) : supabaseSignUp(payload);
    },
    async signIn(payload) {
      await ready;
      return mode === 'local' ? localSignIn(payload) : supabaseSignIn(payload);
    },
    async signOut() {
      await ready;
      return mode === 'local' ? localSignOut() : supabaseSignOut();
    },
    async updatePassword(payload) {
      await ready;
      return mode === 'local' ? localUpdatePassword(payload) : supabaseUpdatePassword(payload);
    },
    admin: {
      async getProducts() {
        await ready;
        return mode === 'local' ? localGetAllProducts() : supabaseGetAllProducts();
      },
      async getProduct(id) {
        await ready;
        return mode === 'local' ? localGetProduct(id) : supabaseGetProduct(id);
      },
      async saveProduct(id, input) {
        await ready;
        return mode === 'local' ? localSaveProduct(id, input) : supabaseSaveProduct(id, input);
      },
      async deleteProduct(id, permanent = false) {
        await ready;
        return mode === 'local' ? localDeleteProduct(id, permanent) : supabaseDeleteProduct(id, permanent);
      },
      async restoreProduct(id) {
        await ready;
        return mode === 'local' ? localRestoreProduct(id) : supabaseRestoreProduct(id);
      },
      async uploadImages(productId, files) {
        await ready;
        return mode === 'local' ? localUploadImages(productId, files) : supabaseUploadImages(productId, files);
      },
      async deleteImage(image) {
        await ready;
        return mode === 'local' ? localDeleteImage(image) : supabaseDeleteImage(image);
      },
      async setCover(productId, imageId) {
        await ready;
        return mode === 'local' ? localSetCover(productId, imageId) : supabaseSetCover(productId, imageId);
      },
      async moveImage(productId, imageId, direction) {
        await ready;
        return mode === 'local' ? localMoveImage(productId, imageId, direction) : supabaseMoveImage(productId, imageId, direction);
      },
      async resetDemo() {
        await ready;
        return mode === 'local' ? localResetDemo() : supabaseResetDemo();
      },
      async getAudit() {
        await ready;
        return mode === 'local' ? localAuditList() : supabaseGetAudit();
      },
    },
  };

  window.FerroMaxBackend = backend;
})();
