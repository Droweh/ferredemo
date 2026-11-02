/* Servidor estático mínimo para probar y ejecutar la suite de Playwright.
   Sirve exclusivamente la carpeta public/ y no permite salir de ella. */
import { createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('../public/', import.meta.url)));
const host = process.env.HOST || '127.0.0.1';
const port = Number(process.env.PORT || 4173);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

function send(response, status, body, headers = {}) {
  response.writeHead(status, {
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...headers,
  });
  response.end(body);
}

const server = createServer((request, response) => {
  if (request.url === '/healthz') {
    send(response, 200, 'ok', { 'Content-Type': 'text/plain; charset=utf-8' });
    return;
  }

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    send(response, 405, 'Método no permitido', { Allow: 'GET, HEAD' });
    return;
  }

  let pathname;
  try {
    pathname = decodeURIComponent(new URL(request.url, `http://${request.headers.host || host}`).pathname);
  } catch {
    send(response, 400, 'Solicitud inválida');
    return;
  }

  const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const filePath = resolve(join(root, normalize(relative)));
  if (filePath !== root && !filePath.startsWith(root + sep)) {
    send(response, 403, 'Prohibido');
    return;
  }

  let stats;
  try {
    stats = statSync(filePath);
  } catch {
    send(response, 404, 'No encontrado');
    return;
  }

  if (stats.isDirectory()) {
    send(response, 404, 'No encontrado');
    return;
  }

  const headers = {
    'Content-Type': MIME[extname(filePath).toLowerCase()] || 'application/octet-stream',
    'Content-Length': stats.size,
  };

  if (request.method === 'HEAD') {
    response.writeHead(200, { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers });
    response.end();
    return;
  }

  response.writeHead(200, { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers });
  createReadStream(filePath).pipe(response);
});

server.listen(port, host, () => {
  console.log(`FerroMax test server en http://${host}:${port}/`);
});

function shutdown() {
  server.close(() => process.exit(0));
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
