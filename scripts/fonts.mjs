import { readFile, readdir, access } from 'node:fs/promises';
import path from 'node:path';

const formats = { '.ttf': 'truetype', '.otf': 'opentype', '.woff': 'woff', '.woff2': 'woff2' };
const reserved = new Set(['comic', 'sans', 'serif', 'mono', '__proto__', 'constructor', 'prototype']);

export async function discoverFonts(root) {
  let folders;
  try { folders = await readdir(root, { withFileTypes: true }); }
  catch (error) { if (error.code === 'ENOENT') return []; throw error; }
  const fonts = [], ids = new Set(), families = new Set();
  for (const folder of folders.sort((a, b) => a.name.localeCompare(b.name))) {
    if (!folder.isDirectory() || !/^[a-z0-9_-]+$/.test(folder.name)) continue;
    try {
      const manifest = JSON.parse(await readFile(path.join(root, folder.name, 'font.json'), 'utf8'));
      if (typeof manifest.id !== 'string' || !/^[a-z][a-z0-9_-]{0,63}$/.test(manifest.id) || reserved.has(manifest.id) || ids.has(manifest.id)) continue;
      if (typeof manifest.name !== 'string' || !manifest.name.trim() || manifest.name.length > 100) continue;
      if (typeof manifest.family !== 'string' || !/^[\p{L}\p{N} ._-]{1,100}$/u.test(manifest.family) || families.has(manifest.family)) continue;
      if (!Array.isArray(manifest.faces) || !manifest.faces.length || manifest.faces.length > 32) continue;
      const faces = [], variants = new Set();
      for (const face of manifest.faces) {
        if (typeof face.file !== 'string' || face.file !== path.basename(face.file) || face.file.startsWith('.') || /[\\/]/.test(face.file)) throw new Error('Invalid font filename');
        const format = formats[path.extname(face.file).toLowerCase()], weight = face.weight ?? 400, style = face.style ?? 'normal';
        const variant = `${weight}-${style}`;
        if (!format || !Number.isInteger(weight) || weight < 1 || weight > 1000 || !['normal', 'italic', 'oblique'].includes(style) || variants.has(variant)) throw new Error('Invalid font face');
        await access(path.join(root, folder.name, face.file));
        variants.add(variant); faces.push({ url: `/fonts/${folder.name}/${encodeURIComponent(face.file)}`, format, weight, style });
      }
      ids.add(manifest.id); families.add(manifest.family);
      fonts.push({ id: manifest.id, name: manifest.name, family: manifest.family, faces });
    } catch { /* Ignore incomplete imports until their manifest and files are ready. */ }
  }
  return fonts;
}

export function fontStylesheet(fonts) {
  return fonts.flatMap(font => font.faces.map(face =>
    `@font-face{font-family:${JSON.stringify(font.family)};src:url(${JSON.stringify(face.url)}) format(${JSON.stringify(face.format)});font-weight:${face.weight};font-style:${face.style};font-display:swap}`
  )).join('\n');
}
