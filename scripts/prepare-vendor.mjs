#!/usr/bin/env node
import { mkdir, copyFile, stat } from 'fs/promises';
import { fileURLToPath } from 'url';
import path from 'path';
import { build } from 'esbuild';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const vendorDir = path.join(projectRoot, 'web', 'vendor');

const assets = [
  {
    package: 'mermaid',
    source: ['dist', 'mermaid.min.js'],
    target: 'mermaid.min.js'
  },
  {
    package: 'marked',
    source: ['marked.min.js'],
    target: 'marked.min.js'
  },
  {
    package: 'dompurify',
    source: ['dist', 'purify.min.js'],
    target: 'dompurify.min.js'
  },
];

const styles = [
  {
    package: 'highlight.js',
    source: ['styles', 'github.min.css'],
    target: 'highlight-github.min.css'
  }
];

async function resolvePath(pkg, segments) {
  const pkgPath = path.join(projectRoot, 'node_modules', pkg, ...segments);
  await stat(pkgPath);
  return pkgPath;
}

async function copyAsset(entry) {
  try {
    const sourcePath = await resolvePath(entry.package, entry.source);
    const targetPath = path.join(vendorDir, entry.target);
    await copyFile(sourcePath, targetPath);
    console.log(`Copied ${entry.package} -> ${entry.target}`);
  } catch (error) {
    console.warn(`Skipping ${entry.package}: ${error.message}`);
  }
}

async function main() {
  await mkdir(vendorDir, { recursive: true });
  await Promise.all(assets.map(copyAsset));
  await Promise.all(styles.map(copyAsset));
  await buildHighlight();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function buildHighlight() {
  const entry = path.join(projectRoot, 'scripts', 'highlight-entry.mjs');
  const targetPath = path.join(vendorDir, 'highlight.min.js');
  try {
    await build({
      entryPoints: [entry],
      bundle: true,
      minify: true,
      format: 'iife',
      platform: 'browser',
      target: ['es2020'],
      outfile: targetPath,
      sourcemap: false,
      globalName: 'hljs'
    });
    console.log('Bundled highlight.js -> highlight.min.js');
  } catch (error) {
    console.warn(`Highlight build failed: ${error.message}`);
  }
}
