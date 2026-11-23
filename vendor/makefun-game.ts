// Solmar Bay 3D — vendor/makefun-game.ts: the dossier builder.
// buildDossier reads a built output directory (game/ and screenshots/
// already copied there) and writes the dossier.json the judge reads:
// a compact JSON object with the cover index, the screenshots as base64,
// the schema tag, and the dossier text (a Game block, then every source
// file under a heading with its path, lines and bytes, index.html first,
// then the scripts in the order the page loads them, then the rest by
// path). The text is capped at text_max_bytes; the file is deterministic,
// so two runs write the same bytes.
//
// The format is the make.fun dossier/v1 format: the Game block lists the
// source files, the vendored files, the assets and the totals; each source
// is fenced in its language; the text ends with the last fence. Only the
// header comment and the section comments here are this entry's own — the
// behaviour (the bytes buildDossier writes) is the library's.

import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, dirname, extname, sep } from 'node:path';

// --- Section: file classification ---

// A source file is one the dossier prints as text: an .html, .js, .mjs,
// .css, .glsl, .vert, .frag, .wgsl or .json file under game/, not under a
// directory named vendor and not named *.min.js, *.min.mjs or *.min.css.
const SOURCE_EXTS = new Set(['.html', '.js', '.mjs', '.css', '.glsl', '.vert', '.frag', '.wgsl', '.json']);
const MIN_SUFFIXES = ['.min.js', '.min.mjs', '.min.css'];

function isMinified(name) {
  return MIN_SUFFIXES.some((s) => name.endsWith(s));
}

function isSource(relPath) {
  const parts = relPath.split('/');
  if (parts.includes('vendor')) return false;
  const name = parts[parts.length - 1];
  if (isMinified(name)) return false;
  return SOURCE_EXTS.has(extname(name).toLowerCase());
}

// A vendored file is one under a directory named vendor, or a minified
// file. Everything else under game/ is an asset.
function isVendored(relPath) {
  const parts = relPath.split('/');
  if (parts.includes('vendor')) return true;
  return isMinified(parts[parts.length - 1]);
}

// --- Section: walking game/ ---

// Walk a directory recursively, returning the relative paths of every file
// (forward slashes) and the count of subdirectories, both sorted.
function walkDir(root, dir) {
  const files = [];
  let dirs = 0;
  const entries = readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1));
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      dirs += 1;
      const sub = walkDir(root, full);
      files.push(...sub.files);
      dirs += sub.dirs;
    } else if (e.isFile()) {
      files.push(relative(root, full).split(sep).join('/'));
    }
  }
  return { files, dirs };
}

// --- Section: load order ---

// The fence language for a source file, by extension.
function fenceLang(relPath) {
  const ext = extname(relPath).toLowerCase();
  if (ext === '.html') return 'html';
  if (ext === '.css') return 'css';
  if (ext === '.json') return 'json';
  if (ext === '.glsl' || ext === '.vert' || ext === '.frag') return 'glsl';
  if (ext === '.wgsl') return 'wgsl';
  return 'js';
}

// Static imports and re-exports: import ... from 'x', import 'x',
// export ... from 'x'. Dynamic import('x') is not followed here.
const IMPORT_RE = /(?:import\s+(?:[^'"]*?\s+from\s+)?|export\s+(?:[^'"]*?\s+from\s+)?)['"]([^'"]+)['"]/g;

// Resolve a specifier from a file: relative paths against the file's own
// directory, root-relative paths against game/, and bare specifiers
// through the import map. Returns a game/-relative path or null.
function resolveSpecifier(spec, fromRel, importMap) {
  const gameRoot = 'game';
  if (spec.startsWith('/')) {
    return gameRoot + spec;
  }
  if (spec.startsWith('./') || spec.startsWith('../')) {
    const base = dirname(fromRel);
    const parts = (base === '.' ? [] : base.split('/')).concat(spec.split('/'));
    const out = [];
    for (const p of parts) {
      if (p === '.' || p === '') continue;
      if (p === '..') out.pop();
      else out.push(p);
    }
    return out.join('/');
  }
  // A bare specifier: through the import map, if it maps it.
  if (importMap && Object.prototype.hasOwnProperty.call(importMap, spec)) {
    const mapped = importMap[spec];
    if (typeof mapped === 'string') {
      return resolveSpecifier(mapped, 'game/index.html', importMap);
    }
  }
  return null;
}

// Read index.html's import map (if any) and its script tags, then walk the
// module graph depth-first, in the order the page loads the scripts. The
// result is the source files in load order; anything not reached is listed
// afterwards by path.
function loadOrder(gameDir, sourcePaths) {
  const sourceSet = new Set(sourcePaths);
  const indexPath = join(gameDir, 'index.html');
  const ordered = [];
  const seen = new Set();
  if (!existsSync(indexPath)) return [...sourcePaths].sort();
  const html = readFileSync(indexPath, 'utf8');

  // The import map, if the page carries one.
  let importMap = {};
  const mapMatch = html.match(/<script[^>]*type=["']importmap["'][^>]*>([\s\S]*?)<\/script>/i);
  if (mapMatch) {
    try {
      const parsed = JSON.parse(mapMatch[1]);
      if (parsed && typeof parsed.imports === 'object') importMap = parsed.imports;
    } catch {
      importMap = {};
    }
  }

  // The scripts the page loads, in document order: a classic <script src>
  // where it stands, a module script followed by its imports.
  const scriptRe = /<script([^>]*)>([\s\S]*?)<\/script>/gi;
  const entryPoints = [];
  let m;
  while ((m = scriptRe.exec(html)) !== null) {
    const attrs = m[1];
    const srcMatch = attrs.match(/src=["']([^"']+)["']/i);
    const typeMatch = attrs.match(/type=["']([^"']+)["']/i);
    const type = typeMatch ? typeMatch[1].toLowerCase() : 'text/javascript';
    if (type === 'importmap') continue;
    if (srcMatch) {
      const resolved = resolveSpecifier(srcMatch[1], 'game/index.html', importMap);
      if (resolved) entryPoints.push({ path: resolved, module: type === 'module' });
    }
  }

  function visit(relPath) {
    if (!sourceSet.has(relPath) || seen.has(relPath)) return;
    seen.add(relPath);
    ordered.push(relPath);
    const full = join(gameDir, relative('game', relPath));
    if (!existsSync(full)) return;
    const code = readFileSync(full, 'utf8');
    IMPORT_RE.lastIndex = 0;
    let im;
    while ((im = IMPORT_RE.exec(code)) !== null) {
      const resolved = resolveSpecifier(im[1], relPath, importMap);
      if (resolved) visit(resolved);
    }
  }

  for (const ep of entryPoints) {
    if (ep.module) visit(ep.path);
    else if (sourceSet.has(ep.path) && !seen.has(ep.path)) {
      seen.add(ep.path);
      ordered.push(ep.path);
    }
  }
  // The rest, by path — but index.html always leads the dossier.
  const rest = [...sourcePaths].filter((p) => !seen.has(p)).sort();
  const indexFirst = rest.filter((p) => p === 'game/index.html');
  const restWithoutIndex = rest.filter((p) => p !== 'game/index.html');
  return [...indexFirst, ...ordered, ...restWithoutIndex];
}

// --- Section: the dossier text ---

function countLines(content) {
  if (content === '') return 0;
  const parts = content.split('\n');
  return content.endsWith('\n') ? parts.length - 1 : parts.length;
}

function sectionText(relPath, content) {
  const lines = countLines(content);
  const bytes = Buffer.byteLength(content, 'utf8');
  return {
    header: '### ' + relPath + ' (' + lines + ' lines, ' + bytes + ' bytes)',
    lang: fenceLang(relPath),
    content,
    bytes,
  };
}

// --- Section: buildDossier ---

export function buildDossier(outDir, options) {
  const opts = options || {};
  const textMax = opts.text_max_bytes || 163840;
  const gameDir = join(outDir, 'game');
  const shotsDir = join(outDir, 'screenshots');

  const { files, dirs } = walkDir(outDir, gameDir);
  const sources = [];
  const vendored = [];
  const assets = [];
  let totalBytes = 0;
  for (const rel of files) {
    const full = join(gameDir, relative('game', rel));
    const size = statSync(full).size;
    totalBytes += size;
    if (isSource(rel)) sources.push(rel);
    else if (isVendored(rel)) vendored.push(rel);
    else assets.push(rel);
  }
  sources.sort();
  vendored.sort();
  assets.sort();

  const sourceBytes = sources.reduce((sum, rel) => {
    return sum + statSync(join(gameDir, relative('game', rel))).size;
  }, 0);
  const vendoredBytes = vendored.reduce((sum, rel) => {
    return sum + statSync(join(gameDir, relative('game', rel))).size;
  }, 0);
  const assetBytes = assets.reduce((sum, rel) => {
    return sum + statSync(join(gameDir, relative('game', rel))).size;
  }, 0);

  // The Game block.
  const gameLines = [];
  gameLines.push('Source files: ' + sources.length + ' (' + sourceBytes + ' bytes)');
  gameLines.push('Vendored files: ' + vendored.length + ' (' + vendoredBytes + ' bytes)');
  for (const rel of vendored) {
    const size = statSync(join(gameDir, relative('game', rel))).size;
    gameLines.push('  ' + rel + ' (' + size + ' bytes)');
  }
  if (assets.length === 0) {
    gameLines.push('Assets: none');
  } else {
    gameLines.push('Assets: ' + assets.length + ' (' + assetBytes + ' bytes)');
    const byExt = new Map();
    for (const rel of assets) {
      const ext = extname(rel).toLowerCase() || '(none)';
      const size = statSync(join(gameDir, relative('game', rel))).size;
      const cur = byExt.get(ext) || { n: 0, bytes: 0 };
      cur.n += 1;
      cur.bytes += size;
      byExt.set(ext, cur);
    }
    for (const ext of [...byExt.keys()].sort()) {
      const cur = byExt.get(ext);
      gameLines.push('  ' + ext + ': ' + cur.n + ' (' + cur.bytes + ' bytes)');
    }
  }
  gameLines.push('Totals: ' + (files.length + dirs) + ' files and directories (' + totalBytes + ' bytes)');

  // The sources, in load order.
  const ordered = loadOrder(gameDir, sources);
  const sections = ordered.map((rel) => {
    const content = readFileSync(join(gameDir, relative('game', rel)), 'utf8');
    return sectionText(rel, content);
  });

  // Assemble the text, honouring the byte cap: every source that fits
  // goes in whole; the first that does not goes in up to its last line
  // that fits; a last line says how many whole files and bytes were left.
  const head = '## Game\n\n' + gameLines.join('\n') + '\n\n## Sources\n\n';
  let text = head;
  let omittedFiles = 0;
  let omittedBytes = 0;
  for (let i = 0; i < sections.length; i++) {
    const s = sections[i];
    const whole = s.header + '\n\n```' + s.lang + '\n' + s.content + '```\n';
    const joiner = text === head ? '' : '\n';
    if (Buffer.byteLength(text + joiner + whole, 'utf8') <= textMax) {
      text += joiner + whole;
      continue;
    }
    // This one does not fit whole: add as many complete lines as fit.
    const lines = s.content.split('\n');
    let kept = '';
    let keptLines = 0;
    for (let li = 0; li < lines.length; li++) {
      const line = lines[li] + (li < lines.length - 1 ? '\n' : '');
      const piece = s.header + '\n\n```' + s.lang + '\n' + kept + line + '```\n';
      if (Buffer.byteLength(text + joiner + piece, 'utf8') > textMax) break;
      kept += line;
      keptLines += 1;
    }
    if (keptLines > 0) {
      text += joiner + s.header + '\n\n```' + s.lang + '\n' + kept + '```\n';
    }
    // The rest of this file and every file after it is left out.
    omittedBytes += s.bytes - Buffer.byteLength(kept, 'utf8');
    omittedFiles += 1;
    for (let j = i + 1; j < sections.length; j++) {
      omittedFiles += 1;
      omittedBytes += sections[j].bytes;
    }
    break;
  }
  if (omittedFiles > 0) {
    text += '\n... ' + omittedFiles + ' more files (' + omittedBytes + ' bytes) omitted\n';
  }

  // The screenshots, by name: base64, media type, name and sha256.
  const images = [];
  if (existsSync(shotsDir)) {
    const names = readdirSync(shotsDir)
      .filter((n) => /\.(png|jpe?g)$/i.test(n))
      .sort();
    for (const name of names) {
      const full = join(shotsDir, name);
      if (!statSync(full).isFile()) continue;
      const buf = readFileSync(full);
      const ext = extname(name).toLowerCase();
      images.push({
        base64: buf.toString('base64'),
        media_type: ext === '.png' ? 'image/png' : 'image/jpeg',
        name,
        sha256: createHash('sha256').update(buf).digest('hex'),
      });
    }
  }

  const dossier = {
    cover: 0,
    images,
    schema: 'makefun/dossier/v1',
    text,
  };
  return JSON.stringify(dossier);
}
