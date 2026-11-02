import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { loadCatalogData, readProjectFile } from './support/catalog.mjs';

const data = loadCatalogData();
const seed = readProjectFile('supabase/migrations/20261031000400_seed.sql');

function parseSeedRows(sql) {
  const rowPattern =
    /^\s*\((\d+),\s*'([^']*)',\s*'([^']*)',\s*'([^']*)',\s*(\d+),\s*(null|\d+),\s*(\d+),\s*'([^']*)',\s*(null|'[^']*'),\s*(null|'[^']*'),\s*'([^']*)',\s*'([^']*)'\),?\s*$/gm;

  const rows = [];
  let match;
  while ((match = rowPattern.exec(sql)) !== null) {
    rows.push({
      id: Number(match[1]),
      code: match[2],
      name: match[3],
      description: match[4],
      priceCents: Number(match[5]),
      oldPriceCents: match[6] === 'null' ? null : Number(match[6]),
      stock: Number(match[7]),
      category: match[8],
      subcategory: match[9] === 'null' ? null : match[9].slice(1, -1),
      collection: match[10] === 'null' ? null : match[10].slice(1, -1),
      icon: match[11],
      status: match[12],
    });
  }
  return rows;
}

describe('Paridad entre data.js y la semilla SQL', () => {
  const rows = parseSeedRows(seed);

  test('la semilla contiene exactamente los 32 productos', () => {
    assert.equal(rows.length, 32);
    assert.equal(data.products.length, rows.length);
  });

  test('cada producto coincide en ID, código, nombre y descripción', () => {
    const seedById = new Map(rows.map((row) => [row.id, row]));
    for (const product of data.products) {
      const row = seedById.get(product.id);
      assert.ok(row, `Falta el producto ${product.id} en seed.sql`);
      assert.equal(row.code, product.code, `Código distinto para el ID ${product.id}`);
      assert.equal(row.name, product.name, `Nombre distinto para el ID ${product.id}`);
      assert.equal(row.description, product.description || '', `Descripción distinta para ${product.code}`);
      assert.equal(row.status, 'published');
    }
  });

  test('precios, stock, categorías y colecciones coinciden', () => {
    const seedById = new Map(rows.map((row) => [row.id, row]));

    for (const product of data.products) {
      const row = seedById.get(product.id);
      assert.ok(row);
      assert.equal(row.priceCents, Math.round(product.price * 100), `Precio distinto en ${product.code}`);
      assert.equal(
        row.oldPriceCents ?? 0,
        Math.round((product.oldPrice || 0) * 100),
        `Precio anterior distinto en ${product.code}`
      );
      assert.equal(row.stock > 0, product.inStock, `Stock distinto en ${product.code}`);
      assert.equal(row.category, product.category, `Categoría distinta en ${product.code}`);
      assert.equal(row.subcategory, product.subcategory, `Subcategoría distinta en ${product.code}`);
      assert.equal(row.collection, product.collection, `Colección distinta en ${product.code}`);
      assert.equal(row.icon, product.icon, `Icono distinto en ${product.code}`);
    }
  });

  test('la semilla configura la secuencia después del ID 38', () => {
    assert.match(seed, /pg_get_serial_sequence\('public\.products', 'id'\)/);
    assert.match(seed, /greatest\(\(select coalesce\(max\(id\), 1\) from public\.products\), 1\)/);
    assert.match(seed, /on conflict \(id\) do nothing/);
  });
});
