import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

async function sample(page) {
  await page.goto('/'); await page.getByRole('button', { name: 'Try the sample canvas' }).click();
  await expect(page.locator('.comic-text')).toHaveCount(2);
  await expect(page.locator('#document-name')).toHaveText('a-good-day.png');
}
async function savedProject(page) {
  const promise = page.waitForEvent('download'); await page.getByRole('button', { name: 'Save project' }).click();
  return JSON.parse(await readFile(await (await promise).path(), 'utf8'));
}
async function exportImage(page, format = 'png') {
  await page.getByRole('button', { name: 'Export image' }).click();
  await page.locator('#export-format').selectOption(format);
  const promise = page.waitForEvent('download'); await page.getByRole('button', { name: 'Download image' }).click();
  return await promise;
}
function watchErrors(page) { const errors = []; page.on('pageerror', error => errors.push(error.message)); return errors; }

test('all balloon styles, effects, tails, and original resolution exports work', async ({ page }) => {
  const errors = watchErrors(page); await sample(page);
  await expect(page.locator('.style-card')).toHaveCount(10);
  await page.locator('#text').fill('A new adventure!');
  for (const style of ['thought', 'shout', 'ellipse', 'pointedArcs', 'circle', 'caption', 'caption-withTail', 'rectangle', 'none', 'speech']) {
    await page.locator('#style').selectOption(style);
    await expect(page.locator('.comic-text').last()).toHaveAttribute('data-bubble', new RegExp(`\x60style\x60:\x60${style}\x60`));
  }
  await page.locator('#fill-mode').selectOption('gradient');
  await page.locator('#add-color').click();
  await page.locator('#outer-border').check(); await page.locator('#shadow').fill('8');
  await page.locator('#add-tail').click(); await expect(page.locator('#tail-index option')).toHaveCount(2);
  await page.locator('#auto-curve').uncheck(); await page.locator('#mid-x').fill('600');
  await page.locator('#bold').click(); await page.locator('#italic').click();
  const saved = await savedProject(page); const b = saved.balloons[1];
  expect(b.text).toBe('A new adventure!'); expect(b.spec.backgroundColors).toHaveLength(3); expect(b.spec.shadowOffset).toBe(8);
  expect(b.spec.outerBorderColor).toBeTruthy(); expect(b.spec.tails).toHaveLength(2); expect(b.spec.tails[1].autoCurve).toBe(false); expect(Math.abs(b.spec.tails[1].midpointX - 600)).toBeLessThan(2);
  const download = await exportImage(page);
  const png = await readFile(await download.path()); expect(png.readUInt32BE(16)).toBe(1200); expect(png.readUInt32BE(20)).toBe(850);
  await download.saveAs('test-results/export.png');
  expect(download.suggestedFilename()).toBe('a-good-day-comic.png');
  await expect(page.locator('#stage canvas')).toHaveCount(1); await expect(page.locator('#selection')).toBeVisible();
  await page.screenshot({ path: 'test-results/editor.png' }); expect(errors).toEqual([]);
});

test('drag, resize, tail handles, text editing, and undo/redo persist', async ({ page }) => {
  const errors = watchErrors(page); await sample(page);
  const before = await savedProject(page); const target = page.locator('.comic-text').last(); const box = await target.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down(); await page.mouse.move(box.x + box.width / 2 + 55, box.y + box.height / 2 + 35, { steps: 8 }); await page.mouse.up();
  const moved = await savedProject(page); expect(moved.balloons[1].x).toBeGreaterThan(before.balloons[1].x + 20);
  const handle = await page.locator('#resize-handle').boundingBox(); await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2); await page.mouse.down(); await page.mouse.move(handle.x + 30, handle.y + 20, { steps: 5 }); await page.mouse.up();
  const resized = await savedProject(page); expect(resized.balloons[1].width).toBeGreaterThan(moved.balloons[1].width);
  await page.getByRole('button', { name: 'Undo', exact: true }).click(); await expect.poll(async () => (await savedProject(page)).balloons[1].width).toBe(moved.balloons[1].width);
  await page.getByRole('button', { name: 'Redo', exact: true }).click(); await expect.poll(async () => (await savedProject(page)).balloons[1].width).toBe(resized.balloons[1].width);
  const tailBefore = (await savedProject(page)).balloons[1].spec.tails[0];
  const stage = await page.locator('#stage').boundingBox(); const scale = stage.width / 1200;
  await page.mouse.move(stage.x + tailBefore.tipX * scale, stage.y + tailBefore.tipY * scale); await page.mouse.down(); await page.mouse.move(stage.x + (tailBefore.tipX + 50) * scale, stage.y + (tailBefore.tipY + 45) * scale, { steps: 8 }); await page.mouse.up();
  const tailAfter = (await savedProject(page)).balloons[1].spec.tails[0]; expect(tailAfter.tipX).toBeGreaterThan(tailBefore.tipX + 20);
  await target.dblclick(); await expect(target).toHaveAttribute('contenteditable', 'true'); await page.keyboard.type('Hello from the canvas'); await page.keyboard.press('Escape');
  await expect(page.locator('#text')).toHaveValue('Hello from the canvas'); expect(errors).toEqual([]);
});

test('connected families, deletion, project save/reopen, and invalid imports', async ({ page }) => {
  const errors = watchErrors(page); await sample(page);
  await page.getByText('Position & connections', { exact: true }).click(); await page.locator('#link-previous').click();
  const saved = await savedProject(page); expect(saved.balloons[1].spec.level).toBe(saved.balloons[0].spec.level); expect(saved.balloons[1].spec.order).toBe(2); expect(saved.balloons[1].spec.tails[0].joiner).toBe(true);
  await page.locator('.balloon-item').first().click(); await page.locator('#delete').click(); await expect(page.locator('.comic-text')).toHaveCount(1);
  await page.locator('#undo').click(); await expect(page.locator('.comic-text')).toHaveCount(2);
  await page.locator('#project-file').setInputFiles({ name: 'saved.comic.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(saved)) }); await expect(page.locator('#toast')).toContainText('Project opened');
  expect(await savedProject(page)).toEqual(saved);
  await page.locator('#project-file').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{"version":9}') }); await expect(page.locator('#toast')).toContainText('not a Comic Studio project'); await expect(page.locator('.comic-text')).toHaveCount(2);
  expect(errors).toEqual([]);
});

test('local upload, transparent image, JPEG and WebP export', async ({ page }) => {
  const errors = watchErrors(page); await page.goto('/');
  const data = await page.evaluate(() => { const c = document.createElement('canvas'); c.width = 640; c.height = 480; const ctx = c.getContext('2d'); ctx.fillStyle = '#d8e4d0'; ctx.fillRect(0, 200, 640, 280); return c.toDataURL('image/png').split(',')[1]; });
  await page.locator('#image-file').setInputFiles({ name: 'local.png', mimeType: 'image/png', buffer: Buffer.from(data, 'base64') });
  await expect(page.locator('#document-name')).toHaveText('local.png'); await page.getByRole('button', { name: 'Caption', exact: true }).click();
  await page.locator('#corner-x').fill('15'); await page.locator('#corner-y').fill('20');
  for (const format of ['png', 'jpeg', 'webp']) {
    const download = await exportImage(page, format); expect(download.suggestedFilename()).toBe(`local-comic.${format}`);
    const bytes = await readFile(await download.path());
    const decoded = await page.evaluate(async ({ data, format }) => {
      const img = new Image(); img.src = `data:image/${format};base64,${data}`; await img.decode();
      const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0);
      const region = ctx.getImageData(120, 78, 150, 55).data; let ink = 0, orange = 0;
      for (let i = 0; i < region.length; i += 4) {
        if (region[i] < 90 && region[i + 1] < 90 && region[i + 2] < 90 && region[i + 3] > 200) ink++;
      }
      const pixels = ctx.getImageData(0, 0, c.width, c.height).data;
      for (let i = 0; i < pixels.length; i += 4) if (pixels[i] === 255 && pixels[i + 1] === 165 && pixels[i + 2] === 0 && pixels[i + 3] === 255) orange++;
      return { width: img.width, height: img.height, alpha: ctx.getImageData(0, 0, 1, 1).data[3], background: Array.from(ctx.getImageData(20, 400, 1, 1).data), ink, orange };
    }, { data: bytes.toString('base64'), format });
    expect(decoded.width).toBe(640); expect(decoded.height).toBe(480); expect(decoded.alpha).toBe(format === 'jpeg' ? 255 : 0);
    expect(decoded.background[3]).toBe(255); expect(decoded.background[0]).toBeGreaterThan(200); expect(decoded.background[0]).toBeLessThan(230); expect(decoded.ink).toBeGreaterThan(100); expect(decoded.orange).toBe(0);
  }
  await page.locator('#delete').click(); await expect(page.locator('.comic-text')).toHaveCount(0); const download = await exportImage(page); expect((await readFile(await download.path())).length).toBeGreaterThan(100);
  expect(errors).toEqual([]);
});
