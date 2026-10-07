// Copies the 4x3 SVG flags shipped by the "flag-icons" package into
// public/flags/ so the Vite app can reference them as plain static
// assets (/flags/{code}.svg) without importing them through the bundler.
// Runs automatically after `npm install` (see package.json "postinstall"),
// but can also be run manually with: node scripts/copy-flags.mjs
import { existsSync, mkdirSync, readdirSync, copyFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

const srcDir = path.join(projectRoot, 'node_modules', 'flag-icons', 'flags', '4x3');
const destDir = path.join(projectRoot, 'public', 'flags');

function main() {
  if (!existsSync(srcDir)) {
    console.warn(
      `[copy-flags] Source directory not found: ${srcDir}\n` +
      `[copy-flags] Did "flag-icons" install correctly? Skipping flag copy.`
    );
    return;
  }

  mkdirSync(destDir, { recursive: true });

  const files = readdirSync(srcDir).filter((f) => f.endsWith('.svg'));
  let copied = 0;
  for (const file of files) {
    copyFileSync(path.join(srcDir, file), path.join(destDir, file));
    copied++;
  }

  console.log(`[copy-flags] Copied ${copied} flag SVGs to ${path.relative(projectRoot, destDir)}/`);
}

main();
