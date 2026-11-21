// Solmar Bay 3D dev server: serves game/ over HTTP for local play and
// screenshot staging. Node 22 standard library only; no dependencies.
// Usage: `node serve.ts [--port N]` (default port 8080, binds 127.0.0.1).
//
// Behaviour: GET and HEAD only (anything else is 405 with an Allow
// header); only files under game/ are served (anything else is 403);
// missing paths and non-files are 404; served files carry their MIME
// type, a content-length, and `cache-control: no-store`; HEAD answers
// with headers only. Requests it cannot serve are logged to stderr.
import { createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const GAME_DIR = resolve(fileURLToPath(new URL('./game', import.meta.url)));

function pickPort(argv: string[]): number {
  const i = argv.indexOf('--port');
  if (i === -1) return 8080;
  const n = Number(argv[i + 1]);
  return Number.isInteger(n) && n > 0 && n < 65536 ? n : 8080;
}

const PORT = pickPort(process.argv.slice(2));

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.bin': 'application/octet-stream',
  '.wasm': 'application/wasm',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.txt': 'text/plain; charset=utf-8',
};

function fail(response, status: number, body: string, headers: Record<string, string> = {}): void {
  response.writeHead(status, headers).end(body);
}

createServer((request, response) => {
  let path: string;
  try {
    path = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname);
  } catch {
    fail(response, 400, 'bad request');
    return;
  }
  if (path.endsWith('/')) path += 'index.html';
  const method = request.method ?? '';
  if (method !== 'GET' && method !== 'HEAD') {
    fail(response, 405, 'method not allowed', { allow: 'GET, HEAD' });
    console.error(`${method} ${path} -> 405 method not allowed`);
    return;
  }
  const file = resolve(join(GAME_DIR, normalize(path)));
  if (file !== GAME_DIR && !file.startsWith(GAME_DIR + sep)) {
    fail(response, 403, 'forbidden');
    console.error(`${method} ${path} -> 403 forbidden`);
    return;
  }
  let size: number;
  try {
    const info = statSync(file);
    if (!info.isFile()) throw new Error('not a file');
    size = info.size;
  } catch {
    fail(response, 404, 'not found');
    console.error(`${method} ${path} -> 404 not found`);
    return;
  }
  response.writeHead(200, {
    'content-type': TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream',
    'content-length': size,
    'cache-control': 'no-store',
  });
  if (method === 'HEAD') {
    response.end();
    return;
  }
  createReadStream(file).pipe(response);
}).listen(PORT, '127.0.0.1', () => {
  console.log(`game/ is on http://localhost:${PORT}`);
});
