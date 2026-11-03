import { readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import { projectRoot } from '../../unit/support/catalog.mjs';

const SKIP_DIRS = new Set([
  '.git',
  'node_modules',
  'playwright-report',
  'test-results',
]);

const TEXT_EXTENSIONS = new Set([
  '.html',
  '.css',
  '.js',
  '.mjs',
  '.cjs',
  '.ts',
  '.json',
  '.md',
  '.sql',
  '.yml',
  '.yaml',
  '.bat',
  '.ps1',
  '.txt',
  '.example',
]);

export function walkProject(directory = projectRoot, files = []) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const absolute = join(directory, entry.name);
    if (entry.isDirectory()) {
      walkProject(absolute, files);
    } else if (entry.isFile() && TEXT_EXTENSIONS.has(extname(entry.name).toLowerCase())) {
      files.push(absolute);
    }
  }
  return files;
}

export function readRelative(relativePath) {
  return readFileSync(join(projectRoot, relativePath), 'utf8');
}

export function relativeToProject(absolutePath) {
  return relative(projectRoot, absolutePath).replaceAll('\\', '/');
}

export function fileSize(absolutePath) {
  return statSync(absolutePath).size;
}
