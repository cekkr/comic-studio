export const styles = [
  ['speech', 'Speech'], ['thought', 'Thought'], ['shout', 'Shout'], ['ellipse', 'Ellipse'],
  ['pointedArcs', 'Burst'], ['circle', 'Circle'], ['caption', 'Caption'],
  ['caption-withTail', 'Caption + tail'], ['rectangle', 'Rectangle'], ['none', 'Text only'],
];
export const fonts = {
  comic: '"Comic Sans MS", "Comic Sans", "Chalkboard SE", cursive',
  sans: 'Arial, Helvetica, sans-serif', serif: 'Georgia, "Times New Roman", serif',
  mono: '"Courier New", monospace',
};
export function registerFonts(catalog) {
  for (const font of catalog) {
    if (typeof font.id === 'string' && typeof font.family === 'string' && /^[a-z][a-z0-9_-]{0,63}$/.test(font.id) && !['__proto__', 'constructor', 'prototype'].includes(font.id) && !Object.hasOwn(fonts, font.id)) {
      fonts[font.id] = `${JSON.stringify(font.family)}, ${fonts.comic}`;
    }
  }
}
export const MAX_PIXELS = 32_000_000;
export const MAX_DIMENSION = 8192;
const finite = (n, min, max) => typeof n === 'number' && Number.isFinite(n) && n >= min && n <= max;
const color = (s) => typeof s === 'string' && (/^#[\da-f]{6}$/i.test(s) || s === 'transparent');
function requireValue(ok, message) { if (!ok) throw new Error(message); }

export function validateProject(data) {
  requireValue(data && data.version === 1 && data.image, 'This is not a Comic Studio project.');
  const image = data.image;
  requireValue(typeof image.src === 'string' && /^data:image\/(png|jpeg|webp|gif|avif|bmp);base64,/.test(image.src), 'Project image must be an embedded raster image.');
  requireValue(image.src.length <= 50_000_000, 'The embedded image is too large.');
  requireValue(typeof image.name === 'string' && image.name.length <= 255, 'Invalid image name.');
  requireValue(finite(image.width, 1, MAX_DIMENSION) && finite(image.height, 1, MAX_DIMENSION) && Number.isInteger(image.width) && Number.isInteger(image.height) && image.width * image.height <= MAX_PIXELS, 'Image exceeds the supported dimensions.');
  requireValue(Array.isArray(data.balloons) && data.balloons.length <= 100, 'Projects support up to 100 balloons.');
  const ids = new Set();
  for (const b of data.balloons) {
    requireValue(typeof b.id === 'string' && b.id.length < 100 && !ids.has(b.id), 'Invalid balloon identifier.'); ids.add(b.id);
    requireValue(typeof b.text === 'string' && b.text.length <= 10000, 'Balloon text is too long.');
    for (const key of ['x', 'y']) requireValue(finite(b[key], -MAX_DIMENSION, MAX_DIMENSION * 2), 'Invalid balloon position.');
    for (const key of ['width', 'height']) requireValue(finite(b[key], 20, MAX_DIMENSION), 'Invalid balloon size.');
    requireValue(Object.hasOwn(fonts, b.fontFamily) && finite(b.fontSize, 6, 300) && color(b.textColor), 'Invalid text style.');
    requireValue(['left', 'center', 'right'].includes(b.align) && typeof b.bold === 'boolean' && typeof b.italic === 'boolean', 'Invalid text formatting.');
    const s = b.spec;
    requireValue(s && s.version === '1.0' && styles.some(([name]) => name === s.style), 'Unsupported balloon style.');
    requireValue(finite(s.level, 1, 999) && Number.isInteger(s.level) && (s.order === undefined || (finite(s.order, 0, 999) && Number.isInteger(s.order))), 'Invalid balloon family.');
    requireValue(s.shadowOffset === undefined || finite(s.shadowOffset, 0, 100), 'Invalid shadow.');
    requireValue(s.outerBorderColor === undefined || color(s.outerBorderColor), 'Invalid outline color.');
    for (const key of ['cornerRadiusX', 'cornerRadiusY']) requireValue(s[key] === undefined || finite(s[key], 0, 300), 'Invalid corner radius.');
    requireValue(s.backgroundColors === undefined || (Array.isArray(s.backgroundColors) && s.backgroundColors.length >= 1 && s.backgroundColors.length <= 8 && s.backgroundColors.every(color)), 'Invalid fill colors.');
    requireValue(Array.isArray(s.tails) && s.tails.length <= 8, 'A balloon supports up to 8 tails.');
    for (const tail of s.tails) {
      for (const key of ['tipX', 'tipY', 'midpointX', 'midpointY']) requireValue(finite(tail[key], -MAX_DIMENSION, MAX_DIMENSION * 2), 'Invalid tail coordinates.');
      for (const key of ['autoCurve', 'joiner']) requireValue(tail[key] === undefined || typeof tail[key] === 'boolean', 'Invalid tail settings.');
    }
  }
  return structuredClone({ version: 1, image, balloons: data.balloons });
}

export function clamp(value, min, max) { return Math.min(max, Math.max(min, value)); }

export class History {
  entries = [];
  index = -1;
  push(snapshot) {
    const current = this.entries[this.index];
    const key = JSON.stringify(snapshot.balloons);
    if (key === current?.key && snapshot.image?.src === current?.image?.src && snapshot.image?.name === current?.image?.name) return;
    this.entries.splice(this.index + 1);
    // Share the immutable image string between steps; do not serialize a photo 50 times.
    this.entries.push({ image: snapshot.image ? { ...snapshot.image } : null, balloons: structuredClone(snapshot.balloons), key });
    if (this.entries.length > 50) this.entries.shift();
    this.index = this.entries.length - 1;
  }
  get canUndo() { return this.index > 0; }
  get canRedo() { return this.index < this.entries.length - 1; }
  snapshot(index) { const entry = this.entries[index]; return { version: 1, image: entry.image ? { ...entry.image } : null, balloons: structuredClone(entry.balloons) }; }
  undo() { if (this.canUndo) return this.snapshot(--this.index); }
  redo() { if (this.canRedo) return this.snapshot(++this.index); }
}
