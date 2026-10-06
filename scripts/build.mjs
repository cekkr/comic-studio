import { build } from 'esbuild';
import { access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

export async function buildClient() {
  try {
    await access(new URL('../vendor/comical-js/src/index.ts', import.meta.url));
  } catch {
    throw new Error('Comical submodule is missing. Run: git submodule update --init --recursive');
  }
  await build({
    entryPoints: [fileURLToPath(new URL('../src/app.ts', import.meta.url))],
    outfile: fileURLToPath(new URL('../public/app.js', import.meta.url)),
    bundle: true,
    platform: 'browser',
    target: ['es2022'],
    sourcemap: true,
    define: { 'process.env.NODE_ENV': '"production"' },
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await buildClient();
  console.log('Built public/app.js from the Comical submodule.');
}
