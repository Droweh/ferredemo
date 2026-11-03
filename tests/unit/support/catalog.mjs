import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const projectRoot = resolve(fileURLToPath(new URL('../../../', import.meta.url)));

export function loadCatalogData() {
  const source = readFileSync(resolve(projectRoot, 'public/js/data.js'), 'utf8');
  const sandbox = { window: {} };
  runInNewContext(source, sandbox, { filename: 'public/js/data.js' });
  return sandbox.window.FERREDEMO;
}

export function readProjectFile(relativePath) {
  return readFileSync(resolve(projectRoot, relativePath), 'utf8');
}
