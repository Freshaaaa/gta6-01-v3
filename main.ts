// Solmar Bay 3D — hand-in program (Node 22, standard library only).
// The game is the plain static files in game/ beside this file (plus the
// screenshots/ the maker took). This program copies both into the output
// directory and writes dossier.json with the vendored make.fun library,
// so the sealed scorer can judge the entry. Outside the grader's
// container, MAKEFUN_OUTPUT_DIR stands in for /output:
//
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
//
// The dossier caps below are the scorer's own (reference/gate.json): only
// text_max_bytes shapes the dossier bytes; the rest refuse an entry the
// scorer would refuse anyway (more than 4 screenshots, one over 256 KiB,
// more than 993 game files or 48 MiB of game files, a game path over
// 1000 bytes). Keep the game small and the screenshots few.

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const repoRoot = fileURLToPath(new URL('.', import.meta.url));
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

function copyTree(srcName) {
  const src = join(repoRoot, srcName);
  const dst = join(outputDir, srcName);
  if (!existsSync(src)) return false;
  mkdirSync(dst, { recursive: true });
  cpSync(src, dst, { recursive: true });
  return true;
}

mkdirSync(outputDir, { recursive: true });
copyTree('game');
copyTree('screenshots');

const dossier = buildDossier(outputDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});
writeFileSync(join(outputDir, 'dossier.json'), dossier);
console.log(`Solmar Bay 3D handed in: ${outputDir} (dossier ${dossier.length} bytes)`);
