import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { before, describe, test } from 'node:test';
import { createClient } from '@supabase/supabase-js';

/*
 * Suite de integración RLS y Storage.
 *
 * Requiere un proyecto Supabase EXCLUSIVO DE PRUEBAS. Nunca apuntar a la demo
 * pública. Las variables se leen del entorno del runner:
 *
 *   SUPABASE_TEST_URL
 *   SUPABASE_TEST_ANON_KEY
 *   SUPABASE_TEST_SERVICE_ROLE_KEY
 *   SUPABASE_TEST_ALLOW_WRITES=true   (obligatorio para las pruebas con datos)
 *
 * La service_role se usa únicamente en este proceso local para preparar y
 * limpiar datos de prueba. No se escribe en archivos ni se expone al navegador.
 */

const testUrl = String(process.env.SUPABASE_TEST_URL || '').trim().replace(/\/+$/, '');
const anonKey = String(process.env.SUPABASE_TEST_ANON_KEY || '').trim();
const serviceKey = String(process.env.SUPABASE_TEST_SERVICE_ROLE_KEY || '').trim();
const allowWrites = process.env.SUPABASE_TEST_ALLOW_WRITES === 'true';
const publicDemoUrl = String(process.env.SUPABASE_URL || '').trim().replace(/\/+$/, '');

const missingBase = [
  !testUrl && 'SUPABASE_TEST_URL',
  !anonKey && 'SUPABASE_TEST_ANON_KEY',
].filter(Boolean);

const isSameAsPublicDemo =
  Boolean(testUrl && publicDemoUrl) && testUrl.toLowerCase() === publicDemoUrl.toLowerCase();

const baseSkip = missingBase.length
  ? `Faltan variables del proyecto exclusivo de pruebas: ${missingBase.join(', ')}.`
  : isSameAsPublicDemo
    ? 'SUPABASE_TEST_URL coincide con la demo pública. Se niega a ejecutar.'
    : false;

const writesSkip = baseSkip
  ? baseSkip
  : !serviceKey
    ? 'Falta SUPABASE_TEST_SERVICE_ROLE_KEY para preparar datos de prueba.'
    : !allowWrites
      ? 'Definí SUPABASE_TEST_ALLOW_WRITES=true para habilitar las pruebas que crean datos.'
      : false;

const testCode = () => `E2E${Date.now().toString().slice(-7)}${Math.floor(Math.random() * 10)}`;

function tempProduct(code) {
  return {
    code,
    name: `Producto temporal ${code}`,
    description: 'Dato temporal de la suite RLS.',
    price_cents: 1234,
    stock: 1,
    category_id: 'herramientas',
    status: 'published',
  };
}

describe('RLS de FerroMax (proyecto exclusivo de pruebas)', { skip: baseSkip }, () => {
  let anon;

  before(() => {
    anon = createClient(testUrl, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  });

  test('el catálogo público solo devuelve productos publicados y no borrados', async () => {
    const { data, error } = await anon
      .from('products')
      .select('id, status, deleted_at, name')
      .limit(200);

    assert.ifError(error);
    assert.ok(Array.isArray(data) && data.length > 0, 'El proyecto de prueba no tiene catálogo.');
    for (const row of data) {
      assert.equal(row.status, 'published');
      assert.equal(row.deleted_at, null);
    }
  });

  test('anon no puede leer el historial de auditoría', async () => {
    const { data, error } = await anon.from('audit_log').select('id, action').limit(5);
    assert.ifError(error);
    assert.deepEqual(data, []);
  });

  test('anon no puede leer productos ocultos aunque conozca el ID', async () => {
    const { data: visible, error: visibleError } = await anon
      .from('products')
      .select('id')
      .limit(1)
      .maybeSingle();
    assert.ifError(visibleError);
    assert.ok(visible);

    const { data, error } = await anon
      .from('products')
      .select('id, status')
      .eq('id', visible.id);
    assert.ifError(error);
    for (const row of data || []) {
      assert.equal(row.status, 'published');
    }
  });

  describe('escrituras de anon y clientes', { skip: writesSkip }, () => {
    let service;

    before(() => {
      service = createClient(testUrl, serviceKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
    });

    test('anon no puede insertar, actualizar ni borrar productos', async () => {
      const code = testCode();
      const { data: created, error: createError } = await service
        .from('products')
        .insert(tempProduct(code))
        .select('id, name')
        .single();
      assert.ifError(createError);

      try {
        const insert = await anon.from('products').insert(tempProduct(`${code}A`)).select('id');
        assert.ok(insert.error, 'anon pudo insertar un producto');

        const update = await anon
          .from('products')
          .update({ name: 'Nombre cambiado por anon' })
          .eq('id', created.id)
          .select('id');
        assert.ok(!update.error || update.data?.length === 0);

        const remove = await anon.from('products').delete().eq('id', created.id).select('id');
        assert.ok(!remove.error || remove.data?.length === 0);

        const { data: after, error: afterError } = await service
          .from('products')
          .select('id, name')
          .eq('id', created.id)
          .maybeSingle();
        assert.ifError(afterError);
        assert.ok(after, 'anon logró borrar el producto');
        assert.equal(after.name, `Producto temporal ${code}`, 'anon logró actualizar el producto');
      } finally {
        await service.from('products').delete().eq('id', created.id);
      }
    });

    test('un cliente autenticado común tampoco puede administrar productos', async () => {
      const code = testCode();
      const email = `rls-client-${randomUUID()}@example.com`;
      const password = `Cliente-${randomUUID()}`;

      const { data: createdUser, error: userError } = await service.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: 'Cliente RLS' },
      });
      assert.ifError(userError);

      const { data: created, error: createError } = await service
        .from('products')
        .insert(tempProduct(code))
        .select('id')
        .single();
      assert.ifError(createError);

      try {
        const client = createClient(testUrl, anonKey, {
          auth: { persistSession: false, autoRefreshToken: false },
        });
        const { error: signInError } = await client.auth.signInWithPassword({ email, password });
        assert.ifError(signInError);

        const update = await client
          .from('products')
          .update({ name: 'Actualizado por cliente' })
          .eq('id', created.id)
          .select('id');
        assert.ok(!update.error || update.data?.length === 0);

        const { data: after } = await service
          .from('products')
          .select('name')
          .eq('id', created.id)
          .maybeSingle();
        assert.equal(after.name, `Producto temporal ${code}`);

        const audit = await client.from('audit_log').select('id').limit(1);
        assert.ifError(audit.error);
        assert.deepEqual(audit.data, []);
      } finally {
        await service.from('products').delete().eq('id', created.id);
        if (createdUser?.user?.id) await service.auth.admin.deleteUser(createdUser.user.id);
      }
    });

    test('un administrador puede crear, editar y borrar sus productos', async () => {
      const code = testCode();
      const email = `rls-admin-${randomUUID()}@example.com`;
      const password = `Admin-${randomUUID()}`;

      const { data: createdUser, error: userError } = await service.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        app_metadata: { role: 'admin' },
        user_metadata: { full_name: 'Admin RLS' },
      });
      assert.ifError(userError);

      const admin = createClient(testUrl, anonKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });

      try {
        const { error: signInError } = await admin.auth.signInWithPassword({ email, password });
        assert.ifError(signInError);

        const { data: created, error: createError } = await admin
          .from('products')
          .insert(tempProduct(code))
          .select('id, name')
          .single();
        assert.ifError(createError);

        const { data: updated, error: updateError } = await admin
          .from('products')
          .update({ name: `Producto editado ${code}`, stock: 4 })
          .eq('id', created.id)
          .select('id, name, stock')
          .single();
        assert.ifError(updateError);
        assert.equal(updated.name, `Producto editado ${code}`);
        assert.equal(updated.stock, 4);

        const { data: audit, error: auditError } = await admin
          .from('audit_log')
          .select('id, action')
          .eq('entity_id', String(created.id))
          .limit(10);
        assert.ifError(auditError);
        assert.ok(audit.length >= 2, 'El trigger de auditoría no registró los cambios');

        const { error: deleteError } = await admin.from('products').delete().eq('id', created.id);
        assert.ifError(deleteError);

        const { data: gone, error: goneError } = await service
          .from('products')
          .select('id')
          .eq('id', created.id)
          .maybeSingle();
        assert.ifError(goneError);
        assert.equal(gone, null);
      } finally {
        await service.from('products').delete().eq('id', created.id).eq('code', code);
        if (createdUser?.user?.id) await service.auth.admin.deleteUser(createdUser.user.id);
      }
    });

    test('anon no puede restaurar la demo ni subir archivos', async () => {
      const reset = await anon.rpc('reset_demo_catalog');
      assert.ok(reset.error, 'anon pudo ejecutar reset_demo_catalog');

      const path = `pruebas-rls/${randomUUID()}.webp`;
      const upload = await anon.storage.from('product-images').upload(path, Buffer.from('no-es-webp'), {
        contentType: 'image/webp',
        upsert: false,
      });
      assert.ok(upload.error, 'anon pudo subir un archivo a Storage');

      if (!upload.error) {
        await service.storage.from('product-images').remove([path]);
      }
    });
  });
});
