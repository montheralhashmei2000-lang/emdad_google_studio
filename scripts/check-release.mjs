#!/usr/bin/env node
// Release Gate Verification Script: verifies APP_VERSION parity, PWA dist artifacts, and writes dist/SHA256SUMS.txt
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const versionFile = fs.readFileSync(path.join(root, 'src/core/appVersion.ts'), 'utf8');
const match = versionFile.match(/APP_VERSION\s*=\s*['"]([^'"]+)['"]/);

if (!match || match[1] !== pkg.version) {
  console.error(`Version mismatch: package.json=${pkg.version}, src/core/appVersion.ts=${match?.[1]}`);
  process.exit(1);
}

const distDir = path.join(root, 'dist');
if (!fs.existsSync(distDir)) {
  console.error('dist/ directory missing. Run `npm run build` first.');
  process.exit(1);
}

const requiredFiles = ['index.html', 'manifest.webmanifest', 'sw.js'];
for (const req of requiredFiles) {
  if (!fs.existsSync(path.join(distDir, req))) {
    console.error(`Missing release artifact: dist/${req}`);
    process.exit(1);
  }
}

function walk(dir) {
  const res = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) res.push(...walk(p));
    else if (e.name !== 'SHA256SUMS.txt') res.push(p);
  }
  return res.sort();
}

const sums = walk(distDir).map((f) => {
  const rel = path.relative(distDir, f);
  const hash = createHash('sha256').update(fs.readFileSync(f)).digest('hex');
  return `${hash}  ${rel}`;
});

fs.writeFileSync(path.join(distDir, 'SHA256SUMS.txt'), sums.join('\n') + '\n', 'utf8');
console.log(`Release v${pkg.version} verified (${sums.length} files hashed in dist/SHA256SUMS.txt).`);
