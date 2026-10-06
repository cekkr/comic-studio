import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from '../server.mjs';

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
