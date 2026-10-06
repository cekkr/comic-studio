import test from 'node:test';
import assert from 'node:assert/strict';
import { History, validateProject, textSettings } from '../src/model.mjs';

const project = () => ({ version: 1, image: { src: 'data:image/png;base64,abc', name: 'test.png', width: 1200, height: 850 }, balloons: [{ id: 'test-id', text: 'Hello!', x: 20, y: 30, width: 200, height: 100, fontFamily: 'comic', fontSize: 28, textColor: '#123456', align: 'center', bold: false, italic: false, spec: { version: '1.0', style: 'speech', level: 1, tails: [{ tipX: 40, tipY: 200, midpointX: 30, midpointY: 170, autoCurve: false }], backgroundColors: ['#ffffff', '#dddddd'] } }] });

test('valid projects retain manual tail curves, fill stops, and text', () => {
  const source = project(); const validated = validateProject(source);
  assert.deepEqual(validated, source); validated.balloons[0].text = 'Changed'; assert.equal(source.balloons[0].text, 'Hello!');
});
test('project imports reject external images, malformed styles and oversized content', () => {
  for (const modify of [p => p.image.src = 'https://example.org/photo.png', p => p.image.width = 99999, p => p.balloons[0].spec.style = 'invalid', p => p.balloons[0].spec.tails[0].tipX = NaN, p => p.balloons[0].text = 'x'.repeat(10001), p => p.balloons.push(p.balloons[0]), p => p.balloons[0].fontFamily = '__proto__']) {
    const p = project(); modify(p); assert.throws(() => validateProject(p));
  }
});
test('history handles branching and returns independent editable state', () => {
  const h = new History(), p = project(); h.push(p); p.balloons[0].text = 'Second'; h.push(p); h.push(p);
  assert.equal(h.entries.length, 2); const first = h.undo(); assert.equal(first.balloons[0].text, 'Hello!'); first.balloons[0].text = 'New branch';
  assert.equal(h.redo().balloons[0].text, 'Second'); h.undo(); h.push(first); assert.equal(h.canRedo, false); assert.equal(h.entries.length, 2);
});

test('remembered text settings retain typography without storing dialogue or image data', () => {
  const b = project().balloons[0];
  assert.deepEqual(textSettings(b), { fontFamily: 'comic', fontSize: 28, textColor: '#123456', align: 'center', bold: false, italic: false });
  for (const invalid of [null, {}, { ...b, fontSize: -1 }, { ...b, fontSize: Infinity }, { ...b, textColor: 'invalid' }, { ...b, fontFamily: '__proto__' }, { ...b, bold: 'yes' }]) assert.equal(textSettings(invalid), null);
  assert.equal(textSettings({ ...b, fontFamily: 'anime-ace' }).fontFamily, 'anime-ace');
});
