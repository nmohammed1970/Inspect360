import { build } from 'esbuild';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const config = {
  entryPoints: ['server/index.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outdir: 'dist',
  packages: 'external',
  // Keep Vite dev middleware out of the production bundle entirely
  external: ['./vite', './vite.ts', 'vite', '../vite.config', '../vite.config.ts'],
  resolveExtensions: ['.ts', '.js', '.tsx', '.jsx', '.mjs', '.cjs'],
  mainFields: ['module', 'main'],
  conditions: ['import', 'node', 'default'],
  logLevel: 'info',
  target: 'node20',
  sourcemap: false,
  minify: false,
};

build(config).catch((error) => {
  console.error('Build failed:', error);
  process.exit(1);
});

