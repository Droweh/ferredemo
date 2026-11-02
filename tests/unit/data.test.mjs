import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { loadCatalogData, projectRoot } from './support/catalog.mjs';

const data = loadCatalogData();
const categories = data.categories;
const products = data.products;
const categoryById = new Map(categories.map((category) => [category.id, category]));
const icons = new Set([
  'toolbox',
  'drill',
  'grinder',
  'driver',
  'wrench',
  'screw',
  'lock',
  'battery',
  'spray',
  'level',
  'sprout',
  'gear',
  'bulb',
  'bolt',
  'roller',
  'house',
  'hose',
]);

describe('Catálogo base de FerreDemo', () => {
  test('conserva 9 categorías y 36 subcategorías', () => {
    assert.equal(categories.length, 9);
    const subcategories = categories.flatMap((category) => category.children);
    assert.equal(subcategories.length, 36);
  });

  test('cada categoría y subcategoría tiene identificadores únicos', () => {
    const categoryIds = categories.map((category) => category.id);
    assert.equal(new Set(categoryIds).size, categoryIds.length);

    const subcategoryIds = categories.flatMap((category) =>
      category.children.map((child) => `${category.id}/${child.id}`)
    );
    assert.equal(new Set(subcategoryIds).size, subcategoryIds.length);

    for (const category of categories) {
      assert.match(category.id, /^[a-z0-9-]+$/);
      assert.ok(category.name.trim().length > 0);
      assert.ok(category.description.trim().length > 0);
      assert.ok(icons.has(category.icon), `Icono desconocido en ${category.id}: ${category.icon}`);
      for (const child of category.children) {
        assert.match(child.id, /^[a-z0-9-]+$/);
        assert.ok(child.name.trim().length > 0);
      }
    }
  });

  test('conserva 32 productos con IDs originales dentro de 1–38', () => {
    assert.equal(products.length, 32);
    const ids = products.map((product) => product.id);
    assert.equal(new Set(ids).size, ids.length);
    for (const id of ids) {
      assert.ok(Number.isInteger(id) && id >= 1 && id <= 38, `ID fuera de rango: ${id}`);
    }
    assert.equal(Math.min(...ids), 1);
    assert.equal(Math.max(...ids), 38);
  });

  test('los códigos, nombres y relaciones son válidos', () => {
    const codes = new Set();
    const names = new Set();

    for (const product of products) {
      assert.match(product.code, /^FD\d{4}$/);
      assert.equal(product.code, `FD${1000 + product.id}`, `Código fuera de la serie FD para el ID ${product.id}`);
      assert.ok(!codes.has(product.code), `Código duplicado: ${product.code}`);
      codes.add(product.code);

      assert.ok(product.name.trim().length > 0);
      assert.ok(!names.has(product.name), `Nombre duplicado: ${product.name}`);
      names.add(product.name);

      const category = categoryById.get(product.category);
      assert.ok(category, `Categoría inexistente en ${product.code}: ${product.category}`);
      if (product.subcategory !== null) {
        assert.ok(
          category.children.some((child) => child.id === product.subcategory),
          `Subcategoría inválida en ${product.code}: ${product.subcategory}`
        );
      }
      assert.ok(
        product.collection === null || product.collection === 'combos' || product.collection === 'nuevos',
        `Colección inválida en ${product.code}: ${product.collection}`
      );
      assert.ok(icons.has(product.icon), `Icono inválido en ${product.code}: ${product.icon}`);
    }
  });

  test('cada producto tiene descripción, características y fotos locales', () => {
    const files = new Set();

    for (const product of products) {
      assert.ok(
        typeof product.description === 'string' && product.description.trim().length >= 40,
        `Descripción demasiado corta en ${product.code}`
      );

      assert.ok(Array.isArray(product.features), `Sin características en ${product.code}`);
      assert.ok(
        product.features.length >= 3 && product.features.length <= 5,
        `Cantidad de características inválida en ${product.code}`
      );
      for (const feature of product.features) {
        assert.ok(typeof feature === 'string' && feature.trim().length > 0, `Característica vacía en ${product.code}`);
      }

      assert.ok(Array.isArray(product.images), `Sin campo images en ${product.code}`);
      assert.ok(
        product.images.length >= 1 && product.images.length <= 2,
        `Cantidad de fotos inválida en ${product.code}`
      );
      assert.equal(new Set(product.images).size, product.images.length, `Fotos repetidas en ${product.code}`);

      for (const image of product.images) {
        assert.match(image, /^images\/products\/p\d{2}-\d\.jpg$/, `Ruta de foto inválida en ${product.code}: ${image}`);
        assert.ok(!/^https?:/.test(image), `La foto de ${product.code} no puede ser un hotlink`);
        assert.ok(
          existsSync(join(projectRoot, 'public', image)),
          `Falta el archivo de la foto ${image} de ${product.code}`
        );
        files.add(image);
      }
    }

    assert.equal(files.size, 33, 'La demo debe publicar las 33 fotos locales');
  });

  test('precios y disponibilidad son coherentes', () => {
    for (const product of products) {
      assert.equal(typeof product.price, 'number');
      assert.ok(product.price > 0, `Precio inválido en ${product.code}`);
      assert.equal(typeof product.oldPrice, 'number');
      assert.ok(product.oldPrice >= 0);
      if (product.oldPrice > 0) {
        assert.ok(
          product.oldPrice > product.price,
          `El precio anterior no es mayor al actual en ${product.code}`
        );
      }
      assert.equal(typeof product.inStock, 'boolean');
    }
  });

  test('mantiene las colecciones de portada', () => {
    assert.equal(products.filter((product) => product.collection === 'combos').length, 8);
    assert.equal(products.filter((product) => product.collection === 'nuevos').length, 6);
    assert.equal(products.filter((product) => product.collection === null).length, 18);
  });
});
