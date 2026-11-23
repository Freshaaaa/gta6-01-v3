// Solmar Bay 3D — serve: a tiny static file server for local playtesting.
// Serves the game/ folder at the root, so http://localhost:8087/ opens
// game/index.html. No dependencies, Node's standard library only.
//
//   node serve.ts --port 8087
//
// A path that names no file answers 404 (the playtest loads /__blank__ on
// purpose to clear localStorage on this origin, and a 404 there is fine).
// Only files under game/ are ever served, and every MIME type the game
// needs is mapped below.

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const GAME_ROOT = join(here, 'game');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
};

function portFromArgs() {
  const args = process.argv.slice(2);
  const i = args.indexOf('--port');
  if (i >= 0 && args[i + 1]) {
    const p = parseInt(args[i + 1], 10);
    if (Number.isFinite(p) && p > 0 && p < 65536) return p;
  }
  return 8087;
}

const PORT = portFromArgs();

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', 'http://127.0.0.1');
    let rel = decodeURIComponent(url.pathname);
    if (rel === '/') rel = '/index.html';
    // Never serve outside game/: normalise and reject any escape.
    const target = normalize(join(GAME_ROOT, rel));
    if (!target.startsWith(GAME_ROOT)) {
      res.writeHead(403, { 'content-type': 'text/plain' });
      res.end('forbidden');
      return;
    }
    const info = await stat(target).catch(() => null);
    if (!info || !info.isFile()) {
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('not found');
      return;
    }
    const body = await readFile(target);
    res.writeHead(200, {
      'content-type': MIME[extname(target).toLowerCase()] || 'application/octet-stream',
      'content-length': body.length,
      'cache-control': 'no-store',
    });
    res.end(body);
  } catch {
    res.writeHead(500, { 'content-type': 'text/plain' });
    res.end('server error');
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log('Solmar Bay 3D serving game/ at http://127.0.0.1:' + PORT + '/');
});
