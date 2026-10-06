import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from '../server.mjs';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

test('server serves the editor locally and rejects mutations and traversal', async () => {
  const server = createServer(); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const page = await fetch(base); assert.equal(page.status, 200); assert.match(await page.text(), /Comic Studio/);
    assert.equal((await fetch(`${base}/styles.css`, { method: 'HEAD' })).status, 200);
    assert.equal((await fetch(`${base}/missing`)).status, 404);
    assert.equal((await fetch(base, { method: 'POST' })).status, 405);
    assert.equal((await fetch(`${base}/%2e%2e%2fpackage.json`)).status, 403);
    assert.equal((await fetch(`${base}/.git/config`)).status, 403);
  } finally { await new Promise(resolve => server.close(resolve)); }
});

test('font imports are discovered on refresh, served with font MIME types, and contained in the font folder', async () => {
  const fontsRoot = await mkdtemp(path.join(tmpdir(), 'comic-fonts-'));
  const folder = path.join(fontsRoot, 'fixture'); await mkdir(folder);
  await writeFile(path.join(folder, 'regular.ttf'), 'regular font fixture');
  const server = createServer({ fontsRoot }); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    assert.deepEqual(await (await fetch(`${base}/fonts/catalog.json`)).json(), { fonts: [] });
    await writeFile(path.join(folder, 'font.json'), JSON.stringify({ id: 'fixture-font', name: 'Fixture Font', family: 'Fixture Font', faces: [{ file: 'regular.ttf' }] }));
    const catalog = await (await fetch(`${base}/fonts/catalog.json`)).json(); assert.equal(catalog.fonts[0].id, 'fixture-font');
    assert.match(await (await fetch(`${base}/fonts/fonts.css`)).text(), /font-family:"Fixture Font"/);
    const font = await fetch(`${base}/fonts/fixture/regular.ttf`);
    assert.equal(font.status, 200); assert.equal(font.headers.get('content-type'), 'font/ttf'); assert.equal(await font.text(), 'regular font fixture');
    assert.equal((await fetch(`${base}/fonts/fixture/regular.ttf`, { method: 'HEAD' })).status, 200);
    assert.equal((await fetch(`${base}/fonts/fixture/missing.ttf`)).status, 404);
    assert.equal((await fetch(`${base}/fonts/fixture/%2e%2e%2f%2e%2e%2fpackage.json`)).status, 403);
    await writeFile(path.join(folder, 'font.json'), JSON.stringify({ id: 'fixture-font', name: 'Fixture Font', family: 'Fixture Font', faces: [{ file: '../outside.ttf' }] }));
    assert.deepEqual(await (await fetch(`${base}/fonts/catalog.json`)).json(), { fonts: [] });
  } finally { await new Promise(resolve => server.close(resolve)); await rm(fontsRoot, { recursive: true }); }
});
